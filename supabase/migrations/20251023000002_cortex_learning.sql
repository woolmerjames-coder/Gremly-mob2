-- Phase 10.6: Learning hooks for Cortex
-- Adds fields to cortex_preferences used by the learning job.

alter table public.cortex_preferences
  add column if not exists routing_keywords jsonb default '{}'::jsonb, -- e.g., {"work":["meeting","qbr"], "fitness":["run","intervals"]}
  add column if not exists last_learned_at timestamptz;

-- (Optional) Helpful index for events scanning by time & kind
create index if not exists idx_events_kind_time on public.events(kind, created_at desc);

-- Verification queries (commented):
-- \d+ public.cortex_preferences
-- select user_id, routing_keywords, last_learned_at from public.cortex_preferences limit 5;
