-- ============================================
-- Pre-Phase 8 Entity People Setup
-- Ensures entity_people has the owner_id column before Phase 8 migration
-- Must run BEFORE 20251020032702_phase8_entity_people.sql
-- ============================================

-- Ensure entity_people table exists
create table if not exists public.entity_people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null, -- Modern column name
  entity_id uuid not null, -- Modern column name
  entity_type text not null, -- Modern column name
  person_name text,
  person_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add user_id as alias for owner_id if it doesn't exist (for old migration compatibility)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='user_id'
  ) then
    alter table public.entity_people add column user_id uuid generated always as (owner_id) stored;
    raise notice 'Added user_id as computed column alias for owner_id';
  end if;
exception when duplicate_column then
  raise notice 'user_id column already exists';
end $$;

-- Add item_id as alias for entity_id if it doesn't exist (for old migration compatibility)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='item_id'
  ) then
    alter table public.entity_people add column item_id uuid generated always as (entity_id) stored;
    raise notice 'Added item_id as computed column alias for entity_id';
  end if;
exception when duplicate_column then
  raise notice 'item_id column already exists';
end $$;

-- Add item_type as alias for entity_type if it doesn't exist (for old migration compatibility)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='entity_people' and column_name='item_type'
  ) then
    alter table public.entity_people add column item_type text generated always as (entity_type) stored;
    raise notice 'Added item_type as computed column alias for entity_type';
  end if;
exception when duplicate_column then
  raise notice 'item_type column already exists';
end $$;
