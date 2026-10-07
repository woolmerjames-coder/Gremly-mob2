-- Data fabric stage 2, part 4: one record for each person in someone's life.
--
-- A person lived in seven places as free text with no shared id. These tables
-- are new; public.people is left to reminders, which a live screen writes.
--
-- life_people: one row for each person in someone's life. name is what the
--   person calls them, and is empty while they are known only by who they
--   are ("my brother"). relationship is who they are to the person, in the
--   person's own words, and only ever from a fact the person stated
--   (relationship_fact_id); a correction to that fact clears it. Each field
--   says who wrote it, and a field the person wrote is never written over.
--   merged_into and hidden_at are set only by a tap.
-- life_person_names: every name a person has been called, each with the fact
--   it came from, so a correction to that fact takes the name away.
-- life_fact_people: which people each fact is about.
-- chapter_people: the people on a Chapter, as links in place of names in
--   text. Empty until the weekly pass writes it.
-- person_merges: two records proposed as one person, and, once the person
--   says yes, the merge with what it moved, so it can be undone. Code never
--   merges on its own: a proposal waits for a tap.
--
-- Additive. Run it as one piece.

begin;
set local lock_timeout = '10s';

create table if not exists public.life_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  name_by text not null default 'gremly' check (name_by in ('gremly', 'person')),
  relationship text,
  relationship_by text not null default 'gremly' check (relationship_by in ('gremly', 'person')),
  relationship_fact_id uuid references public.life_facts(id) on delete set null,
  merged_into uuid references public.life_people(id),
  hidden_at timestamptz,
  run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (name is not null or relationship is not null)
);
create index if not exists life_people_user_idx on public.life_people (user_id) where merged_into is null;

create table if not exists public.life_person_names (
  id bigserial primary key,
  person_id uuid not null references public.life_people(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  fact_id uuid references public.life_facts(id) on delete cascade,
  by text not null default 'gremly' check (by in ('gremly', 'person')),
  run_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists life_person_names_unique on public.life_person_names (person_id, name);
create index if not exists life_person_names_fact_idx on public.life_person_names (fact_id);

create table if not exists public.life_fact_people (
  fact_id uuid not null references public.life_facts(id) on delete cascade,
  person_id uuid not null references public.life_people(id) on delete cascade,
  user_id uuid not null,
  run_id text,
  created_at timestamptz not null default now(),
  primary key (fact_id, person_id)
);
create index if not exists life_fact_people_person_idx on public.life_fact_people (person_id);

create table if not exists public.chapter_people (
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  person_id uuid not null references public.life_people(id) on delete cascade,
  user_id uuid not null,
  written_by text not null default 'gremly' check (written_by in ('gremly', 'person')),
  created_at timestamptz not null default now(),
  primary key (chapter_id, person_id)
);

create table if not exists public.person_merges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kept_id uuid not null references public.life_people(id) on delete cascade,
  merged_id uuid not null references public.life_people(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'declined', 'merged', 'undone')),
  reason text,
  moved jsonb,
  run_id text,
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,
  check (kept_id <> merged_id)
);
create unique index if not exists person_merges_pair on public.person_merges (user_id, kept_id, merged_id);

alter table public.life_people enable row level security;
alter table public.life_person_names enable row level security;
alter table public.life_fact_people enable row level security;
alter table public.chapter_people enable row level security;
alter table public.person_merges enable row level security;
do $p$
declare t text;
begin
  foreach t in array array['life_people', 'life_person_names', 'life_fact_people', 'chapter_people', 'person_merges'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                   and policyname = t || '_select_own') then
      execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_select_own', t);
    end if;
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end $p$;

comment on table public.life_people is
  'One record for each person in someone''s life (data fabric stage 2). A relationship comes only from a fact the person stated; merges and hiding only by a tap.';
comment on table public.person_merges is
  'Two people records proposed as one, and merges the person said yes to, with what moved so a merge can be undone.';

notify pgrst, 'reload schema';

commit;
