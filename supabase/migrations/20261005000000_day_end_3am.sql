-- One day end for everyone: 3 AM, unless a person chooses otherwise in settings.
--
-- A person's day ends at cortex_preferences.day_boundary_hour. Until now it
-- defaulted to midnight, so a late evening (a Sweep at 12:30 AM, a habit
-- logged after midnight) fell on the next day. The evening wrap up, the brief,
-- the notifications and Gremly's chat all count from this hour.
--
-- 1. New accounts get 3 AM.
-- 2. Everyone on midnight moves to 3 AM. Midnight was the old default and was
--    never asked for, so it cannot be told apart from a choice. Anyone who
--    wants midnight can pick it again in Settings, Rituals.
--
-- Changes data: James runs this.

alter table public.cortex_preferences
  alter column day_boundary_hour set default 3;

update public.cortex_preferences
   set day_boundary_hour = 3
 where day_boundary_hour is null
    or day_boundary_hour = 0;
