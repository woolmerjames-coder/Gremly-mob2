-- Data fabric stage 4a: questions about Worlds and Chapters on the one list.
--
-- gremly_questions already points at any record (record_table, record_id),
-- carries a proposed change and its choices. A question about starting or
-- closing a Chapter needs five more things, all added here:
--
--   kind        what the question is about: something on record (fact, every
--               question so far), starting a Chapter, closing one, or one that
--               ended while the person was away
--   rests_on    the items a suggestion rests on, [{ "table": ..., "id": ... }],
--               which the card shows before the person agrees
--   no_key      for a question whose no is remembered: code builds it from ids,
--               and a key answered no is never asked again
--   set_id      questions that travel together, such as one welcome back
--   hold_until  not asked before this day, such as while the person is away
--
-- At most one suggestion to start a Chapter is open at a time. The writers
-- that make such questions arrive in stage 4b and check first
-- (workers/shared/questionRules.js); the index below holds it as well.
-- Adds columns and indexes only. Every row so far is a question about
-- something on record, so kind starts as fact. Changes nothing else.

begin;
set local lock_timeout = '10s';

alter table public.gremly_questions
  add column if not exists kind text not null default 'fact',
  add column if not exists rests_on jsonb not null default '[]'::jsonb,
  add column if not exists no_key text,
  add column if not exists set_id uuid,
  add column if not exists hold_until date;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'gremly_questions_kind_check'
                 and conrelid = 'public.gremly_questions'::regclass) then
    alter table public.gremly_questions add constraint gremly_questions_kind_check
      check (kind in ('fact', 'start_chapter', 'close_chapter', 'while_away'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gremly_questions_rests_on_check'
                 and conrelid = 'public.gremly_questions'::regclass) then
    alter table public.gremly_questions add constraint gremly_questions_rests_on_check
      check (jsonb_typeof(rests_on) = 'array');
  end if;
end $c$;

-- a no is looked up by its key
create index if not exists gremly_questions_no_key_idx
  on public.gremly_questions (user_id, no_key) where no_key is not null;
-- questions that travel together
create index if not exists gremly_questions_set_idx
  on public.gremly_questions (user_id, set_id) where set_id is not null;
-- one open suggestion to start a Chapter at a time
create unique index if not exists gremly_questions_one_open_start_idx
  on public.gremly_questions (user_id)
  where kind = 'start_chapter' and status in ('open', 'asked');

comment on column public.gremly_questions.kind is
  'What the question is about: fact (something on record), start_chapter, close_chapter or while_away (data fabric stage 4a).';
comment on column public.gremly_questions.rests_on is
  'The items a suggestion rests on, [{"table": ..., "id": ...}], shown before the person agrees.';
comment on column public.gremly_questions.no_key is
  'Built by code from ids for a question whose no is remembered; a key answered no is never asked again.';
comment on column public.gremly_questions.set_id is
  'Questions that travel together, such as one welcome back.';
comment on column public.gremly_questions.hold_until is
  'Not asked before this day.';

commit;
