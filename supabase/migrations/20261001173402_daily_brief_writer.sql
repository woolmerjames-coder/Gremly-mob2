-- Daily brief in Chat, part 2: what the brief writer needs.
-- Additive only.

-- Gremly's questions carry two to four short answers to tap (gap 4 of the
-- context handoff). Written by the ledger reader with each new question, or
-- by the brief writer the first time it asks an older question.
alter table public.gremly_questions add column if not exists choices jsonb;
comment on column public.gremly_questions.choices is
  'Two to four short answers the person can tap, as a JSON array of strings. Daily brief in Chat.';

-- One row per run of the brief writer: what it wrote, the offer, and any line
-- the ID check dropped (a line naming an item that was not in its input).
create table if not exists public.daily_brief_runs (
  id bigserial primary key,
  user_id uuid not null,
  ritual_day date not null,
  part text,
  reason text,
  brief_id uuid,
  offer_kind text,
  lines integer,
  dropped jsonb,
  offer_dropped jsonb,
  superseded integer,
  model text,
  prompt_version text,
  dco_built boolean,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists daily_brief_runs_user_day_idx on public.daily_brief_runs (user_id, ritual_day);
create index if not exists daily_brief_runs_dropped_idx on public.daily_brief_runs (created_at desc)
  where dropped is not null or offer_dropped is not null or error is not null;
alter table public.daily_brief_runs enable row level security;
comment on table public.daily_brief_runs is
  'Daily brief in Chat: each run of the brief writer, with ID check failures. Written by the workers only.';
