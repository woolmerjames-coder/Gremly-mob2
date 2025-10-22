-- Migration: Add due_time column to todos table
-- Created: 2025-10-21
-- Description: Adds optional due_time column for time-specific todo reminders

-- Add due_time column with safe duplicate check
DO $$ 
BEGIN
    -- Add due_time column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'todos' 
        AND column_name = 'due_time'
    ) THEN
        ALTER TABLE public.todos 
        ADD COLUMN due_time TIMESTAMPTZ NULL;
        
        COMMENT ON COLUMN public.todos.due_time IS 'Optional due date/time for to-do reminders';
        
        RAISE NOTICE 'Column due_time added to todos table';
    ELSE
        RAISE NOTICE 'Column due_time already exists in todos table';
    END IF;
EXCEPTION 
    WHEN duplicate_column THEN 
        RAISE NOTICE 'Column due_time already exists (caught duplicate_column exception)';
END $$;
