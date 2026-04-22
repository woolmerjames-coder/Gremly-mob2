-- ============================================================================
-- Rollback: 20260421120000_worlds_foundation
-- Purpose:  Reverse the Phase 1 foundation migration
-- Notes:    CASCADE drops eliminate all indexes, RLS policies, and FK
--           constraints along with the tables. Safe to run even against a
--           partially-applied migration.
-- ============================================================================

BEGIN;

-- Drop in reverse dependency order. CASCADE is explicit because child tables
-- reference parent tables via FKs; without CASCADE the drop would fail if
-- any junction rows exist.

DROP TABLE IF EXISTS public.world_lineage       CASCADE;
DROP TABLE IF EXISTS public.drop_context_links  CASCADE;
DROP TABLE IF EXISTS public.drop_chapter_links  CASCADE;
DROP TABLE IF EXISTS public.drop_world_links    CASCADE;
DROP TABLE IF EXISTS public.chapter_world_links CASCADE;
DROP TABLE IF EXISTS public.life_contexts       CASCADE;
DROP TABLE IF EXISTS public.chapters            CASCADE;
DROP TABLE IF EXISTS public.worlds              CASCADE;

COMMIT;
