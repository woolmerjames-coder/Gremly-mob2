-- Add tags jsonb columns to core tables
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS tags jsonb;
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS tags jsonb;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS tags jsonb;

-- Add GIN indexes for tag searches
CREATE INDEX IF NOT EXISTS idx_habits_tags_gin ON public.habits USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_todos_tags_gin ON public.todos USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_notes_tags_gin ON public.notes USING GIN (tags);
