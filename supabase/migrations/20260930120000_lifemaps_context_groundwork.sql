-- Lifemaps and context fixes, part 1: groundwork.
-- Additive only. Nothing existing is dropped; the old RPCs stay for rollback.

-- 1. AI usage log: one row per model call, no content.
create table if not exists public.ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  worker text,
  job text,
  user_id uuid,
  provider text,
  model text,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  output_tokens integer not null default 0,
  thinking_tokens integer not null default 0,
  cost_usd numeric(12, 6),
  latency_ms integer,
  status integer,
  ok boolean,
  batch boolean not null default false,
  run_id text,
  meta jsonb
);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_job_idx on public.ai_usage (job, created_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
comment on table public.ai_usage is 'One row per AI model call made by the workers: job, user, model, tokens and list-price cost. Written with the service key only.';

-- 2. Who counts as active: anything the person did in the app, not only new items.
create or replace function public.get_active_people(active_days integer default 30)
returns table (user_id uuid, timezone text, last_active_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with since as (select now() - make_interval(days => active_days) as t),
  activity as (
    select owner_id as uid, created_at as at from todos, since where created_at > since.t
    union all select owner_id, completed_at from todos, since where completed_at > since.t
    union all select owner_id, created_at from notes, since where external_source is null and created_at > since.t
    union all select owner_id, created_at from habits, since where created_at > since.t
    union all select owner_id, occurred_at from habit_progress, since where occurred_at > since.t
    union all select user_id, created_at from scope_chat_messages, since where role = 'user' and created_at > since.t
    union all select owner_id, updated_at from daily_ritual_progress, since where updated_at > since.t
    union all select user_id, last_app_active_at from notification_preferences, since where last_app_active_at > since.t
  ),
  latest as (select uid, max(at) as last_at from activity where uid is not null group by uid)
  select
    l.uid as user_id,
    coalesce(nullif(np.timezone, ''), nullif(nullif(up.timezone, ''), 'UTC'), 'America/Los_Angeles') as timezone,
    l.last_at as last_active_at
  from latest l
  left join notification_preferences np on np.user_id = l.uid
  left join user_profiles up on up.user_id = l.uid;
$$;

-- 3. DCO candidates: active users plus the date of their last real DCO row.
-- Rows written only by the Worlds job carry no pipeline key and do not count.
create or replace function public.get_users_for_dco(active_days integer default 30)
returns table (user_id uuid, timezone text, last_dco_date date)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, a.timezone,
    (select max(d.date) from user_daily_state d
      where d.user_id = a.user_id and d.dco ? 'pipeline' and d.date > '2000-01-01') as last_dco_date
  from public.get_active_people(active_days) a;
$$;

-- 4. Profile render: same activity rule, no tier gate.
create or replace function public.get_active_users_needing_synthesis(since timestamp with time zone default (now() - '7 days'::interval))
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $function$
begin
  return query
  select a.user_id
  from public.get_active_people(greatest(1, ceil(extract(epoch from (now() - since)) / 86400)::int)) a
  left join user_profiles p on p.user_id = a.user_id
  where p.generated_at is null or a.last_active_at > p.generated_at;
end;
$function$;

-- 5. A world's last signal comes from the person's own linked items.
create or replace function public.refresh_world_last_signal(p_owner uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with linked as (
    select l.world_id,
      greatest(
        max(t.created_at), max(t.completed_at),
        max(nt.created_at),
        max(h.created_at), max(h.last_completed_at)
      ) as last_at
    from drop_world_links l
    left join todos t on l.drop_type = 'todo' and t.id = l.drop_id
    left join notes nt on l.drop_type = 'note' and nt.id = l.drop_id
    left join habits h on l.drop_type = 'habit' and h.id = l.drop_id
    where l.owner_id = p_owner
    group by l.world_id
  )
  update worlds w
     set last_signal_at = linked.last_at
    from linked
   where w.id = linked.world_id
     and w.owner_id = p_owner
     and linked.last_at is not null
     and w.last_signal_at is distinct from linked.last_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 6. Observations can be retired without deleting them.
alter table public.observations add column if not exists superseded_at timestamptz;
alter table public.observations add column if not exists superseded_reason text;
create index if not exists observations_live_idx on public.observations (user_id, stage, observed_for_week) where superseded_at is null;

revoke execute on function public.get_active_people(integer) from anon, authenticated, public;
revoke execute on function public.get_users_for_dco(integer) from anon, authenticated, public;
revoke execute on function public.refresh_world_last_signal(uuid) from anon, authenticated, public;
revoke execute on function public.get_active_users_needing_synthesis(timestamp with time zone) from anon, authenticated, public;
grant execute on function public.get_active_people(integer) to service_role;
grant execute on function public.get_users_for_dco(integer) to service_role;
grant execute on function public.refresh_world_last_signal(uuid) to service_role;
grant execute on function public.get_active_users_needing_synthesis(timestamp with time zone) to service_role;
