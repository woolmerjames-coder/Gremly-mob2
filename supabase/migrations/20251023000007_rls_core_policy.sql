-- ============================================
-- RLS Core Policies Migration (final, owner_id + safe indexes)
-- ============================================

-- Enable RLS on all core tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'todos','habits','notes','spaces','tags','tag_map','people','entity_people'
  ] loop
    execute format('alter table if exists public.%I enable row level security;', t);
  end loop;
end $$;

-- =====================================================
-- Helper: adds correct USING / WITH CHECK by command
-- =====================================================
create or replace function public.__ensure_policy(
  p_table text,
  p_name text,
  p_cmd text,
  p_using text,
  p_check text
) returns void language plpgsql as $$
declare
  stmt text;
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = p_table
      and policyname = p_name
  ) then
    if p_cmd = 'insert' then
      -- INSERT → only WITH CHECK
      stmt := format(
        'create policy %I on public.%I for %s to authenticated with check (%s);',
        p_name, p_table, p_cmd, coalesce(p_check, 'true')
      );
    elsif p_cmd = 'update' then
      -- UPDATE → USING + WITH CHECK
      stmt := format(
        'create policy %I on public.%I for %s to authenticated using (%s) with check (%s);',
        p_name, p_table, p_cmd, coalesce(p_using, 'true'), coalesce(p_check, 'true')
      );
    else
      -- SELECT / DELETE → only USING
      stmt := format(
        'create policy %I on public.%I for %s to authenticated using (%s);',
        p_name, p_table, p_cmd, coalesce(p_using, 'true')
      );
    end if;
    execute stmt;
  end if;
end $$;

-- =====================================================
-- TODOS
-- =====================================================
select public.__ensure_policy('todos','todos_sel_own','select','owner_id = auth.uid()',NULL);
select public.__ensure_policy('todos','todos_ins_own','insert',NULL,'owner_id = auth.uid()');
select public.__ensure_policy('todos','todos_upd_own','update','owner_id = auth.uid()','owner_id = auth.uid()');
select public.__ensure_policy('todos','todos_del_own','delete','owner_id = auth.uid()',NULL);

-- =====================================================
-- HABITS
-- =====================================================
select public.__ensure_policy('habits','habits_sel_own','select','owner_id = auth.uid()',NULL);
select public.__ensure_policy('habits','habits_ins_own','insert',NULL,'owner_id = auth.uid()');
select public.__ensure_policy('habits','habits_upd_own','update','owner_id = auth.uid()','owner_id = auth.uid()');
select public.__ensure_policy('habits','habits_del_own','delete','owner_id = auth.uid()',NULL);

-- =====================================================
-- NOTES
-- =====================================================
select public.__ensure_policy('notes','notes_sel_own','select','owner_id = auth.uid()',NULL);
select public.__ensure_policy('notes','notes_ins_own','insert',NULL,'owner_id = auth.uid()');
select public.__ensure_policy('notes','notes_upd_own','update','owner_id = auth.uid()','owner_id = auth.uid()');
select public.__ensure_policy('notes','notes_del_own','delete','owner_id = auth.uid()',NULL);

-- =====================================================
-- SPACES
-- =====================================================
select public.__ensure_policy('spaces','spaces_sel_own','select','owner_id = auth.uid()',NULL);
select public.__ensure_policy('spaces','spaces_ins_own','insert',NULL,'owner_id = auth.uid()');
select public.__ensure_policy('spaces','spaces_upd_own','update','owner_id = auth.uid()','owner_id = auth.uid()');
select public.__ensure_policy('spaces','spaces_del_own','delete','owner_id = auth.uid()',NULL);

-- =====================================================
-- TAGS
-- =====================================================
select public.__ensure_policy('tags','tags_sel_own','select','owner_id = auth.uid()',NULL);
select public.__ensure_policy('tags','tags_ins_own','insert',NULL,'owner_id = auth.uid()');
select public.__ensure_policy('tags','tags_upd_own','update','owner_id = auth.uid()','owner_id = auth.uid()');
select public.__ensure_policy('tags','tags_del_own','delete','owner_id = auth.uid()',NULL);

-- =====================================================
-- TAG_MAP
-- =====================================================
select public.__ensure_policy('tag_map','tagmap_sel_own','select','owner_id = auth.uid()',NULL);
select public.__ensure_policy('tag_map','tagmap_ins_own','insert',NULL,'owner_id = auth.uid()');
select public.__ensure_policy('tag_map','tagmap_upd_own','update','owner_id = auth.uid()','owner_id = auth.uid()');
select public.__ensure_policy('tag_map','tagmap_del_own','delete','owner_id = auth.uid()',NULL);

-- =====================================================
-- PEOPLE
-- =====================================================
select public.__ensure_policy('people','people_sel_own','select','owner_id = auth.uid()',NULL);
select public.__ensure_policy('people','people_ins_own','insert',NULL,'owner_id = auth.uid()');
select public.__ensure_policy('people','people_upd_own','update','owner_id = auth.uid()','owner_id = auth.uid()');
select public.__ensure_policy('people','people_del_own','delete','owner_id = auth.uid()',NULL);

-- =====================================================
-- ENTITY_PEOPLE
-- =====================================================
select public.__ensure_policy('entity_people','ep_sel_own','select','owner_id = auth.uid()',NULL);
select public.__ensure_policy('entity_people','ep_ins_own','insert',NULL,'owner_id = auth.uid()');
select public.__ensure_policy('entity_people','ep_upd_own','update','owner_id = auth.uid()','owner_id = auth.uid()');
select public.__ensure_policy('entity_people','ep_del_own','delete','owner_id = auth.uid()',NULL);

-- =====================================================
-- Performance Indexes (safe version)
-- =====================================================
do $$
begin
  create index if not exists idx_todos_owner_due on public.todos (owner_id, due_at);
exception when undefined_column then
  raise notice 'Skipping idx_todos_owner_due (column missing)';
end $$;

do $$
begin
  create index if not exists idx_habits_owner_updated on public.habits (owner_id, updated_at);
exception when undefined_column then
  raise notice 'Skipping idx_habits_owner_updated (column missing)';
end $$;

-- Cleanup helper
drop function if exists public.__ensure_policy(text,text,text,text,text);
