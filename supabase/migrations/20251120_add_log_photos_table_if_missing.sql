-- Migration: Add log_photos table for multi-photo log support
-- Safe to run on existing databases (uses IF NOT EXISTS guards)
-- Created: 2025-11-20

-- ============================================================================
-- 1. Create log_photos table (if it doesn't already exist)
-- ============================================================================

create table if not exists public.log_photos (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. Add indexes (if they don't already exist)
-- ============================================================================

-- Composite index for efficient queries by note + position ordering
create index if not exists log_photos_note_id_position_idx
  on public.log_photos (note_id, position);

-- Index for owner-based queries (RLS performance)
create index if not exists log_photos_owner_id_idx
  on public.log_photos (owner_id);

-- ============================================================================
-- 3. Enable Row Level Security
-- ============================================================================

alter table public.log_photos enable row level security;

-- ============================================================================
-- 4. Create RLS Policies (with existence checks)
-- ============================================================================

-- Policy: SELECT - Users can view their own log photos
do $$ 
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'log_photos' 
    and policyname = 'log_photos_select_own'
  ) then
    create policy log_photos_select_own
      on public.log_photos
      for select
      using (auth.uid() = owner_id);
  end if;
end $$;

-- Policy: INSERT - Users can insert their own log photos
do $$ 
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'log_photos' 
    and policyname = 'log_photos_insert_own'
  ) then
    create policy log_photos_insert_own
      on public.log_photos
      for insert
      with check (auth.uid() = owner_id);
  end if;
end $$;

-- Policy: UPDATE - Users can update their own log photos
do $$ 
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'log_photos' 
    and policyname = 'log_photos_update_own'
  ) then
    create policy log_photos_update_own
      on public.log_photos
      for update
      using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;
end $$;

-- Policy: DELETE - Users can delete their own log photos
do $$ 
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'log_photos' 
    and policyname = 'log_photos_delete_own'
  ) then
    create policy log_photos_delete_own
      on public.log_photos
      for delete
      using (auth.uid() = owner_id);
  end if;
end $$;

-- ============================================================================
-- Migration complete
-- ============================================================================
-- This migration is safe to run multiple times.
-- All operations use IF NOT EXISTS guards or DO blocks with existence checks.
