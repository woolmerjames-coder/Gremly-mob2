-- The weekly review: one row per person per week, and their days off.
--
-- Additive only: one new, empty table and one new column with a default.
-- Nothing that exists is read, changed or dropped.
--
-- weekly_reviews holds what the review needs from one week to the next: the
-- read Gremly made for it, what the person answered (their priorities, the
-- hours they have free on each kind of day, their busy days, the note that
-- holds their intention, what they decided on the things that needed them),
-- the latest spread of the week, and the milestone check ins. week_start is
-- the first day of the week it is for; span_start is the first day it plans,
-- which is later than week_start when the review starts part way through the
-- week. A redo in the same week updates the same row.
create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  span_start date not null,
  -- ready: the read is made and the review not opened; then started, done or skipped
  status text not null default 'ready'
    check (status in ('ready', 'started', 'done', 'skipped')),
  -- weekly: on the weekly day or the two days after; extra: the one out of
  -- cycle review a week; brought_forward: next week's, done the day before
  kind text not null default 'weekly'
    check (kind in ('weekly', 'extra', 'brought_forward')),
  -- the weekly read, as Gremly returned it
  read jsonb,
  -- what the person settled: priorities, hours, busy_days, intention_id, needs_you
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object'),
  -- the latest spread of the week across its days, and what is put off
  spread jsonb,
  -- the milestone check ins: each with its goal, its date and what to ask
  checkins jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checkins) = 'array'),
  -- the prompt versions the read and the spread were made with
  prompt_versions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint weekly_reviews_owner_week_key unique (owner_id, week_start),
  constraint weekly_reviews_span_in_week check (span_start >= week_start and span_start <= week_start + 6)
);

-- updated_at follows every change (public.set_updated_at is already in the database)
drop trigger if exists trg_weekly_reviews_updated_at on public.weekly_reviews;
create trigger trg_weekly_reviews_updated_at
  before update on public.weekly_reviews
  for each row execute function public.set_updated_at();

-- owner only: each person reads and writes their own weeks, and nobody else's
alter table public.weekly_reviews enable row level security;
drop policy if exists weekly_reviews_select_own on public.weekly_reviews;
create policy weekly_reviews_select_own on public.weekly_reviews
  for select using (auth.uid() = owner_id);
drop policy if exists weekly_reviews_insert_own on public.weekly_reviews;
create policy weekly_reviews_insert_own on public.weekly_reviews
  for insert with check (auth.uid() = owner_id);
drop policy if exists weekly_reviews_update_own on public.weekly_reviews;
create policy weekly_reviews_update_own on public.weekly_reviews
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists weekly_reviews_delete_own on public.weekly_reviews;
create policy weekly_reviews_delete_own on public.weekly_reviews
  for delete using (auth.uid() = owner_id);

comment on table public.weekly_reviews is
  'Weekly review: one row per person per week (owner_id, week_start). The read Gremly made, what the person answered, the latest spread and the milestone check ins. Read and written by the app as that person, and by the workers with the service key.';

-- Their days off, beside weekly_day and weekly_time: the days of the week that
-- count as days off when the week's free hours are set, 0 Sunday to 6
-- Saturday. Saturday and Sunday unless they choose others, so a week that is
-- not Monday to Friday plans properly.
alter table public.notification_preferences
  add column if not exists days_off smallint[] not null default '{6,0}'::smallint[];

comment on column public.notification_preferences.days_off is
  'Weekly review: the days of the week that count as days off, 0 Sunday to 6 Saturday. Saturday and Sunday by default.';
