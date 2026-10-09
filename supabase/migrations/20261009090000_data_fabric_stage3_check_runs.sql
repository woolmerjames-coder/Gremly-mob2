-- Data fabric stage 3: what the check did on every run, so the share of
-- sentences left out can be watched (workers/shared/check/run.js).
--
-- One row a run: the job (daily, brief), the person, the day, how many
-- sentences were checked, sent back and left out, and for each one sent back
-- its field, its outcome and why. No sentence's words are kept here.
-- Adds one table. Changes nothing else.

begin;
set local lock_timeout = '10s';

create table if not exists public.check_runs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  job text not null,
  day date,
  checked integer not null default 0,
  sent_back integer not null default 0,
  left_out integer not null default 0,
  details jsonb not null default '[]'::jsonb,
  words_prompt_version text,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists check_runs_job_idx on public.check_runs (job, created_at desc);
create index if not exists check_runs_user_idx on public.check_runs (user_id, created_at desc);

alter table public.check_runs enable row level security;
revoke all on public.check_runs from anon, authenticated;

comment on table public.check_runs is
  'What the check did on each run of a writer under it (data fabric stage 3): sentences checked, sent back once and left out, with each field''s outcome and why. No words are kept.';

commit;
