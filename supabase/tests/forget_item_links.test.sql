-- Deleting a todo, a note or a habit removes its World, Chapter and life
-- context links, and the record of it being taken out of a place
-- (migration 20261021090000_forget_deleted_item_links.sql). Archiving keeps
-- them, and nothing of another item is touched.

begin;

create extension if not exists pgtap;

select plan(11);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-0000000000f1', 'forget-links@example.com')
on conflict do nothing;

insert into public.worlds (id, owner_id, name, source, phase)
values ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Home', 'user', 'active');

insert into public.chapters (id, owner_id, title, source, phase)
values ('f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'The move', 'user', 'active');

insert into public.life_contexts (id, owner_id, name, kind, source)
values ('f3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Work', 'employer', 'user_created');

insert into public.todos (id, owner_id, name, title) values
  ('f4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Deleted todo', 'Deleted todo'),
  ('f4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'Kept todo', 'Kept todo'),
  ('f4000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000f1', 'Archived todo', 'Archived todo');

insert into public.notes (id, owner_id, title)
values ('f5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Deleted note');

insert into public.habits (id, owner_id, name, title)
values ('f6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Deleted habit', 'Deleted habit');

insert into public.drop_world_links (drop_id, drop_type, world_id, owner_id) values
  ('f4000000-0000-0000-0000-000000000001', 'todo', 'f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('f4000000-0000-0000-0000-000000000002', 'todo', 'f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('f4000000-0000-0000-0000-000000000003', 'todo', 'f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('f5000000-0000-0000-0000-000000000001', 'note', 'f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('f6000000-0000-0000-0000-000000000001', 'habit', 'f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1');

insert into public.drop_chapter_links (drop_id, drop_type, chapter_id, owner_id) values
  ('f4000000-0000-0000-0000-000000000001', 'todo', 'f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('f4000000-0000-0000-0000-000000000002', 'todo', 'f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'),
  ('f5000000-0000-0000-0000-000000000001', 'note', 'f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1');

insert into public.drop_context_links (drop_id, drop_type, context_id, owner_id) values
  ('f4000000-0000-0000-0000-000000000001', 'todo', 'f3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1');

insert into public.drop_link_removals (owner_id, drop_id, drop_type, place_type, place_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'f6000000-0000-0000-0000-000000000001', 'habit', 'chapter', 'f2000000-0000-0000-0000-000000000001');

delete from public.todos where id = 'f4000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.drop_world_links where drop_id = 'f4000000-0000-0000-0000-000000000001'),
  0,
  'a deleted todo leaves no World link'
);
select is(
  (select count(*)::int from public.drop_chapter_links where drop_id = 'f4000000-0000-0000-0000-000000000001'),
  0,
  'a deleted todo leaves no Chapter link'
);
select is(
  (select count(*)::int from public.drop_context_links where drop_id = 'f4000000-0000-0000-0000-000000000001'),
  0,
  'a deleted todo leaves no life context link'
);

delete from public.notes where id = 'f5000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.drop_world_links where drop_id = 'f5000000-0000-0000-0000-000000000001'),
  0,
  'a deleted note leaves no World link'
);
select is(
  (select count(*)::int from public.drop_chapter_links where drop_id = 'f5000000-0000-0000-0000-000000000001'),
  0,
  'a deleted note leaves no Chapter link'
);

delete from public.habits where id = 'f6000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.drop_world_links where drop_id = 'f6000000-0000-0000-0000-000000000001'),
  0,
  'a deleted habit leaves no World link'
);
select is(
  (select count(*)::int from public.drop_link_removals where drop_id = 'f6000000-0000-0000-0000-000000000001'),
  0,
  'a deleted habit leaves no record of being taken out of a place'
);

update public.todos set archived = true, status = 'archived'
where id = 'f4000000-0000-0000-0000-000000000003';

select is(
  (select count(*)::int from public.drop_world_links where drop_id = 'f4000000-0000-0000-0000-000000000003'),
  1,
  'an archived todo keeps its World link'
);

select is(
  (select count(*)::int from public.drop_world_links where drop_id = 'f4000000-0000-0000-0000-000000000002'),
  1,
  'another todo keeps its World link'
);
select is(
  (select count(*)::int from public.drop_chapter_links where drop_id = 'f4000000-0000-0000-0000-000000000002'),
  1,
  'another todo keeps its Chapter link'
);

select is(
  (select count(*)::int from public.worlds where id = 'f1000000-0000-0000-0000-000000000001'),
  1,
  'the World itself stays'
);

select * from finish();

rollback;
