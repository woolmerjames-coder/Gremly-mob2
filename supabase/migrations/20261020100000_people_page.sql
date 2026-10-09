-- The people page (Worlds rebuild, stage 5): the words Gremly keeps on the
-- page about someone in a person's life.
--
-- life_people.page: the labels on the days about them that matter and the
--   things to remember, written to the person as "you" by
--   workers/inngest-jobs/context/personPage.js through the shared check, with
--   what they rest on, so the page is written again only when that changes.
--   { version, sig, at, days: [{ fact_id, label }], remember: [{ text, fact_ids }] }
--   Nothing private or about health is ever in it.
--
-- Additive. Run it before deploying inngest-jobs with the people page.

begin;
set local lock_timeout = '10s';

alter table public.life_people add column if not exists page jsonb;

comment on column public.life_people.page is
  'The people page: labels on their days and things to remember, written by Gremly from the facts about them (personPage.js). Never private or about health.';

notify pgrst, 'reload schema';

commit;
