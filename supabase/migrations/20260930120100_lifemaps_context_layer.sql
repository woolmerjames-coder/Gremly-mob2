-- Lifemaps and context fixes, part 2: the context layer.
-- Additive only: new tables and functions, nothing existing changes.

-- ─── Fact ledger ────────────────────────────────────────────────────────────
-- One row per thing Gremly believes about a person's life. Models write the
-- words; every row points at the record it came from. Gremly's own words are
-- never a source, so said_by has no 'gremly' value.
create table if not exists public.life_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  statement text not null,
  subject text,
  kind text,
  world_id uuid references public.worlds(id) on delete set null,
  about_date date,
  about_date_end date,
  date_confidence text not null default 'unknown'
    check (date_confidence in ('exact', 'approximate', 'unknown')),
  state text not null default 'current'
    check (state in ('current', 'planned', 'happened', 'changed', 'superseded', 'corrected', 'unconfirmed')),
  said_by text not null check (said_by in ('user', 'calendar', 'app_record')),
  source_table text not null,
  source_id uuid,
  source_quote text,
  observed_at timestamptz not null,
  last_confirmed_at timestamptz not null default now(),
  superseded_by uuid references public.life_facts(id) on delete set null,
  state_reason text,
  correction_text text,
  corrected_at timestamptz,
  run_id text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists life_facts_user_state_idx on public.life_facts (user_id, state);
create index if not exists life_facts_user_about_idx on public.life_facts (user_id, about_date);
create index if not exists life_facts_user_source_idx on public.life_facts (user_id, source_table, source_id);
create index if not exists life_facts_user_updated_idx on public.life_facts (user_id, updated_at desc);
alter table public.life_facts enable row level security;
drop policy if exists life_facts_select_own on public.life_facts;
create policy life_facts_select_own on public.life_facts for select using (auth.uid() = user_id);
comment on table public.life_facts is 'Fact ledger: what Gremly believes about a person, each fact with its date, state and the record it came from. Written by the workers only.';

-- Every change of a fact's state, with the record that caused it.
create table if not exists public.life_fact_changes (
  id bigserial primary key,
  fact_id uuid not null references public.life_facts(id) on delete cascade,
  user_id uuid not null,
  from_state text,
  to_state text not null,
  reason text,
  source_table text,
  source_id uuid,
  run_id text,
  created_at timestamptz not null default now()
);
create index if not exists life_fact_changes_fact_idx on public.life_fact_changes (fact_id, created_at);
create index if not exists life_fact_changes_user_idx on public.life_fact_changes (user_id, created_at desc);
alter table public.life_fact_changes enable row level security;
drop policy if exists life_fact_changes_select_own on public.life_fact_changes;
create policy life_fact_changes_select_own on public.life_fact_changes for select using (auth.uid() = user_id);

