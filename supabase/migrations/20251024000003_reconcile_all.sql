-- ============================================
-- Reconcile All Tables Migration
-- Idempotent migration to align remote DB with app contract
-- ============================================

-- ===== TODOS =====
alter table if exists public.todos
  add column if not exists name text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists due_date date,
  add column if not exists due_time timestamptz,
  add column if not exists subtype text,
  add column if not exists reminders_json jsonb,
  add column if not exists notes text,
  add column if not exists ai_placed boolean default false,
  add column if not exists why_string text,
  add column if not exists space_id uuid,
  add column if not exists completed_at timestamptz,
  add column if not exists origin text;

-- backfill name/title minimally
update public.todos
  set name  = coalesce(nullif(name,''),  nullif(title,''),  'Untitled')
where coalesce(name,'') = '';

update public.todos
  set title = coalesce(nullif(title,''), nullif(name,''),   'Untitled')
where coalesce(title,'') = '';

-- helpful indexes (idempotent)
do $$ begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where c.relname='idx_todos_completed_at' and n.nspname='public') then
    create index idx_todos_completed_at on public.todos(completed_at);
  end if;
end $$;

-- ===== HABITS =====
alter table if exists public.habits
  add column if not exists name text,
  add column if not exists title text,
  add column if not exists completed_at timestamptz,
  add column if not exists ai_placed boolean default false,
  add column if not exists why_string text,
  add column if not exists space_id uuid,
  add column if not exists subtype text,
  add column if not exists origin text;

-- backfill name from title, then ensure both exist
update public.habits
  set name = coalesce(nullif(name,''), nullif(title,''), 'Untitled')
where coalesce(name,'') = '';

update public.habits
  set title = coalesce(nullif(title,''), nullif(name,''), 'Untitled')
where coalesce(title,'') = '';

do $$ begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where c.relname='idx_habits_completed_at' and n.nspname='public') then
    create index idx_habits_completed_at on public.habits(completed_at);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where c.relname='idx_habits_subtype' and n.nspname='public') then
    create index idx_habits_subtype on public.habits(owner_id, subtype);
  end if;
end $$;

-- ===== NOTES (journal entries live here) =====
alter table if exists public.notes
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists subtype text,
  add column if not exists origin text,
  add column if not exists fmt jsonb,
  add column if not exists date date,
  add column if not exists mood text,
  add column if not exists reminders_json jsonb,
  add column if not exists journal_subtype text,
  add column if not exists ai_placed boolean default false,
  add column if not exists why_string text,
  add column if not exists space_id uuid;

update public.notes
  set title = coalesce(nullif(title,''), 'Untitled')
where coalesce(title,'') = '';

-- ===== PEOPLE =====
alter table if exists public.people
  add column if not exists display_name text,
  add column if not exists owner_id uuid;

-- backfill display_name from name if that legacy column exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='people' and column_name='name'
  ) then
    execute $q$ update public.people
               set display_name = coalesce(display_name, name)
               where display_name is null $q$;
  end if;
end $$;

-- ===== TAGS & TAG_MAP =====
-- cols
alter table if exists public.tags
  add column if not exists name text,
  add column if not exists user_id uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.tag_map
  add column if not exists entity_type text, -- 'todo' | 'habit' | 'note' | etc
  add column if not exists entity_id uuid,
  add column if not exists tag_id uuid,
  add column if not exists user_id uuid,
  add column if not exists created_at timestamptz default now();

-- indexes
do $$ begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where c.relname='idx_tags_user_id' and n.nspname='public') then
    create index idx_tags_user_id on public.tags(user_id);
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where c.relname='idx_tag_map_user_id' and n.nspname='public') then
    create index idx_tag_map_user_id on public.tag_map(user_id);
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where c.relname='idx_tag_map_entity' and n.nspname='public') then
    create index idx_tag_map_entity on public.tag_map(entity_type, entity_id);
  end if;
end $$;

-- RLS ON
alter table if exists public.tags    enable row level security;
alter table if exists public.tag_map enable row level security;

-- policies (idempotent)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='Users can view their own tags') then
    execute 'create policy "Users can view their own tags"   on public.tags    for select using (user_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='Users can insert their own tags') then
    execute 'create policy "Users can insert their own tags" on public.tags    for insert with check (user_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='Users can update their own tags') then
    execute 'create policy "Users can update their own tags" on public.tags    for update using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='Users can delete their own tags') then
    execute 'create policy "Users can delete their own tags" on public.tags    for delete using (user_id = auth.uid())';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tag_map' and policyname='Users can view their own tag mappings') then
    execute 'create policy "Users can view their own tag mappings" on public.tag_map for select using (user_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tag_map' and policyname='Users can insert their own tag mappings') then
    execute 'create policy "Users can insert their own tag mappings" on public.tag_map for insert with check (user_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tag_map' and policyname='Users can update their own tag mappings') then
    execute 'create policy "Users can update their own tag mappings" on public.tag_map for update using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tag_map' and policyname='Users can delete their own tag mappings') then
    execute 'create policy "Users can delete their own tag mappings" on public.tag_map for delete using (user_id = auth.uid())';
  end if;
end $$;

-- ===== FINAL: normalize "not null" gently after backfills =====
do $$ begin
  -- todos
  begin
    alter table public.todos alter column name  set not null;
  exception when others then null; end;
  begin
    alter table public.todos alter column title set not null;
  exception when others then null; end;
  
  -- habits
  begin
    alter table public.habits alter column name  set not null;
  exception when others then null; end;
  begin
    alter table public.habits alter column title set not null;
  exception when others then null; end;
  
  -- notes
  begin
    alter table public.notes alter column title set not null;
  exception when others then null; end;
end $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
