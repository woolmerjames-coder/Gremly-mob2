-- The shadow runner's role (scripts/shadow). It may read every table in
-- public and call a short list of functions that only read. It cannot insert,
-- update or delete any table. James runs this once, then mints its key with
-- scripts/shadow/mint-key.mjs.
--
-- One limit, stated plainly: some functions in public can be called by
-- anyone (PUBLIC), and a few of those write with their owner's rights. The
-- database does not stop this role calling them; the runner refuses every
-- function call that is not on its read only list.

create role shadow_reader nologin noinherit bypassrls;
grant shadow_reader to authenticator;

grant usage on schema public to shadow_reader;
grant select on all tables in schema public to shadow_reader;
alter default privileges in schema public grant select on tables to shadow_reader;

grant execute on function public.absence_snapshot(uuid) to shadow_reader;
grant execute on function public.find_items(uuid, text, text[], date, date, text, integer) to shadow_reader;
grant execute on function public.get_active_people(integer) to shadow_reader;
grant execute on function public.get_users_for_dco(integer) to shadow_reader;
grant execute on function public.ledger_users_due(integer, integer) to shadow_reader;
grant execute on function public.person_identity(uuid) to shadow_reader;
grant execute on function public.recall_life(uuid, text, integer) to shadow_reader;
grant execute on function public.usage_rollup(uuid, text, integer) to shadow_reader;
grant execute on function public.user_activity_days(uuid, date, date) to shadow_reader;

alter role shadow_reader set statement_timeout = '20s';

notify pgrst, 'reload config';
