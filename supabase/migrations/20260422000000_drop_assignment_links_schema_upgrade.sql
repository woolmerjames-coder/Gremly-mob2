-- ============================================================================
-- Migration: 20260422000000_drop_assignment_links_schema_upgrade
-- Purpose:   Phase 3.1 — Worlds & Chapters drop-assignment link schema upgrade
-- Scope:     Additive columns + column constraints on three existing join tables:
--              public.drop_world_links
--              public.drop_chapter_links
--              public.drop_context_links
-- Tables are empty at time of migration, so NOT NULL columns with defaults
-- are safe without a backfill step.
--
-- assigned_by values:
--   classifier: links written by the GPT-4.1-mini assignment step
--               (real-time post-drop or one-shot retroactive backfill)
--   user:       manual confirmations or overrides via Phase 4 curation UI
--   migration:  links rewritten during a world evolution event
--
-- RLS policies and existing indexes are deliberately unchanged. The composite
-- PK (drop_id, drop_type, <entity>_id) already covers backfill anti-join
-- queries via its leading drop_id column; no covering index is needed.
-- ============================================================================

BEGIN;

-- drop_world_links ────────────────────────────────────────────────────────────
alter table public.drop_world_links
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_confirmed_at timestamptz null,
  add column if not exists reason text null;

alter table public.drop_world_links
  alter column assigned_by set default 'classifier';

alter table public.drop_world_links
  alter column assigned_by set not null;

alter table public.drop_world_links
  add constraint drop_world_links_assigned_by_check
  check (assigned_by in ('classifier', 'user', 'migration'));

-- drop_chapter_links ─────────────────────────────────────────────────────────
alter table public.drop_chapter_links
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_confirmed_at timestamptz null,
  add column if not exists reason text null;

alter table public.drop_chapter_links
  alter column assigned_by set default 'classifier';

alter table public.drop_chapter_links
  alter column assigned_by set not null;

alter table public.drop_chapter_links
  add constraint drop_chapter_links_assigned_by_check
  check (assigned_by in ('classifier', 'user', 'migration'));

-- drop_context_links ─────────────────────────────────────────────────────────
alter table public.drop_context_links
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_confirmed_at timestamptz null,
  add column if not exists reason text null;

alter table public.drop_context_links
  alter column assigned_by set default 'classifier';

alter table public.drop_context_links
  alter column assigned_by set not null;

alter table public.drop_context_links
  add constraint drop_context_links_assigned_by_check
  check (assigned_by in ('classifier', 'user', 'migration'));

COMMIT;
