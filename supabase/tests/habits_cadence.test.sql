select plan(3);

insert into habits (id, owner_id, name, title, cadence, target_per_period)
values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'Run',
  'Run',
  'weekly',
  4
);

select is(
  (select cadence from habits where name = 'Run' limit 1),
  'weekly',
  'cadence inserted ok'
);

select ok(
  exists(select 1 from view_today_items where title = 'Run'),
  'today view returns'
);

select ok(
  (
    select complete_item('habit', (select id from habits where name = 'Run' limit 1))
  ) is not null,
  'rpc works'
);
