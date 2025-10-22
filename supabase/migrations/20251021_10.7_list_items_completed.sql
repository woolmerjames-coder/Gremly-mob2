-- Phase 10.7: Lists UX support — marking items done
-- Adds 'completed_at' to list_items so UI can check off items.
alter table public.list_items
  add column if not exists completed_at timestamptz;

create index if not exists idx_list_items_completed
  on public.list_items(completed_at)
  where completed_at is not null;

-- Verification:
-- \d+ public.list_items
-- select id, label, qty, unit, completed_at from public.list_items limit 5;