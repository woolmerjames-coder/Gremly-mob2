-- Notifications: planning (notification-revamp-10.1)
-- Applied to production as version 20261002002053.
--
-- The worker's minute cron plans reminders and each person's day without
-- any secret in the database: it reads what needs planning through the two
-- functions below and sends the Inngest events itself.

-- ─── Reminders: planned, then queued ───────────────────────────────────────
-- planned_at null means the next fire time needs working out (the item
-- changed, or the last one fired); queued_for is the fire time an Inngest run
-- is already waiting for.
alter table public.reminder_schedule add column if not exists planned_at timestamptz;
alter table public.reminder_schedule add column if not exists queued_for timestamptz;
create index if not exists reminder_schedule_to_plan
  on public.reminder_schedule (status, planned_at) where planned_at is null;
create index if not exists reminder_schedule_to_queue
  on public.reminder_schedule (status, next_fire_at) where next_fire_at is not null;

create or replace function public.sync_reminder_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := case tg_table_name
    when 'todos' then 'todo' when 'habits' then 'habit'
    when 'notes' then 'note' when 'people' then 'person' end;
  v_new jsonb;
  v_reminders jsonb;
  v_closed boolean;
  v_ids text[];
begin
  if tg_op = 'DELETE' then
    update reminder_schedule
       set status = 'removed', next_fire_at = null, planned_at = now(), updated_at = now()
     where entity_type = v_type and entity_id = old.id and status <> 'removed';
    return old;
  end if;

  v_new := to_jsonb(new);
  -- an item without an owner has nobody to remind
  if v_new ->> 'owner_id' is null then
    return new;
  end if;
  v_reminders := case when jsonb_typeof(v_new -> 'reminders_json') = 'array'
                      then v_new -> 'reminders_json' else '[]'::jsonb end;
  v_closed := coalesce((v_new ->> 'archived')::boolean, false)
              or (v_type in ('todo', 'habit') and v_new ->> 'completed_at' is not null);

  select coalesce(array_agg(r ->> 'id'), '{}')
    into v_ids
    from jsonb_array_elements(v_reminders) r
   where r ->> 'id' is not null;

  -- reminders no longer on the item
  update reminder_schedule
     set status = 'removed', next_fire_at = null, planned_at = now(), updated_at = now()
   where entity_type = v_type and entity_id = new.id
     and status <> 'removed' and not (reminder_id = any (v_ids));

  -- current reminders; anything relevant changed, so each is planned again
  insert into reminder_schedule (user_id, entity_type, entity_id, reminder_id, rule, status,
                                 next_fire_at, planned_at, queued_for, updated_at)
  select (v_new ->> 'owner_id')::uuid, v_type, new.id, r ->> 'id', r,
         case when v_closed then 'closed' else 'active' end, null, null, null, now()
    from jsonb_array_elements(v_reminders) r
   where r ->> 'id' is not null
  on conflict (entity_type, entity_id, reminder_id) do update set
    user_id = excluded.user_id,
    rule = excluded.rule,
    status = excluded.status,
    next_fire_at = null,
    planned_at = null,
    queued_for = null,
    updated_at = now();

  return new;
end;
$$;

-- Reminders due within the window that no run is waiting for yet.
create or replace function public.reminders_to_queue(p_until timestamptz, p_limit integer default 200)
returns setof public.reminder_schedule
language sql
stable
security definer
set search_path = public
as $$
  select *
    from reminder_schedule
   where status = 'active'
     and next_fire_at is not null
     and next_fire_at <= p_until
     and queued_for is distinct from next_fire_at
   order by next_fire_at
   limit p_limit;
$$;
revoke all on function public.reminders_to_queue(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.reminders_to_queue(timestamptz, integer) to service_role;

-- ─── Each person's day ─────────────────────────────────────────────────────
alter table public.user_engagement add column if not exists plan_date date;
alter table public.user_engagement add column if not exists planned_at timestamptz;
alter table public.user_engagement add column if not exists plan jsonb;
-- the local date they came back after being away; that day Gremly sends one
alter table public.user_engagement add column if not exists back_on date;
-- set by the database when a notification setting or the time zone changes, so today is planned again
alter table public.notification_preferences add column if not exists settings_changed_at timestamptz;

create or replace function public.notif_prefs_changed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.morning_enabled, new.morning_time, new.evening_enabled, new.evening_time, new.timezone,
      new.quiet_start, new.quiet_end, new.paused_until, new.checkins_enabled,
      new.habit_checkins_enabled, new.reminders_enabled, new.good_news_enabled)
     is distinct from
     (old.morning_enabled, old.morning_time, old.evening_enabled, old.evening_time, old.timezone,
      old.quiet_start, old.quiet_end, old.paused_until, old.checkins_enabled,
      old.habit_checkins_enabled, old.reminders_enabled, old.good_news_enabled) then
    new.settings_changed_at := now();
  end if;
  return new;
end;
$$;
create or replace trigger trg_notif_prefs_changed
  before update on public.notification_preferences
  for each row execute function public.notif_prefs_changed();

-- A time zone Postgres knows, or the app's default.
create or replace function public.notif_tz(p text)
returns text
language sql
stable
set search_path = public
as $$
  select case when p is not null and exists (select 1 from pg_timezone_names where name = p)
              then p else 'America/Los_Angeles' end;
$$;

-- People whose day needs planning: after 4am their time, not planned today,
-- or settings changed since the last plan. Claimed here, so each minute's
-- run takes a person once.
create or replace function public.claim_days_to_plan(p_limit integer default 100)
returns table (user_id uuid, timezone text, local_date date, settings_changed boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  with base as (
    select np.user_id as uid, public.notif_tz(np.timezone) as tz, np.settings_changed_at as changed_at
      from notification_preferences np
     where exists (
             select 1 from push_devices pd
              where pd.user_id = np.user_id and pd.disabled_at is null
                and pd.expo_token is not null and pd.permission in ('granted', 'provisional'))
  ), due as (
    select b.uid, b.tz, (now() at time zone b.tz)::date as d,
           (e.plan_date = (now() at time zone b.tz)::date) as same_day
      from base b
      left join user_engagement e on e.user_id = b.uid
     where (now() at time zone b.tz)::time >= time '04:00'
       and (e.plan_date is null
            or e.plan_date < (now() at time zone b.tz)::date
            or (b.changed_at is not null and b.changed_at > e.planned_at))
     limit p_limit
  ), claimed as (
    insert into user_engagement as e (user_id, plan_date, planned_at, updated_at)
    select due.uid, due.d, now(), now() from due
    on conflict (user_id) do update set plan_date = excluded.plan_date, planned_at = now(), updated_at = now()
    returning e.user_id as uid
  )
  select due.uid, due.tz, due.d, coalesce(due.same_day, false)
    from due join claimed on claimed.uid = due.uid;
end;
$$;
revoke all on function public.claim_days_to_plan(integer) from public, anon, authenticated;
grant execute on function public.claim_days_to_plan(integer) to service_role;

-- ─── Signing out switches this phone off for that person ────────────────────
create or replace function public.release_device(p_install_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update push_devices
     set disabled_at = coalesce(disabled_at, now()),
         disabled_reason = 'signed out',
         updated_at = now()
   where install_id = p_install_id and user_id = auth.uid();
$$;
revoke all on function public.release_device(text) from public, anon;
grant execute on function public.release_device(text) to authenticated;

-- Existing reminders get planned by the first cron run.
update public.reminder_schedule set planned_at = null, queued_for = null where status = 'active';
