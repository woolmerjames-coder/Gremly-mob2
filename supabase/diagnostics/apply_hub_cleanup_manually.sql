-- ============================================
-- Hub Data Cleanup - Manual Application Script
-- Run this in Supabase SQL Editor
-- 
-- This script will:
-- 1. Backfill missing titles with 'Untitled'
-- 2. Add subtype column to habits table (if missing)
-- 3. Normalize habit and note subtypes
-- 4. Set null reminders_json to empty arrays
-- 5. Refresh PostgREST cache
-- ============================================

-- STEP 1: Backfill missing names with 'Untitled'
-- ============================================
-- Note: habits and todos use 'title' column, not 'name'
UPDATE public.habits 
SET title = COALESCE(NULLIF(TRIM(title), ''), 'Untitled') 
WHERE title IS NULL OR TRIM(title) = '';

UPDATE public.todos 
SET title = COALESCE(NULLIF(TRIM(title), ''), 'Untitled') 
WHERE title IS NULL OR TRIM(title) = '';

UPDATE public.notes 
SET title = COALESCE(NULLIF(TRIM(title), ''), 'Untitled') 
WHERE title IS NULL OR TRIM(title) = '';

-- STEP 2: Add missing columns to tables
-- ============================================
-- Add subtype to habits (required by app)
ALTER TABLE IF EXISTS public.habits 
  ADD COLUMN IF NOT EXISTS subtype text NOT NULL DEFAULT 'start_habit'
  CHECK (subtype IN ('start_habit', 'break_habit', 'routine'));

-- Add why_string to todos (required by app) 
ALTER TABLE IF EXISTS public.todos
  ADD COLUMN IF NOT EXISTS why_string text NULL;

-- Add why_string to habits (required by app)
ALTER TABLE IF EXISTS public.habits
  ADD COLUMN IF NOT EXISTS why_string text NULL;

-- Add origin to todos (required by app)
ALTER TABLE IF EXISTS public.todos
  ADD COLUMN IF NOT EXISTS origin text NULL CHECK (origin IN ('catchall'));

-- Add origin to habits (required by app)
ALTER TABLE IF EXISTS public.habits
  ADD COLUMN IF NOT EXISTS origin text NULL CHECK (origin IN ('catchall'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_habits_subtype ON public.habits(owner_id, subtype);

-- STEP 3: Normalize habit subtype - set to 'start_habit' if null or invalid
-- ============================================
UPDATE public.habits 
SET subtype = 'start_habit' 
WHERE subtype IS NULL 
   OR subtype NOT IN ('start_habit', 'break_habit', 'routine');

-- STEP 4: Normalize note subtype - set to 'catchall' if null or invalid
-- ============================================
UPDATE public.notes 
SET subtype = 'catchall' 
WHERE subtype IS NULL 
   OR subtype NOT IN ('journal', 'list', 'catchall', 'idea', 'reference');

-- STEP 5: Ensure reminders_json is empty array if null (for habits/notes/todos)
-- ============================================
UPDATE public.habits 
SET reminders_json = '[]'::jsonb 
WHERE reminders_json IS NULL;

UPDATE public.notes 
SET reminders_json = '[]'::jsonb 
WHERE reminders_json IS NULL;

UPDATE public.todos 
SET reminders_json = '[]'::jsonb 
WHERE reminders_json IS NULL;

-- STEP 6: Refresh PostgREST schema cache
-- ============================================
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Verification Query
-- ============================================
SELECT 
  'habits' AS table_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE title IS NULL OR TRIM(title) = '') AS null_or_empty_names,
  COUNT(*) FILTER (WHERE subtype IS NULL OR subtype NOT IN ('start_habit', 'break_habit', 'routine')) AS null_or_invalid_subtypes,
  COUNT(*) FILTER (WHERE reminders_json IS NULL) AS null_reminders
FROM public.habits

UNION ALL

SELECT 
  'todos' AS table_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE title IS NULL OR TRIM(title) = '') AS null_or_empty_names,
  NULL AS null_or_invalid_subtypes,
  COUNT(*) FILTER (WHERE reminders_json IS NULL) AS null_reminders
FROM public.todos

UNION ALL

SELECT 
  'notes' AS table_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE title IS NULL OR TRIM(title) = '') AS null_or_empty_names,
  COUNT(*) FILTER (WHERE subtype IS NULL OR subtype NOT IN ('journal', 'list', 'catchall', 'idea', 'reference')) AS null_or_invalid_subtypes,
  COUNT(*) FILTER (WHERE reminders_json IS NULL) AS null_reminders
FROM public.notes;

-- Expected result: all null/empty/invalid counts should be 0
