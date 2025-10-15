-- Supabase Schema Fix for Phase 4
-- Run this in your Supabase SQL Editor to fix datetime validation errors

-- ============================================================================
-- STEP 1: Remove any CHECK constraints on timestamps (if they exist)
-- ============================================================================

ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_created_at_check;
ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_updated_at_check;

ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_created_at_check;
ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_updated_at_check;

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_created_at_check;
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_updated_at_check;

-- ============================================================================
-- STEP 2: Ensure columns have proper defaults
-- ============================================================================

-- Habits table
ALTER TABLE habits 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- Todos table
ALTER TABLE todos 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- Notes table
ALTER TABLE notes 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- ============================================================================
-- STEP 3: Create updated_at trigger function (if not exists)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- STEP 4: Add triggers to auto-update updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS update_habits_updated_at ON habits;
CREATE TRIGGER update_habits_updated_at
    BEFORE UPDATE ON habits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_todos_updated_at ON todos;
CREATE TRIGGER update_todos_updated_at
    BEFORE UPDATE ON todos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 5: Verify schema (optional - check your table structure)
-- ============================================================================

-- Check habits table
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'habits'
ORDER BY ordinal_position;

-- Check todos table
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'todos'
ORDER BY ordinal_position;

-- Check notes table
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'notes'
ORDER BY ordinal_position;

-- ============================================================================
-- Expected output for each table:
-- ============================================================================
-- Column         | Type                      | Default                 | Nullable
-- ---------------+---------------------------+-------------------------+---------
-- id             | uuid                      | gen_random_uuid()       | NO
-- owner_id       | uuid                      |                         | NO
-- title          | text                      |                         | NO (for habits/todos) / YES (for notes)
-- body           | text                      |                         | YES
-- space_id       | uuid                      |                         | YES
-- created_at     | timestamp with time zone  | now()                   | NO
-- updated_at     | timestamp with time zone  | now()                   | NO
-- ai_placed      | boolean                   | false                   | NO
-- ... (type-specific fields like frequency, due_date, subtype, etc.)
