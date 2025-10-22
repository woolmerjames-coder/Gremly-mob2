-- ============================================
-- Hub Data Cleanup Migration
-- Backfill missing names and normalize subtype values
-- ============================================

-- Backfill missing names with 'Untitled'
UPDATE public.habits 
SET title = COALESCE(NULLIF(TRIM(title), ''), 'Untitled') 
WHERE title IS NULL OR TRIM(title) = '';

UPDATE public.todos 
SET title = COALESCE(NULLIF(TRIM(title), ''), 'Untitled') 
WHERE title IS NULL OR TRIM(title) = '';

UPDATE public.notes 
SET title = COALESCE(NULLIF(TRIM(title), ''), 'Untitled') 
WHERE title IS NULL OR TRIM(title) = '';

-- Normalize habit subtype - set to 'start_habit' if null
-- Note: Requires 20251022_add_habit_subtype.sql to be run first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='habits' AND column_name='subtype'
  ) THEN
    UPDATE public.habits 
    SET subtype = 'start_habit' 
    WHERE subtype IS NULL OR subtype NOT IN ('start_habit', 'break_habit', 'routine');
  END IF;
END $$;

-- Normalize note subtype - set to 'catchall' if null or invalid
UPDATE public.notes 
SET subtype = 'catchall' 
WHERE subtype IS NULL 
   OR subtype NOT IN ('journal', 'list', 'catchall', 'idea', 'reference');

-- Todo subtype is already nullable/optional, no normalization needed

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Verification Query
-- ============================================
SELECT 
  'habits' AS table_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE title IS NULL OR TRIM(title) = '') AS null_or_empty_names,
  COUNT(*) FILTER (WHERE subtype IS NULL) AS null_subtypes
FROM public.habits

UNION ALL

SELECT 
  'todos' AS table_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE title IS NULL OR TRIM(title) = '') AS null_or_empty_names,
  NULL AS null_subtypes
FROM public.todos

UNION ALL

SELECT 
  'notes' AS table_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE title IS NULL OR TRIM(title) = '') AS null_or_empty_names,
  COUNT(*) FILTER (WHERE subtype IS NULL OR subtype NOT IN ('journal', 'list', 'catchall', 'idea', 'reference')) AS null_or_invalid_subtypes
FROM public.notes;

-- Expected result: all null/empty/invalid counts should be 0
