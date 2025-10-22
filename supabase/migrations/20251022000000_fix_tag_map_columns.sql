-- ============================================
-- Fix Phase 8 Tag Map Column Names
-- Reconciles old item_id column with new entity_id/entity_type naming
-- Idempotent
-- ============================================

do $$
begin
  -- If old item_id column exists and entity_id doesn't, rename it
  if exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='tag_map' and column_name='item_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tag_map' and column_name='entity_id'
  ) then
    alter table public.tag_map rename column item_id to entity_id;
    raise notice 'Renamed tag_map.item_id to entity_id';
  end if;
  
  -- If old item_type column exists and entity_type doesn't, rename it
  if exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='tag_map' and column_name='item_type'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tag_map' and column_name='entity_type'
  ) then
    alter table public.tag_map rename column item_type to entity_type;
    raise notice 'Renamed tag_map.item_type to entity_type';
  end if;
  
  -- Drop old index if it exists
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relname='idx_tag_map_item' and n.nspname='public'
  ) then
    drop index if exists public.idx_tag_map_item;
    raise notice 'Dropped old idx_tag_map_item index';
  end if;
  
  -- Create new index if it doesn't exist
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relname='idx_tag_map_entity' and n.nspname='public'
  ) then
    create index idx_tag_map_entity on public.tag_map(entity_type, entity_id);
    raise notice 'Created idx_tag_map_entity index';
  end if;
end $$;
