-- Phase 8: Seed default values for existing spaces
-- Backfills icon, theme, and summary for spaces created before Spaces v2

UPDATE public.spaces
SET 
  icon = COALESCE(icon, '⭐️'),
  theme = COALESCE(theme, 'mint'),
  summary_cached = COALESCE(summary_cached, 'Welcome to your space')
WHERE 
  icon IS NULL 
  OR theme IS NULL 
  OR summary_cached IS NULL;

-- Log the backfill for auditing
DO $$
DECLARE
  updated_count integer;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled % spaces with default values', updated_count;
END $$;
