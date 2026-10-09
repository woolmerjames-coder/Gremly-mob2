-- Data fabric stage 2, part 3: what was written from what.
--
-- passage_refs: for every sentence Gremly stores, the table, row and field
-- that hold it, and the facts, people and items it rests on, with the writer,
-- model and prompt version. A writer replaces its record when it rewrites the
-- sentence. It is what lets a correction find exactly the sentences resting on
-- what changed (stage 6). The story and the weekly pass record theirs from
-- now on (workers/shared/passageRefs.js); the daily picture, the brief and the
-- other writers join as their stages rebuild them.
--
-- Filled once here from what already cites facts: the current story items and
-- the Life Map's threads.
--
-- Additive. Run it as one piece.

begin;
set local lock_timeout = '10s';

create table if not exists public.passage_refs (
  id bigserial primary key,
  user_id uuid not null,
  surface text not null,
  row_table text not null,
  row_id text not null,
  field text not null,
  fact_ids uuid[] not null default '{}',
  person_ids uuid[] not null default '{}',
  items jsonb not null default '[]'::jsonb,
  writer text not null,
  model text,
  prompt_version text,
  written_at timestamptz not null default now(),
  unique (row_table, row_id, field)
);
create index if not exists passage_refs_user_idx on public.passage_refs (user_id, surface);
create index if not exists passage_refs_facts_idx on public.passage_refs using gin (fact_ids);
create index if not exists passage_refs_people_idx on public.passage_refs using gin (person_ids);
alter table public.passage_refs enable row level security;
revoke all on public.passage_refs from anon, authenticated;
comment on table public.passage_refs is
  'What each stored sentence was written from: its table, row and field, and the facts, people and items it rests on (data fabric stage 2).';

insert into public.passage_refs (user_id, surface, row_table, row_id, field, fact_ids, writer, model, written_at)
select s.user_id, 'story', 'story_items', s.id::text, f.field, coalesce(s.fact_ids, '{}'), 'story', s.model,
  coalesce(s.updated_at, s.created_at, now())
from public.story_items s
cross join (values ('title'), ('body')) as f(field)
where s.state = 'current'
on conflict (row_table, row_id, field) do nothing;

insert into public.passage_refs (user_id, surface, row_table, row_id, field, fact_ids, writer, written_at)
select lm.user_id, 'life_map', 'user_life_map', lm.id::text,
  'domains.' || (dm.ord - 1) || '.threads.' || (th.ord - 1) || '.' || fld.field,
  array(
    select distinct (e ->> 'fact_id')::uuid
    from jsonb_array_elements(coalesce(th.thread -> 'evidence', '[]'::jsonb)) as e
    where coalesce(e ->> 'fact_id', '') ~ '^[0-9a-fA-F-]{36}$'
  ),
  'weekly', coalesce(lm.updated_at, now())
from public.user_life_map lm
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(lm.life_map -> 'domains') = 'array' then lm.life_map -> 'domains' else '[]'::jsonb end
) with ordinality as dm(dom, ord)
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(dm.dom -> 'threads') = 'array' then dm.dom -> 'threads' else '[]'::jsonb end
) with ordinality as th(thread, ord)
cross join (values ('summary'), ('recent_update')) as fld(field)
where coalesce(th.thread ->> fld.field, '') <> ''
on conflict (row_table, row_id, field) do nothing;

notify pgrst, 'reload schema';

commit;
