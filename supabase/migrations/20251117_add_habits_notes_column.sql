-- Add notes column to habits table
-- This enables storing the original Mind Drop narrative text when converting unsorted items to habits

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.habits.notes IS 'Free-form notes or context for the habit, often populated from the original Mind Drop text when converting from unsorted items';
