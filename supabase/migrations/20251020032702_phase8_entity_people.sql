-- Phase 8: Entity-People Linking Table
-- Purpose: Link habits, todos, notes, journal entries, catchall, and spaces to people mentioned/involved
-- Note: No foreign key to people table - stores denormalized data for flexibility

-- Create entity_people table
create table if not exists public.entity_people (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  item_id uuid not null,
  item_type text not null,
  person_name text,
  person_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_people_item_type_check check (item_type in ('habit','todo','journal','note','catchall','space'))
);

-- Create indexes for performance
create index if not exists idx_entity_people_user on public.entity_people(user_id);
create index if not exists idx_entity_people_item on public.entity_people(item_id);
create index if not exists idx_entity_people_item_type on public.entity_people(item_type);

-- Create updated_at trigger
drop trigger if exists trg_entity_people_updated_at on public.entity_people;
create trigger trg_entity_people_updated_at before update on public.entity_people
for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.entity_people enable row level security;

-- Drop existing policies if they exist
drop policy if exists "entity_people_select_own" on public.entity_people;
drop policy if exists "entity_people_insert_own" on public.entity_people;
drop policy if exists "entity_people_update_own" on public.entity_people;
drop policy if exists "entity_people_delete_own" on public.entity_people;

-- Create RLS policies for entity_people
create policy "entity_people_select_own" on public.entity_people for select using (auth.uid() = user_id);
create policy "entity_people_insert_own" on public.entity_people for insert with check (auth.uid() = user_id);
create policy "entity_people_update_own" on public.entity_people for update using (auth.uid() = user_id);
create policy "entity_people_delete_own" on public.entity_people for delete using (auth.uid() = user_id);
