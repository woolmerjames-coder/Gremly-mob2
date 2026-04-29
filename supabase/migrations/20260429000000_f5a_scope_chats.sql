-- F.5.a — Rename space_chats → scope_chats, space_chat_messages → scope_chat_messages
-- Renames tables, renames space_id → scope_id, adds chat_type CHECK constraint,
-- recreates all indexes with new names, and recreates RLS policies.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop indexes that reference the old table/column names (must precede rename)
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_space_chats_archived;
DROP INDEX IF EXISTS public.idx_space_chats_context_json_exists;
DROP INDEX IF EXISTS public.idx_space_chats_general;
DROP INDEX IF EXISTS public.idx_space_chats_general_stale;
DROP INDEX IF EXISTS public.idx_space_chats_pinned;
DROP INDEX IF EXISTS public.idx_space_chats_space_id;
DROP INDEX IF EXISTS public.idx_space_chats_updated_at;
DROP INDEX IF EXISTS public.idx_space_chats_user_id;
DROP INDEX IF EXISTS public.idx_scm_space_id;
DROP INDEX IF EXISTS public.idx_space_chat_messages_metadata;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop RLS policies before rename (safety: policy names may be tied to table)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own space chats"   ON public.space_chats;
DROP POLICY IF EXISTS "Users can insert their own space chats" ON public.space_chats;
DROP POLICY IF EXISTS "Users can update their own space chats" ON public.space_chats;
DROP POLICY IF EXISTS "Users can delete their own space chats" ON public.space_chats;

DROP POLICY IF EXISTS scm_select_own ON public.space_chat_messages;
DROP POLICY IF EXISTS scm_insert_own ON public.space_chat_messages;
DROP POLICY IF EXISTS scm_update_own ON public.space_chat_messages;
DROP POLICY IF EXISTS scm_delete_own ON public.space_chat_messages;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rename tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.space_chats         RENAME TO scope_chats;
ALTER TABLE public.space_chat_messages RENAME TO scope_chat_messages;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Rename columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scope_chats         RENAME COLUMN space_id TO scope_id;
ALTER TABLE public.scope_chat_messages RENAME COLUMN space_id TO scope_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add CHECK constraint on chat_type (column already exists, no value added)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scope_chats
  ADD CONSTRAINT scope_chats_chat_type_check
  CHECK (chat_type IN ('space', 'world', 'chapter', 'general'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Recreate dropped indexes with new names
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_scope_chats_archived
  ON public.scope_chats (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX idx_scope_chats_context_json_exists
  ON public.scope_chats ((context_json IS NOT NULL))
  WHERE context_json IS NOT NULL;

CREATE INDEX idx_scope_chats_general
  ON public.scope_chats (user_id, updated_at DESC)
  WHERE chat_type = 'general' AND archived_at IS NULL;

CREATE INDEX idx_scope_chats_general_stale
  ON public.scope_chats (updated_at)
  WHERE chat_type = 'general' AND archived_at IS NULL;

CREATE INDEX idx_scope_chats_pinned
  ON public.scope_chats (pinned)
  WHERE pinned = true;

CREATE INDEX idx_scope_chats_scope_id
  ON public.scope_chats (scope_id);

CREATE INDEX idx_scope_chats_updated_at
  ON public.scope_chats (updated_at DESC);

CREATE INDEX idx_scope_chats_user_id
  ON public.scope_chats (user_id);

CREATE INDEX idx_scm_scope_id
  ON public.scope_chat_messages (scope_id);

CREATE INDEX idx_scope_chat_messages_metadata
  ON public.scope_chat_messages USING gin (metadata);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. New composite indexes for scope-scoped queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_scope_chats_type_scope
  ON public.scope_chats (chat_type, scope_id);

-- Conditional: only add chat_type to the messages index if the column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'scope_chat_messages'
      AND column_name  = 'chat_type'
  ) THEN
    CREATE INDEX idx_scope_chat_messages_type_scope
      ON public.scope_chat_messages (chat_type, scope_id);
  ELSE
    CREATE INDEX idx_scope_chat_messages_type_scope
      ON public.scope_chat_messages (scope_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Recreate RLS policies on scope_chats
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "Users can view their own scope chats"
  ON public.scope_chats
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scope chats"
  ON public.scope_chats
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scope chats"
  ON public.scope_chats
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scope chats"
  ON public.scope_chats
  FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Recreate RLS policies on scope_chat_messages
--    scm_select_own subquery rewritten to reference scope_chats
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY scm_select_own ON public.scope_chat_messages
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (role = 'assistant' AND EXISTS (
      SELECT 1 FROM public.scope_chats sc
      WHERE sc.id = scope_chat_messages.chat_id
        AND sc.user_id = auth.uid()
    ))
  );

CREATE POLICY scm_insert_own ON public.scope_chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY scm_update_own ON public.scope_chat_messages
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY scm_delete_own ON public.scope_chat_messages
  FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Safety belt: confirm RLS is still enabled on both renamed tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scope_chats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scope_chat_messages ENABLE ROW LEVEL SECURITY;

COMMIT;
