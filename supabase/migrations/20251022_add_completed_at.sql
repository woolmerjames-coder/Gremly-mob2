-- Add completed_at to todos & habits (idempotent)
alter table if exists public.todos  add column if not exists completed_at timestamptz;
alter table if exists public.habits add column if not exists completed_at timestamptz;

-- Helpful indexes (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relname='idx_todos_completed_at' and n.nspname='public'
  ) then
    execute 'create index idx_todos_completed_at on public.todos(completed_at)';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relname='idx_habits_completed_at' and n.nspname='public'
  ) then
    execute 'create index idx_habits_completed_at on public.habits(completed_at)';
  end if;
end $$;
