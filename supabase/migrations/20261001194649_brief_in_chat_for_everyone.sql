-- Daily brief in Chat goes to everyone. The column stays as a per-person
-- switch: setting it back to false for someone returns them to the old
-- morning brief without a new build.
alter table public.cortex_preferences alter column brief_in_chat set default true;
update public.cortex_preferences set brief_in_chat = true where brief_in_chat is distinct from true;
