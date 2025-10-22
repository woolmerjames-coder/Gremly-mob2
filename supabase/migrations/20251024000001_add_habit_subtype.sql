-- ============================================
-- Add subtype column to habits table
-- This column is required by the app to distinguish:
-- - start_habit: Building a new positive habit
-- - break_habit: Breaking a negative habit
-- - routine: Regular routine/system
-- ============================================

-- Add subtype column to habits (with constraint)
ALTER TABLE IF EXISTS public.habits 
  ADD COLUMN IF NOT EXISTS subtype text NOT NULL DEFAULT 'start_habit'
  CHECK (subtype IN ('start_habit', 'break_habit', 'routine'));

-- Create index for filtering by subtype
CREATE INDEX IF NOT EXISTS idx_habits_subtype ON public.habits(owner_id, subtype);

-- Update any existing habits to have the default subtype
UPDATE public.habits 
SET subtype = 'start_habit' 
WHERE subtype IS NULL OR subtype NOT IN ('start_habit', 'break_habit', 'routine');

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
