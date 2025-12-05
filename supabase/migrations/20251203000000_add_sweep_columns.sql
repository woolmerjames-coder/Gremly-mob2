-- Migration: Add Sweep-related columns
-- Date: 2025-12-03
-- Purpose: Add last_sweep_completed_at to cortex_preferences and skipped_in_sweep_at to todos, habits, notes

-- Add last_sweep_completed_at to cortex_preferences (nullable timestamptz)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cortex_preferences'
          AND column_name = 'last_sweep_completed_at'
    ) THEN
        ALTER TABLE public.cortex_preferences
        ADD COLUMN last_sweep_completed_at timestamptz NULL;
    END IF;
END $$;

-- Add skipped_in_sweep_at to todos (nullable timestamptz)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'todos'
          AND column_name = 'skipped_in_sweep_at'
    ) THEN
        ALTER TABLE public.todos
        ADD COLUMN skipped_in_sweep_at timestamptz NULL;
    END IF;
END $$;

-- Add skipped_in_sweep_at to habits (nullable timestamptz)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'habits'
          AND column_name = 'skipped_in_sweep_at'
    ) THEN
        ALTER TABLE public.habits
        ADD COLUMN skipped_in_sweep_at timestamptz NULL;
    END IF;
END $$;

-- Add skipped_in_sweep_at to notes (nullable timestamptz)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notes'
          AND column_name = 'skipped_in_sweep_at'
    ) THEN
        ALTER TABLE public.notes
        ADD COLUMN skipped_in_sweep_at timestamptz NULL;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.cortex_preferences.last_sweep_completed_at IS 'Timestamp of the last completed Evening Sweep session';
COMMENT ON COLUMN public.todos.skipped_in_sweep_at IS 'Timestamp when this item was skipped in Evening Sweep';
COMMENT ON COLUMN public.habits.skipped_in_sweep_at IS 'Timestamp when this item was skipped in Evening Sweep';
COMMENT ON COLUMN public.notes.skipped_in_sweep_at IS 'Timestamp when this item was skipped in Evening Sweep';