-- How far the reader has read each person's records.
create table if not exists public.ledger_cursor (
  user_id uuid primary key,
  read_through timestamptz not null,
  backfilled_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.ledger_cursor enable row level security;
revoke all on public.ledger_cursor from anon, authenticated;

-- ─── Questions Gremly wants to ask ──────────────────────────────────────────
-- Raised when records disagree. The user's answer goes back into the ledger.
create table if not exists public.gremly_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question text not null,
  about_fact_id uuid references public.life_facts(id) on delete cascade,
  record_table text,
  record_id uuid,
  proposed_change jsonb,
  status text not null default 'open'
    check (status in ('open', 'asked', 'answered', 'dismissed', 'expired')),
  answer text,
  run_id text,
  created_at timestamptz not null default now(),
  asked_at timestamptz,
  answered_at timestamptz
);
create index if not exists gremly_questions_user_idx on public.gremly_questions (user_id, status, created_at desc);
alter table public.gremly_questions enable row level security;
drop policy if exists gremly_questions_select_own on public.gremly_questions;
create policy gremly_questions_select_own on public.gremly_questions for select using (auth.uid() = user_id);
drop policy if exists gremly_questions_answer_own on public.gremly_questions;
create policy gremly_questions_answer_own on public.gremly_questions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── Corrections ────────────────────────────────────────────────────────────
-- What the person said was wrong, where they said it, and what was rewritten.
create table if not exists public.user_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  said text not null,
  surface text not null check (surface in ('chat', 'not_right', 'brief', 'question')),
  target_kind text,
  target_ref jsonb,
  chat_id uuid,
  fact_ids uuid[],
  status text not null default 'received' check (status in ('received', 'applied', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index if not exists user_corrections_user_idx on public.user_corrections (user_id, created_at desc);
alter table public.user_corrections enable row level security;
drop policy if exists user_corrections_insert_own on public.user_corrections;
create policy user_corrections_insert_own on public.user_corrections for insert with check (auth.uid() = user_id);
drop policy if exists user_corrections_select_own on public.user_corrections;
create policy user_corrections_select_own on public.user_corrections for select using (auth.uid() = user_id);

-- ─── App usage log ──────────────────────────────────────────────────────────
-- First party only: which parts of the app a person used and when.
create table if not exists public.app_events (
  id bigserial primary key,
  user_id uuid not null default auth.uid(),
  kind text not null,
  target_type text,
  target_id text,
  meta jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists app_events_user_idx on public.app_events (user_id, occurred_at desc);
create index if not exists app_events_user_kind_idx on public.app_events (user_id, kind, occurred_at desc);
alter table public.app_events enable row level security;
drop policy if exists app_events_insert_own on public.app_events;
create policy app_events_insert_own on public.app_events for insert with check (auth.uid() = user_id);
drop policy if exists app_events_select_own on public.app_events;
create policy app_events_select_own on public.app_events for select using (auth.uid() = user_id);
comment on table public.app_events is 'First party usage log: opens, screens, chats started, sweeps, edits. Powers the person''s own usage stats and returning-user behaviour.';

-- ─── Synthesis runs ─────────────────────────────────────────────────────────
-- Weekly and monthly passes, and the day 3 first look. Batch jobs are tracked here.
create table if not exists public.synthesis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('weekly', 'monthly', 'first_look', 'catch_up')),
  period_start date,
  period_end date,
  status text not null default 'queued'
    check (status in ('queued', 'submitted', 'completed', 'failed', 'applied', 'shadow')),
  batch_id text,
  model text,
  prompt_version text,
  input_stats jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  applied_at timestamptz
);
create index if not exists synthesis_runs_user_idx on public.synthesis_runs (user_id, kind, period_end desc);
alter table public.synthesis_runs enable row level security;
drop policy if exists synthesis_runs_select_own on public.synthesis_runs;
create policy synthesis_runs_select_own on public.synthesis_runs for select using (auth.uid() = user_id);

-- ─── Usage and activity, counted not generated ─────────────────────────────
-- One row per local day: what the person did in the app.
create or replace function public.user_activity_days(p_user uuid, p_from date, p_to date)
returns table (
  day date,
  drops integer,
  journals integer,
  todos_done integer,
  habit_checkins integer,
  chat_messages integer,
  chats integer,
  sweeps integer,
  fed boolean,
  age_up boolean,
  app_opens integer,
  world_visits integer,
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (
    select coalesce(
      (select nullif(np.timezone, '') from notification_preferences np where np.user_id = p_user),
      (select nullif(nullif(up.timezone, ''), 'UTC') from user_profiles up where up.user_id = p_user),
      'America/Los_Angeles') as z
  ),
  days as (select generate_series(p_from, p_to, interval '1 day')::date as d),
  drops as (
    select (x.created_at at time zone (select z from tz))::date as d, count(*)::int as n from (
      select created_at from todos where owner_id = p_user
      union all select created_at from notes where owner_id = p_user and external_source is null
      union all select created_at from habits where owner_id = p_user
    ) x group by 1
  ),
  journals as (
    select (created_at at time zone (select z from tz))::date as d, count(*)::int as n
    from notes where owner_id = p_user and subtype = 'journal' group by 1
  ),
  done as (
    select (completed_at at time zone (select z from tz))::date as d, count(*)::int as n
    from todos where owner_id = p_user and completed_at is not null group by 1
  ),
  checkins as (
    select occurred_day as d, count(*)::int as n from habit_progress where owner_id = p_user group by 1
  ),
  chat as (
    select (created_at at time zone (select z from tz))::date as d, count(*)::int as n, count(distinct chat_id)::int as c
    from scope_chat_messages where user_id = p_user and role = 'user' group by 1
  ),
  sweeps as (
    select (created_at at time zone (select z from tz))::date as d, count(*)::int as n
    from events where owner_id = p_user and kind = 'sweep_completed' group by 1
  ),
  fed as (
    select ritual_day as d, bool_or(is_fed) as f from daily_ritual_progress where owner_id = p_user group by 1
  ),
  fed_numbered as (
    select d, row_number() over (order by d) as k from fed where f
  ),
  opens as (
    select (occurred_at at time zone (select z from tz))::date as d,
      count(*) filter (where kind = 'app_open')::int as o,
      count(*) filter (where kind = 'world_view')::int as w
    from app_events where user_id = p_user group by 1
  )
  select
    days.d,
    coalesce(drops.n, 0), coalesce(journals.n, 0), coalesce(done.n, 0), coalesce(checkins.n, 0),
    coalesce(chat.n, 0), coalesce(chat.c, 0), coalesce(sweeps.n, 0),
    coalesce(fed.f, false),
    coalesce(fed_numbered.k % 3 = 0, false),
    coalesce(opens.o, 0), coalesce(opens.w, 0),
    (coalesce(drops.n, 0) + coalesce(done.n, 0) + coalesce(checkins.n, 0) + coalesce(chat.n, 0)
      + coalesce(sweeps.n, 0) + coalesce(opens.o, 0) + coalesce(opens.w, 0)) > 0 or coalesce(fed.f, false)
  from days
  left join drops on drops.d = days.d
  left join journals on journals.d = days.d
  left join done on done.d = days.d
  left join checkins on checkins.d = days.d
  left join chat on chat.d = days.d
  left join sweeps on sweeps.d = days.d
  left join fed on fed.d = days.d
  left join fed_numbered on fed_numbered.d = days.d
  left join opens on opens.d = days.d
  order by days.d;
$$;

-- Totals per week (Monday start), month or year, newest first.
create or replace function public.usage_rollup(p_user uuid, p_grain text default 'week', p_periods integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  z text;
  today date;
  first_period date;
  result jsonb;
begin
  if p_grain not in ('week', 'month', 'year') then
    raise exception 'p_grain must be week, month or year';
  end if;
  select coalesce(
    (select nullif(np.timezone, '') from notification_preferences np where np.user_id = p_user),
    'America/Los_Angeles') into z;
  today := (now() at time zone z)::date;
  first_period := date_trunc(p_grain, today - (case p_grain when 'week' then 7 * (p_periods - 1)
                                                         when 'month' then 31 * (p_periods - 1)
                                                         else 366 * (p_periods - 1) end))::date;
  with d as (
    select * from public.user_activity_days(p_user, first_period, today)
  ),
  periods as (
    select date_trunc(p_grain, d.day)::date as period_start,
      count(*) filter (where d.active)::int as active_days,
      sum(d.drops)::int as drops,
      sum(d.journals)::int as journals,
      sum(d.todos_done)::int as todos_done,
      sum(d.habit_checkins)::int as habit_checkins,
      sum(d.chat_messages)::int as chat_messages,
      sum(d.chats)::int as chat_days_threads,
      sum(d.sweeps)::int as sweeps,
      count(*) filter (where d.fed)::int as fed_days,
      count(*) filter (where d.age_up)::int as age_ups,
      sum(d.app_opens)::int as app_opens,
      sum(d.world_visits)::int as world_visits,
      count(*)::int as days_in_period
    from d group by 1
  )
  select coalesce(jsonb_agg(to_jsonb(periods) order by period_start desc), '[]'::jsonb) into result from periods;
  return jsonb_build_object('grain', p_grain, 'timezone', z, 'today', today, 'periods', result,
    'current', (select jsonb_build_object(
        'gremly_age', cp.gremly_age, 'fed_days_total', cp.fed_days_count,
        'sweep_streak', cp.sweep_streak, 'current_tier', cp.current_tier)
      from cortex_preferences cp where cp.owner_id = p_user));
end;
$$;

-- Where a person has been and how long since: the absence snapshot.
create or replace function public.absence_snapshot(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  z text;
  today date;
  last_day date;
  prev_day date;
  result jsonb;
begin
  select coalesce(
    (select nullif(np.timezone, '') from notification_preferences np where np.user_id = p_user),
    'America/Los_Angeles') into z;
  today := (now() at time zone z)::date;
  select max(day) into last_day from public.user_activity_days(p_user, today - 365, today) where active;
  select max(day) into prev_day from public.user_activity_days(p_user, today - 365, today - 1) where active;
  select jsonb_build_object(
    'today', today,
    'timezone', z,
    'last_active_day', last_day,
    'days_since_active', case when last_day is null then null else today - last_day end,
    'active_today', last_day = today,
    'last_active_day_before_today', prev_day,
    'days_away_before_today', case when prev_day is null then null else today - prev_day - 1 end,
    'active_days_last_7', (select count(*) from public.user_activity_days(p_user, today - 6, today) where active),
    'active_days_last_30', (select count(*) from public.user_activity_days(p_user, today - 29, today) where active),
    'last_by_surface', jsonb_build_object(
      'drop', (select max(created_at) from (
          select created_at from todos where owner_id = p_user
          union all select created_at from notes where owner_id = p_user and external_source is null
          union all select created_at from habits where owner_id = p_user) x),
      'journal', (select max(created_at) from notes where owner_id = p_user and subtype = 'journal'),
      'todo_done', (select max(completed_at) from todos where owner_id = p_user),
      'habit_checkin', (select max(occurred_at) from habit_progress where owner_id = p_user),
      'chat', (select max(created_at) from scope_chat_messages where user_id = p_user and role = 'user'),
      'sweep', (select max(created_at) from events where owner_id = p_user and kind = 'sweep_completed'),
      'app_open', (select greatest(
          (select max(occurred_at) from app_events where user_id = p_user and kind = 'app_open'),
          (select last_app_active_at from notification_preferences where user_id = p_user))),
      'worlds', (select max(occurred_at) from app_events where user_id = p_user and kind = 'world_view')
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.user_activity_days(uuid, date, date) from anon, authenticated, public;
revoke execute on function public.usage_rollup(uuid, text, integer) from anon, authenticated, public;
revoke execute on function public.absence_snapshot(uuid) from anon, authenticated, public;
grant execute on function public.user_activity_days(uuid, date, date) to service_role;
grant execute on function public.usage_rollup(uuid, text, integer) to service_role;
grant execute on function public.absence_snapshot(uuid) to service_role;
