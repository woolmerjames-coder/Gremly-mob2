-- Mind Drop drop_id linking for idempotent conversions

-- Add drop_id column to notes (nullable for legacy rows)
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS drop_id uuid;

COMMENT ON COLUMN public.notes.drop_id IS 'Mind Drop source identifier used to prevent duplicate note conversions.';

-- Add drop_id column to todos (nullable for legacy rows)
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS drop_id uuid;

COMMENT ON COLUMN public.todos.drop_id IS 'Mind Drop source identifier used to prevent duplicate todo conversions.';

-- Add drop_id column to habits (nullable for legacy rows)
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS drop_id uuid;

COMMENT ON COLUMN public.habits.drop_id IS 'Mind Drop source identifier used to prevent duplicate habit conversions.';

-- Ensure each (owner_id, drop_id) pair only appears once for active todos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'todos_owner_drop_id_active_unique'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'todos'
        AND column_name = 'status'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX todos_owner_drop_id_active_unique ON public.todos(owner_id, drop_id) WHERE drop_id IS NOT NULL AND status = ''active''';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX todos_owner_drop_id_active_unique ON public.todos(owner_id, drop_id) WHERE drop_id IS NOT NULL';
    END IF;
  END IF;
END $$;

-- Ensure each (owner_id, drop_id) pair only appears once for non-archived notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'notes_owner_drop_id_active_unique'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notes'
        AND column_name = 'archived_at'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX notes_owner_drop_id_active_unique ON public.notes(owner_id, drop_id) WHERE drop_id IS NOT NULL AND archived_at IS NULL';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX notes_owner_drop_id_active_unique ON public.notes(owner_id, drop_id) WHERE drop_id IS NOT NULL';
    END IF;
  END IF;
END $$;

-- Ensure each (owner_id, drop_id) pair only appears once for habits
CREATE UNIQUE INDEX IF NOT EXISTS habits_owner_drop_id_unique
  ON public.habits(owner_id, drop_id)
  WHERE drop_id IS NOT NULL;
