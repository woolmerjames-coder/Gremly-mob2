-- ============================================
-- Pre-Phase 8 Tag Map Setup
-- Ensures tag_map has the columns that Phase 8 migrations expect
-- Must run BEFORE 20251020032701_phase8_tags_and_map.sql
-- ============================================

-- Ensure tag_map table exists with entity columns
create table if not exists public.tag_map (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  entity_id uuid not null,
  tag_id uuid,
  entity_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add item_id as alias for entity_id if it doesn't exist (for old migration compatibility)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='tag_map' and column_name='item_id'
  ) then
    alter table public.tag_map add column item_id uuid generated always as (entity_id) stored;
    raise notice 'Added item_id as computed column alias for entity_id';
  end if;
exception when duplicate_column then
  raise notice 'item_id column already exists';
end $$;

-- Add item_type as alias for entity_type if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='tag_map' and column_name='item_type'
  ) then
    alter table public.tag_map add column item_type text generated always as (entity_type) stored;
    raise notice 'Added item_type as computed column alias for entity_type';
  end if;
exception when duplicate_column then
  raise notice 'item_type column already exists';
end $$;
