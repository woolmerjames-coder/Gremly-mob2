-- Add duration_minutes column to todos table
-- Used by CalendarService for time-block scheduling
ALTER TABLE todos ADD COLUMN IF NOT EXISTS duration_minutes integer;
