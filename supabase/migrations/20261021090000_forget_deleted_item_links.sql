-- Deleted items leave no links behind.
--
-- When a person deletes a todo, a note or a habit, its row goes, but its
-- links to Worlds, Chapters and life contexts stayed. Those links point at
-- nothing, and the first Worlds check (firstWorlds.js) still read one as
-- something filed in that World. Things a person deleted must never show up
-- in Worlds, Chapters or what Gremly remembers.
--
-- forget_deleted_item_links runs after every delete on todos, notes and
-- habits, whatever deleted the row (the app, a Worker, the SQL editor), and
-- removes the item's rows from:
--   * drop_world_links, drop_chapter_links, drop_context_links
--   * drop_link_removals (the record that the person took it out of a place,
--     which means nothing once the item is gone)
--
-- It runs in the same transaction as the delete and catches nothing: if the
-- links cannot be removed, the delete fails too, so an item is never gone
-- while its links stay.
--
-- Archived items (the Sweep, Keep just one, Keep as one, converted) are not
-- deleted rows and keep their links. World and Chapter pages leave every
-- archived item out (liveItem in lib/worlds/model.ts), and the writers of
-- their words read only the ones the Sweep and the tidy ups cleared
-- (CLEARED_REASONS in workers/inngest-jobs/context/filed.js).
--
-- Facts the reader took from an item are not touched here: the reader reads
-- the delete from item_changes and decides what to set aside.
--
-- The end of the file removes the links already left by items deleted
-- before this ran.
--
-- Additive. Safe to run before or after any app or Worker deploy.

begin;

set local lock_timeout = '10s';

create or replace function public.forget_deleted_item_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind text := case tg_table_name
    when 'todos' then 'todo'
    when 'notes' then 'note'
    when 'habits' then 'habit'
  end;
begin
  if kind is null then
    raise exception 'forget_deleted_item_links is attached to %, which it does not know', tg_table_name;
  end if;

  delete from public.drop_world_links where drop_id = old.id and drop_type = kind;
  delete from public.drop_chapter_links where drop_id = old.id and drop_type = kind;
  delete from public.drop_context_links where drop_id = old.id and drop_type = kind;
  delete from public.drop_link_removals where drop_id = old.id and drop_type = kind;

  return old;
end;
$$;

comment on function public.forget_deleted_item_links() is
  'After a todo, note or habit is deleted, removes its World, Chapter and life context links and any record of it being taken out of a place.';

revoke all on function public.forget_deleted_item_links() from public, anon, authenticated;

drop trigger if exists zz_forget_deleted_item_links on public.todos;
create trigger zz_forget_deleted_item_links
  after delete on public.todos
  for each row execute function public.forget_deleted_item_links();

drop trigger if exists zz_forget_deleted_item_links on public.notes;
create trigger zz_forget_deleted_item_links
  after delete on public.notes
  for each row execute function public.forget_deleted_item_links();

drop trigger if exists zz_forget_deleted_item_links on public.habits;
create trigger zz_forget_deleted_item_links
  after delete on public.habits
  for each row execute function public.forget_deleted_item_links();

-- Links already left by items deleted before this ran.

delete from public.drop_world_links l
where (l.drop_type = 'todo' and not exists (select 1 from public.todos t where t.id = l.drop_id))
   or (l.drop_type = 'note' and not exists (select 1 from public.notes n where n.id = l.drop_id))
   or (l.drop_type = 'habit' and not exists (select 1 from public.habits h where h.id = l.drop_id));

delete from public.drop_chapter_links l
where (l.drop_type = 'todo' and not exists (select 1 from public.todos t where t.id = l.drop_id))
   or (l.drop_type = 'note' and not exists (select 1 from public.notes n where n.id = l.drop_id))
   or (l.drop_type = 'habit' and not exists (select 1 from public.habits h where h.id = l.drop_id));

delete from public.drop_context_links l
where (l.drop_type = 'todo' and not exists (select 1 from public.todos t where t.id = l.drop_id))
   or (l.drop_type = 'note' and not exists (select 1 from public.notes n where n.id = l.drop_id))
   or (l.drop_type = 'habit' and not exists (select 1 from public.habits h where h.id = l.drop_id));

delete from public.drop_link_removals l
where (l.drop_type = 'todo' and not exists (select 1 from public.todos t where t.id = l.drop_id))
   or (l.drop_type = 'note' and not exists (select 1 from public.notes n where n.id = l.drop_id))
   or (l.drop_type = 'habit' and not exists (select 1 from public.habits h where h.id = l.drop_id));

commit;
