-- Data fabric: who someone is, understood from the records (James, 18 Oct:
-- "know it, ask only if unclear").
--
-- When the records make who someone is to the person plain, the weekly pass
-- holds it as understood rather than asking (inngest-jobs context/unsure.js):
--
-- 1. life_people.relationship_by gains 'understood': the tie is Gremly's
--    understanding from the records, never said by them. Every writer uses it
--    as known and says whose it is. Anything they or a fact state takes its
--    place, and a correction that says it is wrong clears it.
--
-- 2. life_unsure.status gains 'understood': the entry the tie came from, kept
--    so it is never asked. It goes back to open, and is asked, when the pass
--    later finds it less plain; it is said_no for good when they say it is
--    not so.
--
-- Each check is replaced by a wider one in the same transaction; every value
-- the old checks allowed is still allowed. Changes no data, drops no table or
-- column. Run it as one piece, before deploying the code that writes these.

begin;

alter table public.life_people drop constraint if exists life_people_relationship_by_check;
alter table public.life_people add constraint life_people_relationship_by_check
  check (relationship_by in ('gremly', 'person', 'understood'));

alter table public.life_unsure drop constraint if exists life_unsure_status_check;
alter table public.life_unsure add constraint life_unsure_status_check
  check (status in ('open', 'confirmed', 'said_no', 'faded', 'understood'));

comment on column public.life_people.relationship_by is
  'gremly when read from what the person said, person when they wrote it, understood when Gremly understood it from the records without being told (data fabric, 18 Oct).';
comment on column public.life_unsure.status is
  'open; confirmed when the person says it is so; said_no when they say it is not, or would rather not say; faded when the weekly pass stops thinking it; understood when the records make who someone is plain, so it is held, never asked.';

commit;
