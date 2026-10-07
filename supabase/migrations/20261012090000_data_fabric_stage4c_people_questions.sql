-- Data fabric stage 4c: questions about the people in someone's life, and a
-- check on who Gremly says someone is.
--
-- 1. gremly_questions.kind gains 'person': a question about someone in their
--    life, asked in the brief and the wrap up by the same rules as every
--    question (workers/shared/questionRules.js). It asks who someone is to
--    them, the name of someone known only by who they are, or whether two
--    records are one person. Its answer goes through the correction path,
--    which merges, fills in, or leaves things as they are
--    (inngest-jobs context/peopleQuestions.js).
--
-- 2. At most one question about a person is open at a time, held here as well
--    as in code, so Gremly never asks about people more than one at a time.
--
-- 3. life_people.who_checked_at: when who Gremly says someone is, and the
--    name, were checked against the person's own words. Each record is checked
--    once: the reader and the fill check what they make, and the weekly pipe
--    checks the records made before this check existed. A who that the words
--    do not state is cleared; blank is better than wrong.
--
-- The kind check is replaced by a wider one in the same transaction. Every
-- value the old check allowed is still allowed, so no row can fail it. Adds a
-- column and an index; changes no data, drops no table or column.

begin;
set local lock_timeout = '10s';

alter table public.gremly_questions drop constraint if exists gremly_questions_kind_check;
alter table public.gremly_questions add constraint gremly_questions_kind_check
  check (kind in ('fact', 'start_chapter', 'close_chapter', 'while_away', 'person'));

-- one open question about a person at a time
create unique index if not exists gremly_questions_one_open_person_idx
  on public.gremly_questions (user_id)
  where kind = 'person' and status in ('open', 'asked');

alter table public.life_people
  add column if not exists who_checked_at timestamptz;

comment on column public.life_people.who_checked_at is
  'When who Gremly says this person is, and their name, were checked against the person''s own words (data fabric stage 4c). Null until checked.';

commit;
