-- ============================================
-- Schema Doctor - Read-only Validation
-- Validates expected columns and raises notices for missing items
-- Never fails - only reports issues
-- ============================================

do $$
declare
  missing int := 0;
begin
  -- ===== TODOS columns =====
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='todos' and column_name='name') then
    raise notice 'MISSING: todos.name';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='todos' and column_name='title') then
    raise notice 'MISSING: todos.title';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='todos' and column_name='due_time') then
    raise notice 'MISSING: todos.due_time';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='todos' and column_name='completed_at') then
    raise notice 'MISSING: todos.completed_at';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='todos' and column_name='why_string') then
    raise notice 'MISSING: todos.why_string';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='todos' and column_name='origin') then
    raise notice 'MISSING: todos.origin';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='todos' and column_name='subtype') then
    raise notice 'MISSING: todos.subtype';
    missing := missing + 1;
  end if;
  
  -- ===== HABITS columns =====
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='name') then
    raise notice 'MISSING: habits.name';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='title') then
    raise notice 'MISSING: habits.title';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='completed_at') then
    raise notice 'MISSING: habits.completed_at';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='subtype') then
    raise notice 'MISSING: habits.subtype';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='why_string') then
    raise notice 'MISSING: habits.why_string';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='habits' and column_name='origin') then
    raise notice 'MISSING: habits.origin';
    missing := missing + 1;
  end if;
  
  -- ===== NOTES columns =====
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='notes' and column_name='title') then
    raise notice 'MISSING: notes.title';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='notes' and column_name='subtype') then
    raise notice 'MISSING: notes.subtype';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='notes' and column_name='journal_subtype') then
    raise notice 'MISSING: notes.journal_subtype';
    missing := missing + 1;
  end if;
  
  -- ===== TAGS & TAG_MAP columns =====
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='tags' and column_name='user_id') then
    raise notice 'MISSING: tags.user_id';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='tag_map' and column_name='user_id') then
    raise notice 'MISSING: tag_map.user_id';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='tag_map' and column_name='entity_type') then
    raise notice 'MISSING: tag_map.entity_type';
    missing := missing + 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='tag_map' and column_name='entity_id') then
    raise notice 'MISSING: tag_map.entity_id';
    missing := missing + 1;
  end if;
  
  -- ===== PEOPLE columns =====
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='people' and column_name='display_name') then
    raise notice 'MISSING: people.display_name';
    missing := missing + 1;
  end if;
  
  -- Summary
  if missing = 0 then
    raise notice '✓ Schema doctor completed - all expected columns present';
  else
    raise notice '⚠ Schema doctor completed - missing % column(s)', missing;
  end if;
end $$;
