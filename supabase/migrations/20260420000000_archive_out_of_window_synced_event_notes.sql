-- Archive synced calendar event notes that are outside the active hydration window.

-- Step 1: Add event-related columns to notes if they don't already exist.
-- These support the calendar sync feature and may be absent on older deployments.
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS target_date     text,
  ADD COLUMN IF NOT EXISTS end_date        text,
  ADD COLUMN IF NOT EXISTS event_time      text,
  ADD COLUMN IF NOT EXISTS end_time        text,
  ADD COLUMN IF NOT EXISTS is_all_day      boolean,
  ADD COLUMN IF NOT EXISTS location        text,
  ADD COLUMN IF NOT EXISTS archived_reason text,
  ADD COLUMN IF NOT EXISTS date_confidence text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notes' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE public.notes ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

-- Step 2: Backfill — archive synced event notes outside the active hydration window [-30d, +90d].
-- Idempotent: only affects rows where archived = false AND target_date IS NOT NULL.
-- Notes without target_date (created before this migration) are skipped and will be handled
-- by the JS-side window filter on the next sync cycle.
UPDATE public.notes
SET
  archived = true,
  archived_at = now(),
  archived_reason = 'outside_window'
WHERE subtype = 'event'
  AND external_source IS NOT NULL
  AND archived = false
  AND target_date IS NOT NULL
  AND (
    target_date::date < (current_date - interval '30 days')
    OR target_date::date > (current_date + interval '90 days')
  );
