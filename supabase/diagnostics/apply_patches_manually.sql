-- ============================================
-- Manual Patch Application Script
-- Run this in Supabase SQL Editor BEFORE running supabase db push
-- ============================================

-- PATCH 1: Add due_time to todos (HH:mm text format, not timestamptz)
ALTER TABLE IF EXISTS public.todos
  ADD COLUMN IF NOT EXISTS due_time TEXT NULL 
  CHECK (due_time ~ '^\d{2}:\d{2}$');

COMMENT ON COLUMN public.todos.due_time IS 'Optional due time in HH:mm format (e.g., "09:00", "14:30")';

-- PATCH 2: Fix people backfill
ALTER TABLE IF EXISTS public.people
  ADD COLUMN IF NOT EXISTS display_name TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='people' AND column_name='name'
  ) THEN
    EXECUTE $q$
      UPDATE public.people
      SET display_name = COALESCE(display_name, name)
      WHERE display_name IS NULL
    $q$;
  END IF;
END $$;

-- PATCH 3: Add user_id to tags and tag_map + RLS policies
ALTER TABLE IF EXISTS public.tags    ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE IF EXISTS public.tag_map ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE IF EXISTS public.tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tag_map ENABLE ROW LEVEL SECURITY;

-- Policies for tags
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tags' AND policyname='Users can view their own tags') THEN
    EXECUTE 'CREATE POLICY "Users can view their own tags" ON public.tags FOR SELECT USING (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tags' AND policyname='Users can insert their own tags') THEN
    EXECUTE 'CREATE POLICY "Users can insert their own tags" ON public.tags FOR INSERT WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tags' AND policyname='Users can update their own tags') THEN
    EXECUTE 'CREATE POLICY "Users can update their own tags" ON public.tags FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tags' AND policyname='Users can delete their own tags') THEN
    EXECUTE 'CREATE POLICY "Users can delete their own tags" ON public.tags FOR DELETE USING (user_id = auth.uid())';
  END IF;
END $$;

-- Policies for tag_map
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tag_map' AND policyname='Users can view their own tag mappings') THEN
    EXECUTE 'CREATE POLICY "Users can view their own tag mappings" ON public.tag_map FOR SELECT USING (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tag_map' AND policyname='Users can insert their own tag mappings') THEN
    EXECUTE 'CREATE POLICY "Users can insert their own tag mappings" ON public.tag_map FOR INSERT WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tag_map' AND policyname='Users can update their own tag mappings') THEN
    EXECUTE 'CREATE POLICY "Users can update their own tag mappings" ON public.tag_map FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tag_map' AND policyname='Users can delete their own tag mappings') THEN
    EXECUTE 'CREATE POLICY "Users can delete their own tag mappings" ON public.tag_map FOR DELETE USING (user_id = auth.uid())';
  END IF;
END $$;

-- Helpful indexes (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='idx_tags_user_id' AND n.nspname='public') THEN
    EXECUTE 'CREATE INDEX idx_tags_user_id ON public.tags(user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='idx_tag_map_user_id' AND n.nspname='public') THEN
    EXECUTE 'CREATE INDEX idx_tag_map_user_id ON public.tag_map(user_id)';
  END IF;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- Verification Query
-- ============================================
SELECT 
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='todos' AND column_name='due_time') AS todos_has_due_time,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tags' AND column_name='user_id') AS tags_has_user_id,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tag_map' AND column_name='user_id') AS tagmap_has_user_id,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='people' AND column_name='display_name') AS people_has_display_name;

-- Expected result: all columns should be TRUE
