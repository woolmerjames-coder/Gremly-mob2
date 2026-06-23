-- Purge stale show=false rows from habit_insights.
-- These were written by the original silence-default prompt before the
-- show-bias prompt was deployed. The app no longer writes show=false rows
-- (getOrFetchHabitInsight only upserts when show=true), so this is a
-- one-time cleanup.
DELETE FROM habit_insights WHERE show = false;
