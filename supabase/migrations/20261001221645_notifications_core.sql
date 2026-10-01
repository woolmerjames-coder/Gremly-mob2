-- Notifications rebuild, part 1: devices, the notification log, settings,
-- engagement, and one schedule for every reminder on every kind of item.
-- Additive only. The old Cloudflare notifications worker keeps working on
-- push_tokens and the *_last_sent columns until the cutover migration.

-- ─── Devices ────────────────────────────────────────────────────────────────
-- One row per app install (not per person), so a dev build and TestFlight live
-- side by side. A row exists even when permission is denied, so the server can
-- tell "never asked" from "said no" from "working".
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  install_id text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_token text unique,
  apns_token text,
  platform text not null check (platform in ('ios', 'android')),
  environment text check (environment in ('development', 'production')),
  app_version text,
  build_number text,
  permission text not null check (permission in ('granted', 'provisional', 'denied', 'undetermined')),
  time_sensitive boolean,
  timezone text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text,
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;
drop policy if exists push_devices_select_own on public.push_devices;
create policy push_devices_select_own on public.push_devices for select using (auth.uid() = user_id);
comment on table public.push_devices is
  'Notifications: one row per app install. Written only through register_device; healthy = expo_token set, not disabled, permission granted or provisional.';

-- The app calls this on every launch and every return to the foreground.
create or replace function public.register_device(p jsonb)
returns public.push_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_install text := nullif(p ->> 'install_id', '');
  v_token text := nullif(p ->> 'expo_token', '');
  v_perm text := coalesce(nullif(p ->> 'permission', ''), 'undetermined');
  v_row public.push_devices;
begin
  if uid is null then
    raise exception 'register_device: not signed in';
  end if;
  if v_install is null then
    raise exception 'register_device: install_id is required';
  end if;

  -- A token belongs to one install. If another install held it, that install
  -- is stale (reinstall, or a different person signed in on this phone).
  if v_token is not null then
    update push_devices
       set expo_token = null,
           disabled_at = coalesce(disabled_at, now()),
           disabled_reason = 'token moved to another install',
           updated_at = now()
     where expo_token = v_token and install_id <> v_install;
  end if;

  insert into push_devices (
    install_id, user_id, expo_token, apns_token, platform, environment,
    app_version, build_number, permission, time_sensitive, timezone, last_seen_at, updated_at
  ) values (
    v_install, uid, v_token, nullif(p ->> 'apns_token', ''),
    coalesce(nullif(p ->> 'platform', ''), 'ios'), nullif(p ->> 'environment', ''),
    nullif(p ->> 'app_version', ''), nullif(p ->> 'build_number', ''), v_perm,
    (p ->> 'time_sensitive')::boolean, nullif(p ->> 'timezone', ''), now(), now()
  )
  on conflict (install_id) do update set
    user_id = excluded.user_id,
    expo_token = excluded.expo_token,
    apns_token = coalesce(excluded.apns_token, push_devices.apns_token),
    platform = excluded.platform,
    environment = coalesce(excluded.environment, push_devices.environment),
    app_version = excluded.app_version,
    build_number = excluded.build_number,
    permission = excluded.permission,
    time_sensitive = excluded.time_sensitive,
    timezone = coalesce(excluded.timezone, push_devices.timezone),
    last_seen_at = now(),
    -- a fresh token with permission brings a switched off install back
    disabled_at = case
      when excluded.expo_token is not null and excluded.permission in ('granted', 'provisional') then null
      else push_devices.disabled_at end,
    disabled_reason = case
      when excluded.expo_token is not null and excluded.permission in ('granted', 'provisional') then null
      else push_devices.disabled_reason end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public.register_device(jsonb) from public, anon;
grant execute on function public.register_device(jsonb) to authenticated;

-- The two tokens saved by the old system come across; their first receipt
-- switches them off if they are dead.
insert into public.push_devices (install_id, user_id, expo_token, platform, permission, first_seen_at, last_seen_at)
select 'legacy-' || pt.id::text, pt.user_id, pt.token, coalesce(pt.platform, 'ios'), 'granted',
       coalesce(pt.created_at, now()), coalesce(pt.updated_at, now())
  from public.push_tokens pt
 where pt.token is not null
