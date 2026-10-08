-- Data fabric stage 6: the line Gremly keeps about each person.
--
-- After the weekly pass, the words writer turns its note on each person the
-- week spoke of into one line kept with that person, held to the facts the
-- note rests on (workers/inngest-jobs/context/personWords.js). The life pack
-- reads it, so chat, today's thread and the brief know it. Gremly is its one
-- writer; nothing the person wrote is kept here.
--
-- Additive. Run it as one piece, then set PERSON_WORDS = "on" in both
-- workers' wrangler.toml and deploy them.

begin;
set local lock_timeout = '10s';

alter table public.life_people add column if not exists words text;
alter table public.life_people add column if not exists words_updated_at timestamptz;

comment on column public.life_people.words is
  'The line Gremly keeps about this person, from the weekly pass''s note on them, checked against the facts it rests on (data fabric stage 6). Gremly''s only.';
comment on column public.life_people.words_updated_at is
  'When the line about this person was last written.';

commit;
