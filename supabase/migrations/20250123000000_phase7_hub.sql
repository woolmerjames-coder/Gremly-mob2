-- ============================================================================
-- Phase 7 Hub Migration
-- Date: 2025-01-23
-- Description: Adds Tags, People, and Phase 7 Hub features
-- ============================================================================

-- This migration adds:
-- 1. Tags dictionary table
-- 2. Tag-to-entity mapping table (tag_map)
-- 3. People table
-- 4. Person-to-entity mapping table (entity_people)
-- 5. Phase 7 fields on core tables (space_id, ai_placed, subtype)
-- 6. Row-Level Security (RLS) policies for all new tables

-- ============================================================================
-- STEP 1: Create Tags Tables
-- ============================================================================

-- Tags dictionary: user's personal tag vocabulary
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW(),
  UNIQUE (owner_id, name)
);

-- Tag-to-entity mapping: many-to-many relationship
CREATE TABLE IF NOT EXISTS tag_map (
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('habit', 'todo', 'note')),
  entity_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT NOW(),
  PRIMARY KEY (tag_id, entity_type, entity_id)
);

-- Create indexes for tag lookups
CREATE INDEX IF NOT EXISTS idx_tags_owner_id ON tags(owner_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(owner_id, name);
CREATE INDEX IF NOT EXISTS idx_tag_map_entity ON tag_map(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_tag_map_owner ON tag_map(owner_id);
CREATE INDEX IF NOT EXISTS idx_tag_map_tag_id ON tag_map(tag_id);

-- ============================================================================
-- STEP 2: Create People Tables
-- ============================================================================

-- People: user's personal contact list
CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email text,
  notes text,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW()
);

-- Person-to-entity mapping: many-to-many relationship
CREATE TABLE IF NOT EXISTS entity_people (
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('habit', 'todo', 'note')),
  entity_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT NOW(),
  PRIMARY KEY (person_id, entity_type, entity_id)
);

