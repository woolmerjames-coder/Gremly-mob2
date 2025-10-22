-- Phase 10.7: Complete Lists UX Setup
-- This migration ensures lists and list_items tables exist AND adds completed_at column

-- 1) Create cortex_preferences table if it doesn't exist (minimal version)
create table if not exists public.cortex_preferences (
  owner_id uuid primary key,
  tone text,
  brevity text,
  encouragement text,
  morning_preview text,
  evening_review text,
  dnd jsonb,
  updated_at timestamptz default now()
);

-- 2) Create lists table if it doesn't exist
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  key text not null,       -- 'shopping' | 'reading' | 'packing' | 'custom'
  name text not null,
  space_id uuid null,
  created_at timestamptz default now()
);
create index if not exists idx_lists_owner_key on public.lists(owner_id, key);
create index if not exists idx_lists_space on public.lists(space_id);

-- 3) Create list_items table if it doesn't exist
create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  label text not null,
  qty numeric null,
  unit text null,
  meta_json jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_list_items_list on public.list_items(list_id, created_at);

-- 4) Add completed_at column for Phase 10.7 Lists UX
alter table public.list_items
  add column if not exists completed_at timestamptz;

create index if not exists idx_list_items_completed
  on public.list_items(completed_at)
  where completed_at is not null;

-- 5) Create events table if it doesn't exist (for cortex functionality)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null,      -- 'cortex_decision' | 'user_override' | ...
  payload_json jsonb not null,
  created_at timestamptz default now()
);
create index if not exists idx_events_owner_kind_time on public.events(owner_id, kind, created_at desc);

-- 6) Create relations table if it doesn't exist (for generic relations)
create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  src_item_id uuid not null,
  rel text not null,       -- 'references' | 'contains' | 'belongs_to_space' | 'supersedes'
  dst_item_id uuid null,
  dst_space_id uuid null,
  created_at timestamptz default now()
);
create index if not exists idx_relations_src on public.relations(src_item_id);
create index if not exists idx_relations_dst on public.relations(dst_item_id);
create index if not exists idx_relations_space on public.relations(dst_space_id);

-- Verification:
-- \d+ public.list_items
-- select id, label, qty, unit, completed_at from public.list_items limit 5;