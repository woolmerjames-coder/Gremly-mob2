-- ============================================
-- Fix Entity People Columns
-- Add computed columns for backward compatibility with Phase 8 migrations
-- ============================================

-- Add item_id as alias for entity_id if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='item_id'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='entity_id'
  ) then
    alter table public.entity_people add column item_id uuid generated always as (entity_id) stored;
    raise notice 'Added item_id as computed column alias for entity_id';
  elsif not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='entity_id'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='item_id'
  ) then
    -- Rename existing item_id to entity_id first
    alter table public.entity_people rename column item_id to entity_id;
    -- Then add item_id back as computed column
    alter table public.entity_people add column item_id uuid generated always as (entity_id) stored;
    raise notice 'Renamed item_id to entity_id and added item_id as computed column';
  end if;
exception when duplicate_column then
  raise notice 'item_id column already exists';
end $$;

-- Add item_type as alias for entity_type if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='item_type'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='entity_type'
  ) then
    alter table public.entity_people add column item_type text generated always as (entity_type) stored;
    raise notice 'Added item_type as computed column alias for entity_type';
  elsif not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='entity_type'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='item_type'
  ) then
    -- Rename existing item_type to entity_type first
    alter table public.entity_people rename column item_type to entity_type;
    -- Then add item_type back as computed column
    alter table public.entity_people add column item_type text generated always as (entity_type) stored;
    raise notice 'Renamed item_type to entity_type and added item_type as computed column';
  end if;
exception when duplicate_column then
  raise notice 'item_type column already exists';
end $$;
