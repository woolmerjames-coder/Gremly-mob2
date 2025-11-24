-- Mind Drop v3 Phase 6: Strict drop_id unique constraints
-- Add database-level unique constraints to prevent any duplicate Mind Drop conversions
-- Note: This uses separate tables (todos, habits, notes) instead of a canonical_entities table

-- WARNING: These constraints are stricter than the existing partial indexes.
-- The partial indexes only enforce uniqueness for active/non-archived rows.
-- These new constraints enforce uniqueness across ALL rows (including archived).
-- This is the desired behavior to prevent ANY duplication from Mind Drop pipeline.

-- For todos: strict unique constraint on (owner_id, drop_id)
-- This prevents creating duplicate todos from the same Mind Drop, even if one is completed/archived
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'todos_unique_drop_id'
  ) THEN
    -- First, check if there are any existing violations
    IF EXISTS (
      SELECT owner_id, drop_id, COUNT(*)
      FROM public.todos
      WHERE drop_id IS NOT NULL
      GROUP BY owner_id, drop_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Found duplicate (owner_id, drop_id) pairs in todos table. Please resolve before adding constraint.';
      -- Optionally, we could auto-resolve by keeping the oldest and archiving duplicates
    ELSE
      ALTER TABLE public.todos
        ADD CONSTRAINT todos_unique_drop_id
        UNIQUE (owner_id, drop_id)
        DEFERRABLE INITIALLY DEFERRED;
      RAISE NOTICE 'Added todos_unique_drop_id constraint';
    END IF;
  ELSE
    RAISE NOTICE 'todos_unique_drop_id constraint already exists';
  END IF;
END $$;

-- For habits: strict unique constraint on (owner_id, drop_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'habits_unique_drop_id'
  ) THEN
    IF EXISTS (
      SELECT owner_id, drop_id, COUNT(*)
      FROM public.habits
      WHERE drop_id IS NOT NULL
      GROUP BY owner_id, drop_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Found duplicate (owner_id, drop_id) pairs in habits table. Please resolve before adding constraint.';
    ELSE
      ALTER TABLE public.habits
        ADD CONSTRAINT habits_unique_drop_id
        UNIQUE (owner_id, drop_id)
        DEFERRABLE INITIALLY DEFERRED;
      RAISE NOTICE 'Added habits_unique_drop_id constraint';
    END IF;
  ELSE
    RAISE NOTICE 'habits_unique_drop_id constraint already exists';
  END IF;
END $$;

-- For notes (logs): strict unique constraint on (owner_id, drop_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notes_unique_drop_id'
  ) THEN
    IF EXISTS (
      SELECT owner_id, drop_id, COUNT(*)
      FROM public.notes
      WHERE drop_id IS NOT NULL
      GROUP BY owner_id, drop_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE NOTICE 'Found duplicate (owner_id, drop_id) pairs in notes table. Please resolve before adding constraint.';
    ELSE
      ALTER TABLE public.notes
        ADD CONSTRAINT notes_unique_drop_id
        UNIQUE (owner_id, drop_id)
        DEFERRABLE INITIALLY DEFERRED;
      RAISE NOTICE 'Added notes_unique_drop_id constraint';
    END IF;
  ELSE
    RAISE NOTICE 'notes_unique_drop_id constraint already exists';
  END IF;
END $$;

-- Add comments explaining the constraints
COMMENT ON CONSTRAINT todos_unique_drop_id ON public.todos IS 
  'Ensures each Mind Drop (drop_id) can only create one todo per user. Part of Mind Drop v3 deduplication strategy.';

COMMENT ON CONSTRAINT habits_unique_drop_id ON public.habits IS 
  'Ensures each Mind Drop (drop_id) can only create one habit per user. Part of Mind Drop v3 deduplication strategy.';

COMMENT ON CONSTRAINT notes_unique_drop_id ON public.notes IS 
  'Ensures each Mind Drop (drop_id) can only create one note/log per user. Part of Mind Drop v3 deduplication strategy.';
