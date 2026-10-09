-- Data fabric: what Gremly is not sure of yet, who matters most, and questions
-- asked as a set (after the comparison of 8 Oct).
--
-- 1. life_unsure: what Gremly thinks about someone's life but no record
--    states. Facts are what the person said; this is what Gremly thinks, kept
--    apart so it can never be read as a fact. Each entry is about someone in
--    their life (person_id) or about the person themselves (person_id null):
--      kind     who: who someone is to them; life: anything else about their
--               life that matters, such as what they do or are working toward
--      thinks   what Gremly thinks, in Gremly's words, never shown as it is
--      rests_on the records it rests on, [{"table": ..., "id": ...}]
--      sure     how sure Gremly is: low, medium or high
--      status   open; confirmed when the person says it is so; said_no when
--               they say it is not, or would rather not say; faded when the
--               weekly pass stops thinking it
--      seen_at  the last weekly pass that still thought it
--    The weekly pass writes it (inngest-jobs context/unsure.js); the person's
--    answer to a question confirms it or says no. A yes becomes a fact in
--    their words, through the correction path. No screen shows it, and no
--    writer of anything shown reads it: the app cannot read this table at all.
--
-- 2. life_people.matters_rank: who matters most to them now, as the weekly
--    pass judges it from the records (1 matters most), null for everyone else.
--    The questions ask about the people who matter most first.
--
-- 3. gremly_questions.kind gains 'unsure': a question about something Gremly
--    is not sure of, asked so the person can say whether it is so.
--
-- 4. Questions about people and about what Gremly is not sure of are asked as
--    one set of up to five a week, so the one open person question index
--    gives way to one open question per record: never two open about the same
--    person, merge or guess. Code holds the set to five and one set at a time
--    (workers/shared/questionRules.js).
--
-- The kind check is replaced by a wider one in the same transaction; every
-- value the old check allowed is still allowed. Adds a table, two columns and
-- an index and replaces an index; changes no data, drops no table or column.
-- Run it as one piece, before deploying the code that writes these.

begin;
set local lock_timeout = '10s';

create table if not exists public.life_unsure (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references public.life_people(id) on delete cascade,
  kind text not null check (kind in ('who', 'life')),
  thinks text not null,
  rests_on jsonb not null default '[]'::jsonb check (jsonb_typeof(rests_on) = 'array'),
  sure text not null check (sure in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'confirmed', 'said_no', 'faded')),
  run_id text,
  prompt_version text,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  check (kind = 'life' or person_id is not null)
);
create index if not exists life_unsure_user_idx on public.life_unsure (user_id, status);
-- one open guess at who someone is, for each person
create unique index if not exists life_unsure_one_open_who_idx
  on public.life_unsure (person_id) where kind = 'who' and status = 'open';

-- never read by the app: only the workers, with the service key
alter table public.life_unsure enable row level security;
revoke all on public.life_unsure from anon;
revoke all on public.life_unsure from authenticated;

alter table public.life_people add column if not exists matters_rank smallint;
alter table public.life_people add column if not exists matters_at timestamptz;

alter table public.gremly_questions drop constraint if exists gremly_questions_kind_check;
alter table public.gremly_questions add constraint gremly_questions_kind_check
  check (kind in ('fact', 'start_chapter', 'close_chapter', 'while_away', 'person', 'tidy', 'unsure'));

-- one open question for each record, in place of one open person question
create unique index if not exists gremly_questions_one_open_per_record_idx
  on public.gremly_questions (user_id, record_table, record_id)
  where kind in ('person', 'unsure') and status in ('open', 'asked');
drop index if exists public.gremly_questions_one_open_person_idx;

comment on table public.life_unsure is
  'What Gremly thinks about someone''s life but no record states, kept apart from the facts so it is never read as one. Written by the weekly pass; confirmed or said no to only by the person. Never shown on a screen.';
comment on column public.life_unsure.person_id is
  'Who it is about; null when it is about the person themselves.';
comment on column public.life_unsure.status is
  'open; confirmed when the person says it is so; said_no when they say it is not, or would rather not say; faded when the weekly pass stops thinking it.';
comment on column public.life_people.matters_rank is
  'Who matters most to them now, as the weekly pass judges it from the records (1 matters most); null for everyone else.';
comment on column public.life_people.matters_at is
  'When the weekly pass last judged who matters most.';

notify pgrst, 'reload schema';

commit;
