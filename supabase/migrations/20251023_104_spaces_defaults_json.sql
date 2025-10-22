-- Phase 10.4: Add defaults_json to spaces table
-- Purpose: Store per-space configuration for Cortex biasing and tone shaping
-- Author: Gremly AI
-- Date: 2025-10-21

-- Add defaults_json column for lightweight per-space configuration
alter table public.spaces
  add column if not exists defaults_json jsonb;

-- Add helpful comment explaining the schema
comment on column public.spaces.defaults_json is
  'Per-space defaults for Cortex biasing and UX hints. JSON structure: {"tone":"warm"|"calm"|"direct", "allowedTypes":["todo","habit","journal","note"], "preferredListKeys":["shopping","packing"], "reminderWindows":{"morning":["07:00","10:00"]}}. Used to shape AI decisions and explanations per-space context.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- 
-- Check the new column exists:
-- \d+ public.spaces
-- 
-- View sample data:
-- select id, name, defaults_json from public.spaces limit 5;
-- 
-- Example usage - set defaults for a space:
-- update public.spaces
--   set defaults_json = '{"tone":"warm","allowedTypes":["todo","habit"],"preferredListKeys":["shopping"]}'::jsonb
--   where id = 'some-space-id';
-- 
-- Query spaces with specific tone preference:
-- select id, name, defaults_json->>'tone' as tone
--   from public.spaces
--   where defaults_json->>'tone' = 'warm';