-- Create indexes for people lookups
CREATE INDEX IF NOT EXISTS idx_people_owner_id ON people(owner_id);
CREATE INDEX IF NOT EXISTS idx_people_display_name ON people(owner_id, display_name);
CREATE INDEX IF NOT EXISTS idx_entity_people_entity ON entity_people(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_people_owner ON entity_people(owner_id);
CREATE INDEX IF NOT EXISTS idx_entity_people_person_id ON entity_people(person_id);

-- ============================================================================
-- STEP 3: Add Phase 7 Fields to Core Tables
-- ============================================================================

-- Add space_id to core tables (safe if column exists)
ALTER TABLE habits ADD COLUMN IF NOT EXISTS space_id uuid NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS space_id uuid NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS space_id uuid NULL;

-- Add ai_placed flag to core tables (safe if column exists)
ALTER TABLE habits ADD COLUMN IF NOT EXISTS ai_placed boolean NOT NULL DEFAULT false;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS ai_placed boolean NOT NULL DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS ai_placed boolean NOT NULL DEFAULT false;

-- Add subtype to notes table for categorization (safe if column exists)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS subtype text NULL CHECK (subtype IN ('journal', 'idea', 'list', 'reference'));

-- Create indexes for Phase 7 fields
CREATE INDEX IF NOT EXISTS idx_habits_space_id ON habits(space_id) WHERE space_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todos_space_id ON todos(space_id) WHERE space_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_space_id ON notes(space_id) WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_habits_ai_placed ON habits(owner_id, ai_placed) WHERE ai_placed = true;
CREATE INDEX IF NOT EXISTS idx_todos_ai_placed ON todos(owner_id, ai_placed) WHERE ai_placed = true;
CREATE INDEX IF NOT EXISTS idx_notes_ai_placed ON notes(owner_id, ai_placed) WHERE ai_placed = true;

CREATE INDEX IF NOT EXISTS idx_notes_subtype ON notes(owner_id, subtype) WHERE subtype IS NOT NULL;

-- ============================================================================
-- STEP 4: Create Updated-At Trigger Function (if not exists)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- ============================================================================
-- STEP 5: Add Updated-At Triggers to New Tables
-- ============================================================================

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
CREATE TRIGGER update_tags_updated_at
    BEFORE UPDATE ON tags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_people_updated_at ON people;
CREATE TRIGGER update_people_updated_at
    BEFORE UPDATE ON people
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 6: Enable Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_people ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 7: Create RLS Policies for Tags
-- ============================================================================

-- Tags: Users can only see/manage their own tags
DROP POLICY IF EXISTS "Users can view their own tags" ON tags;
CREATE POLICY "Users can view their own tags"
  ON tags FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own tags" ON tags;
CREATE POLICY "Users can insert their own tags"
  ON tags FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own tags" ON tags;
CREATE POLICY "Users can update their own tags"
  ON tags FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own tags" ON tags;
CREATE POLICY "Users can delete their own tags"
  ON tags FOR DELETE
  USING (auth.uid() = owner_id);

-- ============================================================================
-- STEP 8: Create RLS Policies for Tag Map
-- ============================================================================

-- Tag Map: Users can only see/manage their own tag mappings
DROP POLICY IF EXISTS "Users can view their own tag mappings" ON tag_map;
CREATE POLICY "Users can view their own tag mappings"
  ON tag_map FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own tag mappings" ON tag_map;
CREATE POLICY "Users can insert their own tag mappings"
  ON tag_map FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own tag mappings" ON tag_map;
CREATE POLICY "Users can update their own tag mappings"
  ON tag_map FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own tag mappings" ON tag_map;
CREATE POLICY "Users can delete their own tag mappings"
  ON tag_map FOR DELETE
  USING (auth.uid() = owner_id);

-- ============================================================================
-- STEP 9: Create RLS Policies for People
-- ============================================================================

-- People: Users can only see/manage their own contacts
DROP POLICY IF EXISTS "Users can view their own people" ON people;
CREATE POLICY "Users can view their own people"
  ON people FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own people" ON people;
CREATE POLICY "Users can insert their own people"
  ON people FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own people" ON people;
CREATE POLICY "Users can update their own people"
  ON people FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own people" ON people;
CREATE POLICY "Users can delete their own people"
  ON people FOR DELETE
  USING (auth.uid() = owner_id);

-- ============================================================================
-- STEP 10: Create RLS Policies for Entity-People Map
-- ============================================================================

-- Entity-People Map: Users can only see/manage their own person-entity mappings
DROP POLICY IF EXISTS "Users can view their own entity-people mappings" ON entity_people;
CREATE POLICY "Users can view their own entity-people mappings"
  ON entity_people FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert their own entity-people mappings" ON entity_people;
CREATE POLICY "Users can insert their own entity-people mappings"
  ON entity_people FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update their own entity-people mappings" ON entity_people;
CREATE POLICY "Users can update their own entity-people mappings"
  ON entity_people FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete their own entity-people mappings" ON entity_people;
CREATE POLICY "Users can delete their own entity-people mappings"
  ON entity_people FOR DELETE
  USING (auth.uid() = owner_id);

-- ============================================================================
-- STEP 11: Grant Permissions to Authenticated Users
-- ============================================================================

-- Grant all permissions to authenticated users (RLS will enforce ownership)
GRANT SELECT, INSERT, UPDATE, DELETE ON tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tag_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON people TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON entity_people TO authenticated;

-- ============================================================================
-- STEP 12: Verify Migration (Optional)
-- ============================================================================

-- Uncomment to verify tables were created successfully:
/*
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('tags', 'tag_map', 'people', 'entity_people')
ORDER BY table_name, ordinal_position;

-- Check RLS is enabled:
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('tags', 'tag_map', 'people', 'entity_people');

-- Check policies exist:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('tags', 'tag_map', 'people', 'entity_people')
ORDER BY tablename, policyname;

-- Verify Phase 7 fields were added:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('habits', 'todos', 'notes')
  AND column_name IN ('space_id', 'ai_placed', 'subtype')
ORDER BY table_name, column_name;
*/

-- ============================================================================
-- Migration Complete!
-- ============================================================================

-- Next Steps:
-- 1. Run this migration in your Supabase SQL Editor
-- 2. Verify all tables and policies are created
-- 3. Test with authenticated user to ensure RLS works
-- 4. Update your TypeScript types to match new schema
-- 5. Implement tag/people repository methods in lib/repo/supabase.ts

-- Phase 7 Hub Features Now Available:
-- ✓ Tags dictionary and tag-entity mapping
-- ✓ People contacts and person-entity linking
-- ✓ Space assignment (space_id) on all entities
-- ✓ AI-placed flag for unsorted items
-- ✓ Note subtypes (journal, idea, list, reference)
-- ✓ Full RLS security on all new tables
-- ✓ Proper indexes for performance
-- ✓ Automatic updated_at triggers
