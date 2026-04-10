-- Add mascot sleep window preferences to cortex_preferences
ALTER TABLE cortex_preferences
  ADD COLUMN IF NOT EXISTS bedtime_hour smallint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wake_hour smallint DEFAULT 6;
