-- Worlds rebuild: what the person took out of a World or a Chapter.
--
-- Taking an item out of a World or a Chapter deletes its link, and nothing
-- remembered it, so a later filing pass could put it back. Each removal is
-- kept here instead: Gremly's filing (inngest-jobs context/filing.js) never
-- puts an item back in a place it was taken out of, nor in a Chapter of a
-- World it was taken out of. Placing it there again by hand forgets it.
--
-- place_type is 'world' or 'chapter', and place_id is that World's or
-- Chapter's id. drop_type is the item's kind, as on the link tables.
--
-- Adds one table with its own row level security. Changes no data, drops
-- nothing.

begin;
set local lock_timeout = '10s';

create table if not exists public.drop_link_removals (
  owner_id uuid not null references auth.users (id) on delete cascade,
  drop_id uuid not null,
  drop_type text not null,
  place_type text not null check (place_type in ('world', 'chapter')),
  place_id uuid not null,
  removed_at timestamptz not null default now(),
  primary key (owner_id, drop_id, drop_type, place_type, place_id)
);

alter table public.drop_link_removals enable row level security;

drop policy if exists drop_link_removals_sel_own on public.drop_link_removals;
create policy drop_link_removals_sel_own on public.drop_link_removals
  for select using ((select auth.uid()) = owner_id);
drop policy if exists drop_link_removals_ins_own on public.drop_link_removals;
create policy drop_link_removals_ins_own on public.drop_link_removals
  for insert with check ((select auth.uid()) = owner_id);
drop policy if exists drop_link_removals_upd_own on public.drop_link_removals;
create policy drop_link_removals_upd_own on public.drop_link_removals
  for update using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists drop_link_removals_del_own on public.drop_link_removals;
create policy drop_link_removals_del_own on public.drop_link_removals
  for delete using ((select auth.uid()) = owner_id);

comment on table public.drop_link_removals is
  'What the person took out of a World or a Chapter themselves. Filing never puts it back there (Worlds rebuild).';

commit;
