create table public.habit_reads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  week_start date not null,
  input_hash text not null,
  payload jsonb not null,
  model text,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, week_start)
);

create index habit_reads_owner_week_idx on public.habit_reads (owner_id, week_start);

alter table public.habit_reads enable row level security;
create policy "habit_reads_select_own" on public.habit_reads for select using (auth.uid() = owner_id);
create policy "habit_reads_insert_own" on public.habit_reads for insert with check (auth.uid() = owner_id);
create policy "habit_reads_update_own" on public.habit_reads for update using (auth.uid() = owner_id);
create policy "habit_reads_delete_own" on public.habit_reads for delete using (auth.uid() = owner_id);
