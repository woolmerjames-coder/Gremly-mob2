-- Phase 10R: Schema Alignment Hotfix
-- Source: docs/10R_audit.md (Immediate + High Priority fixes)
-- Date: 2025-10-21
-- Purpose: Fix critical schema-code mismatches found in audit
--
-- IMPORTANT: After applying this migration, regenerate Supabase types:
--   npx supabase gen types typescript --local > lib/supabase/database.types.ts
--
-- This ensures DBTagInsert, DBTagMapInsert, DBEntityPeopleInsert match schema

-- =============================================================================
-- Fix 1: Add id column to entity_people
-- Allows unlinkPerson(id) without altering composite PK
-- =============================================================================

ALTER TABLE entity_people 
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Create unique index on id (allows queries by id while keeping composite PK)
CREATE UNIQUE INDEX IF NOT EXISTS entity_people_id_unique ON entity_people(id);

-- Backfill any existing rows that might have NULL id (idempotent)
UPDATE entity_people SET id = gen_random_uuid() WHERE id IS NULL;

-- =============================================================================
-- Fix 2: Standardize owner field names (user_id → owner_id)
-- Aligns with RLS convention used in todos, habits, notes, spaces
-- =============================================================================

-- Tags table: user_id → owner_id
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tags' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE tags RENAME COLUMN user_id TO owner_id;
  END IF;
END $$;

-- TagMap table: user_id → owner_id
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tag_map' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE tag_map RENAME COLUMN user_id TO owner_id;
  END IF;
END $$;

-- =============================================================================
-- Fix 3: Standardize TagMap link field names (item_* → entity_*)
-- Matches lib/types.ts EntityType convention
-- =============================================================================

-- item_id → entity_id (only if entity_id doesn't already exist)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tag_map' AND column_name = 'item_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tag_map' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE tag_map RENAME COLUMN item_id TO entity_id;
  END IF;
END $$;

-- item_type → entity_type (only if entity_type doesn't already exist)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tag_map' AND column_name = 'item_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tag_map' AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE tag_map RENAME COLUMN item_type TO entity_type;
  END IF;
END $$;

-- Update check constraint to use new column name
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tag_map_item_type_check'
  ) THEN
    ALTER TABLE tag_map DROP CONSTRAINT tag_map_item_type_check;
  END IF;
  
  -- Add constraint with new column name (if not exists)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tag_map_entity_type_check'
  ) THEN
    ALTER TABLE tag_map ADD CONSTRAINT tag_map_entity_type_check 
      CHECK (entity_type IN ('habit','todo','journal','note','catchall','space'));
  END IF;
END $$;

-- =============================================================================
-- Fix 4: Add missing color column to tags
-- =============================================================================

ALTER TABLE tags ADD COLUMN IF NOT EXISTS color text NULL;

-- =============================================================================
-- Fix 5: Add helpful indexes for common query patterns
-- =============================================================================

-- Todos: space filtering and due date queries
CREATE INDEX IF NOT EXISTS idx_todos_space_id ON todos(space_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date) WHERE due_date IS NOT NULL;

-- Only create completed_at index if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'todos' AND column_name = 'completed_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_todos_completed_at ON todos(completed_at) WHERE completed_at IS NOT NULL;
  END IF;
END $$;

-- Habits: space filtering and completions
CREATE INDEX IF NOT EXISTS idx_habits_space_id ON habits(space_id);

-- Only create completed_at index if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'habits' AND column_name = 'completed_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_habits_completed_at ON habits(completed_at) WHERE completed_at IS NOT NULL;
  END IF;
END $$;

-- Notes: space filtering and chronological queries
CREATE INDEX IF NOT EXISTS idx_notes_space_id ON notes(space_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);

-- Entity people: faster lookups by entity
CREATE INDEX IF NOT EXISTS idx_entity_people_entity ON entity_people(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_people_person ON entity_people(person_id);

-- Tag map: faster tag queries by entity
CREATE INDEX IF NOT EXISTS idx_tag_map_entity ON tag_map(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_tag_map_owner_entity ON tag_map(owner_id, entity_id);

-- =============================================================================
-- Verification Section
-- =============================================================================

-- To verify migration succeeded, run these queries:

-- 1. Check entity_people now has id column:
--    \d+ entity_people
--    Expected: id uuid with unique index

-- 2. Check tags uses owner_id (not user_id):
--    \d+ tags
--    Expected: owner_id uuid column

-- 3. Check tag_map uses owner_id, entity_id, entity_type:
--    \d+ tag_map
--    Expected: owner_id, entity_id, entity_type columns

-- 4. Check tags has color column:
--    SELECT column_name FROM information_schema.columns 
--    WHERE table_name = 'tags' AND column_name = 'color';
--    Expected: 1 row

-- 5. Verify indexes exist:
--    \di idx_todos_space_id
--    \di idx_entity_people_entity

-- Sample verification queries:
-- SELECT id, person_id, entity_type, entity_id FROM entity_people LIMIT 5;
-- SELECT id, owner_id, name, color FROM tags LIMIT 5;
-- SELECT id, owner_id, entity_id, entity_type, tag_id FROM tag_map LIMIT 5;
