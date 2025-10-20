-- Phase 8: Tags and Tag Mapping Tables
-- Purpose: Support tagging system for habits, todos, notes, journal entries, catchall, and spaces

-- Ensure uuid extension is available
create extension if not exists "uuid-ossp";

-- Create reusable updated_at trigger function
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create tags table
create table if not exists public.tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Create tag_map junction table
create table if not exists public.tag_map (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  item_id uuid not null,
  tag_id uuid not null references public.tags(id) on delete cascade,
  item_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tag_map_item_type_check check (item_type in ('habit','todo','journal','note','catchall','space'))
);

-- Create indexes for performance
create index if not exists idx_tags_user on public.tags(user_id, name);
create index if not exists idx_tag_map_user on public.tag_map(user_id);
create index if not exists idx_tag_map_item on public.tag_map(item_id);
create index if not exists idx_tag_map_tag on public.tag_map(tag_id);
create index if not exists idx_tag_map_item_type on public.tag_map(item_type);

-- Create updated_at triggers
drop trigger if exists trg_tags_updated_at on public.tags;
create trigger trg_tags_updated_at before update on public.tags
for each row execute function public.set_updated_at();

drop trigger if exists trg_tag_map_updated_at on public.tag_map;
create trigger trg_tag_map_updated_at before update on public.tag_map
for each row execute function public.set_updated_at();

-- Enable RLS on tags table
alter table public.tags enable row level security;

-- Drop existing policies if they exist
drop policy if exists "tags_select_own" on public.tags;
drop policy if exists "tags_insert_own" on public.tags;
drop policy if exists "tags_update_own" on public.tags;
drop policy if exists "tags_delete_own" on public.tags;

-- Create RLS policies for tags
create policy "tags_select_own" on public.tags for select using (auth.uid() = user_id);
create policy "tags_insert_own" on public.tags for insert with check (auth.uid() = user_id);
create policy "tags_update_own" on public.tags for update using (auth.uid() = user_id);
create policy "tags_delete_own" on public.tags for delete using (auth.uid() = user_id);

-- Enable RLS on tag_map table
alter table public.tag_map enable row level security;

-- Drop existing policies if they exist
drop policy if exists "tagmap_select_own" on public.tag_map;
drop policy if exists "tagmap_insert_own" on public.tag_map;
drop policy if exists "tagmap_update_own" on public.tag_map;
drop policy if exists "tagmap_delete_own" on public.tag_map;

-- Create RLS policies for tag_map
create policy "tagmap_select_own" on public.tag_map for select using (auth.uid() = user_id);
create policy "tagmap_insert_own" on public.tag_map for insert with check (auth.uid() = user_id);
create policy "tagmap_update_own" on public.tag_map for update using (auth.uid() = user_id);
create policy "tagmap_delete_own" on public.tag_map for delete using (auth.uid() = user_id);
