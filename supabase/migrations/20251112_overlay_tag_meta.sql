-- Per-entity tag metadata to respect user actions
ALTER TABLE public.notes  ADD COLUMN IF NOT EXISTS tags_meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.todos  ADD COLUMN IF NOT EXISTS tags_meta jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS tags_meta jsonb DEFAULT '{}'::jsonb;

-- Optional GIN index for queries on tags_meta keys
CREATE INDEX IF NOT EXISTS idx_notes_tags_meta_gin  ON public.notes  USING GIN (tags_meta);
CREATE INDEX IF NOT EXISTS idx_todos_tags_meta_gin  ON public.todos  USING GIN (tags_meta);
CREATE INDEX IF NOT EXISTS idx_habits_tags_meta_gin ON public.habits USING GIN (tags_meta);