on conflict do nothing;

-- ─── Settings ───────────────────────────────────────────────────────────────
-- morning_* is the daily brief (the brief writer reads morning_time too, so the
-- name stays). evening_* is the evening sweep.
alter table public.notification_preferences
  add column if not exists habit_checkins_enabled boolean not null default true,
  add column if not exists good_news_enabled boolean not null default true,
  add column if not exists reminders_enabled boolean not null default true,
  -- Gremly check ins (nudges and return notes) need an explicit opt in (App Store 4.5.4)
  add column if not exists checkins_enabled boolean not null default false,
  add column if not exists checkins_opted_in_at timestamptz,
  add column if not exists checkins_opt_in_words text,
  add column if not exists quiet_start time not null default '21:30',
  add column if not exists quiet_end time not null default '07:30',
  add column if not exists paused_until timestamptz,
  add column if not exists last_permission_ask_at timestamptz;

-- Every person has a settings row from the moment they join, so the planner
-- never has to guess.
create or replace function public.handle_new_user_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_on_auth_user_created_notification_prefs on auth.users;
create trigger trg_on_auth_user_created_notification_prefs
  after insert on auth.users
  for each row execute function public.handle_new_user_notification_preferences();

insert into public.notification_preferences (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- ─── The notification log ───────────────────────────────────────────────────
-- One row per decision: sent, held back, cancelled or failed, with the reason in
-- plain words. Only the server writes, apart from mark_notification_opened.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  moment text not null check (moment in (
    'reminder', 'brief', 'sweep', 'habit_checkin', 'nudge', 'good_news', 'return_note', 'canary')),
  subject_type text,
  subject_id text,
  angle text,
  local_date date not null,
  dedupe_key text not null unique,
  planned_for timestamptz,
  status text not null check (status in (
    'planned', 'cancelled', 'suppressed', 'sending', 'sent', 'delivered', 'failed')),
  reason text,
  title text,
  body text,
  route text,
  data jsonb,
  interruption text check (interruption in ('passive', 'active', 'time-sensitive')),
  model text,
  used_fallback boolean not null default false,
  device_ids uuid[],
  expo_tickets jsonb,
  receipts jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  action text,
  outcome text check (outcome in ('succeeded', 'missed')),
  outcome_at timestamptz,
  counts_toward_budget boolean not null default true,
  is_test boolean not null default false,
  inngest_run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notification_log_user_day_idx on public.notification_log (user_id, local_date);
create index if not exists notification_log_user_moment_idx on public.notification_log (user_id, moment, created_at desc);
create index if not exists notification_log_receipts_idx on public.notification_log (status, sent_at) where status = 'sent';
alter table public.notification_log enable row level security;
drop policy if exists notification_log_select_own on public.notification_log;
create policy notification_log_select_own on public.notification_log for select using (auth.uid() = user_id);
comment on table public.notification_log is
  'Notifications: every decision with its reason, Expo tickets and receipts, opens and outcomes.';

-- Budget, spacing and the duplicate check, atomically, then the log row.
-- The numbers come from the policy module; the database only enforces them.
create or replace function public.claim_send(
  p_user uuid,
  p_moment text,
  p_dedupe_key text,
  p_local_date date,
  p_counts boolean,
  p_max_per_day integer,
  p_min_gap_minutes integer,
  p_subject_type text default null,
  p_subject_id text default null,
  p_planned_for timestamptz default null,
  p_is_test boolean default false
)
returns table (ok boolean, reason text, log_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer;
  v_last timestamptz;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('notification:' || p_user::text));

  select id into v_id from notification_log where dedupe_key = p_dedupe_key;
  if v_id is not null then
    return query select false, 'already decided'::text, v_id;
    return;
  end if;

  if p_counts and not p_is_test then
    select count(*), max(coalesce(sent_at, created_at))
      into v_sent, v_last
      from notification_log
     where user_id = p_user
       and local_date = p_local_date
       and counts_toward_budget
       and not is_test
       and status in ('sending', 'sent', 'delivered');
    if v_sent >= p_max_per_day then
      return query select false, 'daily limit reached'::text, null::uuid;
      return;
    end if;
    if v_last is not null and v_last > now() - make_interval(mins => p_min_gap_minutes) then
      return query select false, 'too soon after the last one'::text, null::uuid;
      return;
    end if;
  end if;

  insert into notification_log (
    user_id, moment, subject_type, subject_id, local_date, dedupe_key, planned_for,
    status, counts_toward_budget, is_test)
  values (
    p_user, p_moment, p_subject_type, p_subject_id, p_local_date, p_dedupe_key, p_planned_for,
    'sending', p_counts, p_is_test)
  returning id into v_id;

  return query select true, null::text, v_id;
end;
$$;
revoke all on function public.claim_send(uuid, text, text, date, boolean, integer, integer, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.claim_send(uuid, text, text, date, boolean, integer, integer, text, text, timestamptz, boolean) to service_role;

-- The app records a tap, and which button.
create or replace function public.mark_notification_opened(p_log_id uuid, p_action text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update notification_log
     set opened_at = coalesce(opened_at, now()),
         action = coalesce(p_action, action),
         updated_at = now()
   where id = p_log_id and user_id = auth.uid();
$$;
revoke all on function public.mark_notification_opened(uuid, text) from public, anon;
grant execute on function public.mark_notification_opened(uuid, text) to authenticated;

-- ─── Engagement ─────────────────────────────────────────────────────────────
create table if not exists public.user_engagement (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state text not null default 'engaged' check (state in ('engaged', 'drifting', 'lapsed', 'resting')),
  state_since timestamptz not null default now(),
  last_open_at timestamptz,
  days_away integer not null default 0,
  miss_streaks jsonb not null default '{}'::jsonb,
  paused_moments jsonb not null default '{}'::jsonb,
  best_hours jsonb,
  angle_stats jsonb,
  ladder_step integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.user_engagement enable row level security;
drop policy if exists user_engagement_select_own on public.user_engagement;
create policy user_engagement_select_own on public.user_engagement for select using (auth.uid() = user_id);
comment on table public.user_engagement is
  'Notifications: how engaged each person is, per moment miss streaks and pauses, best hours, angle results. Rebuilt nightly, updated by activity events.';

-- ─── One schedule for every reminder ───────────────────────────────────────
-- Items keep their reminders in reminders_json (todos, habits, notes of every
-- kind, people). Triggers keep this table in step; the server works out
-- next_fire_at (null means "needs planning") and sends.
create table if not exists public.reminder_schedule (
  id uuid primary key default gen_random_uuid(),
  -- no foreign key: items are not tied to auth.users either, and items left by
  -- deleted accounts must never make a save fail
  user_id uuid not null,
  entity_type text not null check (entity_type in ('todo', 'habit', 'note', 'person')),
  entity_id uuid not null,
  reminder_id text not null,
  rule jsonb not null,
  status text not null default 'active' check (status in ('active', 'closed', 'removed')),
  next_fire_at timestamptz,
  last_fired_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, reminder_id)
);
create index if not exists reminder_schedule_due_idx on public.reminder_schedule (next_fire_at) where status = 'active';
create index if not exists reminder_schedule_plan_idx on public.reminder_schedule (user_id) where status = 'active' and next_fire_at is null;
alter table public.reminder_schedule enable row level security;
drop policy if exists reminder_schedule_select_own on public.reminder_schedule;
create policy reminder_schedule_select_own on public.reminder_schedule for select using (auth.uid() = user_id);

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
       set status = 'removed', next_fire_at = null, updated_at = now()
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
     set status = 'removed', next_fire_at = null, updated_at = now()
   where entity_type = v_type and entity_id = new.id
     and status <> 'removed' and not (reminder_id = any (v_ids));

  -- current reminders; anything relevant changed, so each is planned again
  insert into reminder_schedule (user_id, entity_type, entity_id, reminder_id, rule, status, next_fire_at, updated_at)
  select (v_new ->> 'owner_id')::uuid, v_type, new.id, r ->> 'id', r,
         case when v_closed then 'closed' else 'active' end, null, now()
    from jsonb_array_elements(v_reminders) r
   where r ->> 'id' is not null
  on conflict (entity_type, entity_id, reminder_id) do update set
    user_id = excluded.user_id,
    rule = excluded.rule,
    status = excluded.status,
    next_fire_at = null,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_reminder_schedule_todos on public.todos;
create trigger trg_reminder_schedule_todos
  after insert or update of reminders_json, archived, completed_at or delete on public.todos
  for each row execute function public.sync_reminder_schedule();
drop trigger if exists trg_reminder_schedule_habits on public.habits;
create trigger trg_reminder_schedule_habits
  after insert or update of reminders_json, archived, completed_at or delete on public.habits
  for each row execute function public.sync_reminder_schedule();
drop trigger if exists trg_reminder_schedule_notes on public.notes;
create trigger trg_reminder_schedule_notes
  after insert or update of reminders_json, archived, target_date, event_time, date or delete on public.notes
  for each row execute function public.sync_reminder_schedule();
drop trigger if exists trg_reminder_schedule_people on public.people;
create trigger trg_reminder_schedule_people
  after insert or update of reminders_json or delete on public.people
  for each row execute function public.sync_reminder_schedule();

-- Reminders already saved come across (direct inserts, so the items' own
-- update triggers don't fire).
insert into public.reminder_schedule (user_id, entity_type, entity_id, reminder_id, rule, status)
select t.owner_id, 'todo', t.id, r ->> 'id', r,
       case when coalesce(t.archived, false) or t.completed_at is not null then 'closed' else 'active' end
  from public.todos t, jsonb_array_elements(case when jsonb_typeof(t.reminders_json) = 'array' then t.reminders_json else '[]'::jsonb end) r
 where r ->> 'id' is not null and t.owner_id is not null
   and exists (select 1 from auth.users u where u.id = t.owner_id)
union all
select h.owner_id, 'habit', h.id, r ->> 'id', r,
       case when coalesce(h.archived, false) or h.completed_at is not null then 'closed' else 'active' end
  from public.habits h, jsonb_array_elements(case when jsonb_typeof(h.reminders_json) = 'array' then h.reminders_json else '[]'::jsonb end) r
 where r ->> 'id' is not null and h.owner_id is not null
   and exists (select 1 from auth.users u where u.id = h.owner_id)
union all
select n.owner_id, 'note', n.id, r ->> 'id', r,
       case when coalesce(n.archived, false) then 'closed' else 'active' end
  from public.notes n, jsonb_array_elements(case when jsonb_typeof(n.reminders_json) = 'array' then n.reminders_json else '[]'::jsonb end) r
 where r ->> 'id' is not null and n.owner_id is not null
   and exists (select 1 from auth.users u where u.id = n.owner_id)
union all
select p.owner_id, 'person', p.id, r ->> 'id', r, 'active'
  from public.people p, jsonb_array_elements(case when jsonb_typeof(p.reminders_json) = 'array' then p.reminders_json else '[]'::jsonb end) r
 where r ->> 'id' is not null and p.owner_id is not null
   and exists (select 1 from auth.users u where u.id = p.owner_id)
on conflict (entity_type, entity_id, reminder_id) do nothing;

-- ─── Simulations ────────────────────────────────────────────────────────────
create table if not exists public.notification_simulations (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario text not null,
  start_date date not null,
  days jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.notification_simulations enable row level security;
drop policy if exists notification_simulations_select_own on public.notification_simulations;
create policy notification_simulations_select_own on public.notification_simulations
  for select using (auth.uid() = requested_by or auth.uid() = user_id);
