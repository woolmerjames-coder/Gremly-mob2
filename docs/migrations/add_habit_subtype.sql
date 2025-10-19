-- Migration: Add subtype column to habits table
-- Date: December 2024
-- Purpose: Support habit subtypes (start_habit, break_habit, routine) for Phase 7 unified overlay

-- Add subtype column with constraint
ALTER TABLE habits 
ADD COLUMN IF NOT EXISTS subtype TEXT 
CHECK (subtype IN ('start_habit', 'break_habit', 'routine'));

-- Add index for subtype queries (optional, improves query performance)
CREATE INDEX IF NOT EXISTS idx_habits_subtype ON habits(subtype) 
WHERE subtype IS NOT NULL;

-- Add column comment for documentation
COMMENT ON COLUMN habits.subtype IS 'Optional habit classification: start_habit (building new habit), break_habit (stopping bad habit), or routine (established routine)';

-- Verify migration
DO $$
BEGIN
  -- Check if column exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'habits' 
    AND column_name = 'subtype'
  ) THEN
    RAISE NOTICE 'Migration successful: subtype column added to habits table';
  ELSE
    RAISE EXCEPTION 'Migration failed: subtype column not found';
  END IF;
END $$;

-- Sample queries to verify functionality:
-- SELECT id, title, subtype FROM habits WHERE subtype IS NOT NULL;
-- SELECT subtype, COUNT(*) FROM habits GROUP BY subtype;
