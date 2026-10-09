-- Spaces come out of the database.
--
-- Run this only once every phone has the Worlds build. Older builds still
-- read and write these tables, and they would break.
--
-- What stays:
--   * every space_id column on todos, notes, habits, people, lists,
--     calendar_events and space_milestones. Old rows keep their value.
--   * space_milestones. The fact ledger still reads it, through the view
--     life_facts_now and the function ledger_users_due, so dropping it is a
--     data fabric decision for later.
--   * space chats, which are kept but not shown.
--
-- What goes: the links from those columns to spaces, the function
-- get_latest_space_summary, and the tables space_meta, space_suggestions,
-- space_summaries and spaces.
--
-- No cascade anywhere. If something unexpected still depends on one of
-- these tables, the drop stops with an error and nothing changes.

begin;

set local lock_timeout = '10s';

alter table public.todos drop constraint if exists todos_space_id_fkey;
alter table public.notes drop constraint if exists notes_space_id_fkey;
alter table public.habits drop constraint if exists habits_space_id_fkey;
alter table public.people drop constraint if exists people_space_id_fkey;
alter table public.lists drop constraint if exists lists_space_id_fkey;
alter table public.calendar_events drop constraint if exists calendar_events_space_id_fkey;
alter table public.space_milestones drop constraint if exists space_milestones_space_id_fkey;

drop function if exists public.get_latest_space_summary(uuid);

drop table if exists public.space_meta;
drop table if exists public.space_suggestions;
drop table if exists public.space_summaries;
drop table if exists public.spaces;

commit;
