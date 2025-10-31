-- Phase 10.6: Simple milestones for Space timeline
-- Note: Align with repo/types using owner_id (Phase 10R standard)

create table if not exists public.space_milestones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null,
  date date not null,
  note text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.space_milestones enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'space_milestones'
      and policyname = 'space_milestones_select_own'
  ) then
    execute 'create policy "space_milestones_select_own"
      on public.space_milestones for select
      using (owner_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'space_milestones'
      and policyname = 'space_milestones_insert_own'
  ) then
    execute 'create policy "space_milestones_insert_own"
      on public.space_milestones for insert
      with check (owner_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'space_milestones'
      and policyname = 'space_milestones_update_own'
  ) then
    execute 'create policy "space_milestones_update_own"
      on public.space_milestones for update
      using (owner_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'space_milestones'
      and policyname = 'space_milestones_delete_own'
  ) then
    execute 'create policy "space_milestones_delete_own"
      on public.space_milestones for delete
      using (owner_id = auth.uid())';
  end if;
end
$$;

-- Optional helpful index for calendar queries
create index if not exists idx_space_milestones_space_date
  on public.space_milestones (space_id, date);
