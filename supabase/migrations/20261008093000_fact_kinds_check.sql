-- Data fabric stage 2: hold life_facts.kind to the seven kinds.
--
-- Run only after inngest-jobs with the kind pass is deployed and the one time
-- pass (event app/kinds.give with no user) has given every fact a kind. Until
-- then the old reader writes kinds of its own and this would refuse its facts.
-- Check first that this returns no rows:
--
--   select id, kind from public.life_facts
--   where kind is not null
--     and kind not in ('event', 'routine', 'goal', 'preference', 'relationship', 'situation', 'self');
--
-- A fact may have no kind for a while: corrections add facts without one, and
-- the next pass gives it.

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'life_facts_kind_check'
                 and conrelid = 'public.life_facts'::regclass) then
    alter table public.life_facts add constraint life_facts_kind_check
      check (kind is null or kind in ('event', 'routine', 'goal', 'preference', 'relationship', 'situation', 'self'))
      not valid;
  end if;
end $c$;
alter table public.life_facts validate constraint life_facts_kind_check;
