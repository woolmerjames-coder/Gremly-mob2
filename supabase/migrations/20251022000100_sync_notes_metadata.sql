-- Migration: Sync notes table metadata columns
-- Date: 2025-10-22
-- Purpose: Add missing metadata columns to support chat conversion and AI tracking

-- Add metadata columns to public.notes (safe, IF NOT EXISTS)
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS canonical_type text,
  ADD COLUMN IF NOT EXISTS ai_placed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS why_string text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid;

-- Add the same columns to public.todos for consistency
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS canonical_type text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid;

-- Add the same columns to public.habits for consistency  
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS canonical_type text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid;

-- Optional index for linkage if used later for chat message tracking
CREATE INDEX IF NOT EXISTS notes_source_message_id_idx ON public.notes (source_message_id);
CREATE INDEX IF NOT EXISTS todos_source_message_id_idx ON public.todos (source_message_id);
CREATE INDEX IF NOT EXISTS habits_source_message_id_idx ON public.habits (source_message_id);

-- Add indexes for origin filtering (useful for analytics)
CREATE INDEX IF NOT EXISTS notes_origin_idx ON public.notes (origin) WHERE origin IS NOT NULL;
CREATE INDEX IF NOT EXISTS todos_origin_idx ON public.todos (origin) WHERE origin IS NOT NULL;
CREATE INDEX IF NOT EXISTS habits_origin_idx ON public.habits (origin) WHERE origin IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN public.notes.origin IS 'Source of record creation: catchall, space_chat, manual';
COMMENT ON COLUMN public.notes.canonical_type IS 'Cortex classification: note, todo, habit, journal';
COMMENT ON COLUMN public.notes.ai_placed IS 'Whether item was automatically created by AI (true) or user confirmed (false)';
COMMENT ON COLUMN public.notes.why_string IS 'AI explanation or reasoning for the suggestion';
COMMENT ON COLUMN public.notes.source_message_id IS 'Reference to originating chat message (if from space_chat)';

COMMENT ON COLUMN public.todos.origin IS 'Source of record creation: catchall, space_chat, manual';
COMMENT ON COLUMN public.todos.canonical_type IS 'Cortex classification: note, todo, habit, journal';
COMMENT ON COLUMN public.todos.source_message_id IS 'Reference to originating chat message (if from space_chat)';

COMMENT ON COLUMN public.habits.origin IS 'Source of record creation: catchall, space_chat, manual';
COMMENT ON COLUMN public.habits.canonical_type IS 'Cortex classification: note, todo, habit, journal';
COMMENT ON COLUMN public.habits.source_message_id IS 'Reference to originating chat message (if from space_chat)';