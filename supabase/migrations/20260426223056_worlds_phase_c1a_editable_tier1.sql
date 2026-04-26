-- Phase C.1a — Tier 1 schema for editable + AI-respecting-user-edits loop
-- Adds source-tracking on the remaining structural fields, plus three
-- supporting tables: phase history, AI suggestions, edit log.
--
-- Phase A already added _source/_updated_at for: title, summary, card_subtitle,
-- arc_shape, epigraph, key_moments, slip_events. This migration adds the rest.

------------------------------------------------------------------
-- 1. Source-tracking on remaining chapter fields
------------------------------------------------------------------

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS start_date_source        text,
  ADD COLUMN IF NOT EXISTS start_date_updated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS end_date_source          text,
  ADD COLUMN IF NOT EXISTS end_date_updated_at      timestamptz,
  ADD COLUMN IF NOT EXISTS current_phase_key_source text,
  ADD COLUMN IF NOT EXISTS current_phase_key_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_description_source text,
  ADD COLUMN IF NOT EXISTS target_description_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase_labels_source      text,
  ADD COLUMN IF NOT EXISTS phase_labels_updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS key_priorities_source    text,
  ADD COLUMN IF NOT EXISTS key_priorities_updated_at timestamptz;

COMMENT ON COLUMN public.chapters.start_date_source IS
  'Provenance: ''classifier'' = AI authored, ''user'' = user edit. Classify run must not overwrite when ''user''.';
COMMENT ON COLUMN public.chapters.end_date_source IS
  'Provenance: ''classifier'' = AI authored, ''user'' = user edit. Classify run must not overwrite when ''user''.';
COMMENT ON COLUMN public.chapters.current_phase_key_source IS
  'Provenance: ''classifier'' = AI authored, ''user'' = user edit. Classify run must not overwrite when ''user''.';
COMMENT ON COLUMN public.chapters.target_description_source IS
  'Provenance: ''classifier'' = AI authored, ''user'' = user edit. Classify run must not overwrite when ''user''.';
COMMENT ON COLUMN public.chapters.phase_labels_source IS
  'Provenance: ''classifier'' = AI authored, ''user'' = user edit. Classify run must not overwrite when ''user''.';
COMMENT ON COLUMN public.chapters.key_priorities_source IS
  'Provenance: ''classifier'' = AI authored, ''user'' = user edit. Classify run must not overwrite when ''user''.';

------------------------------------------------------------------
-- 2. chapter_phase_history — track every phase transition
------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chapter_phase_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  phase_key text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  transition_reason text,
  source text NOT NULL DEFAULT 'classifier',
  CONSTRAINT chapter_phase_history_source_chk CHECK (source IN ('classifier', 'user'))
);

CREATE INDEX IF NOT EXISTS chapter_phase_history_chapter_idx
  ON public.chapter_phase_history (chapter_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS chapter_phase_history_active_idx
  ON public.chapter_phase_history (chapter_id)
  WHERE left_at IS NULL;

COMMENT ON TABLE public.chapter_phase_history IS
  'Every phase transition for a chapter. The active phase is the row with left_at IS NULL. Populated by classify run on phase change and by user phase edits.';

ALTER TABLE public.chapter_phase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY chapter_phase_history_sel_own ON public.chapter_phase_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_phase_history.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY chapter_phase_history_ins_own ON public.chapter_phase_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_phase_history.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY chapter_phase_history_upd_own ON public.chapter_phase_history
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_phase_history.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY chapter_phase_history_del_own ON public.chapter_phase_history
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_phase_history.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

------------------------------------------------------------------
-- 3. chapter_ai_suggestions — alternates AI surfaces for user-edited fields
------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chapter_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  field text NOT NULL,
  suggested_value jsonb NOT NULL,
  evidence text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  run_id uuid,
  CONSTRAINT chapter_ai_suggestions_status_chk CHECK (status IN ('pending', 'accepted', 'dismissed', 'superseded'))
);

CREATE INDEX IF NOT EXISTS chapter_ai_suggestions_chapter_idx
  ON public.chapter_ai_suggestions (chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chapter_ai_suggestions_pending_idx
  ON public.chapter_ai_suggestions (chapter_id, field)
  WHERE status = 'pending';

COMMENT ON TABLE public.chapter_ai_suggestions IS
  'Pending or resolved AI alternates for chapter fields the user has edited. Surfaced as non-modal stripes on the chapter page when status=pending. The classify run produces these instead of overwriting user edits.';

ALTER TABLE public.chapter_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY chapter_ai_suggestions_sel_own ON public.chapter_ai_suggestions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_ai_suggestions.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY chapter_ai_suggestions_ins_own ON public.chapter_ai_suggestions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_ai_suggestions.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY chapter_ai_suggestions_upd_own ON public.chapter_ai_suggestions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_ai_suggestions.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY chapter_ai_suggestions_del_own ON public.chapter_ai_suggestions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_ai_suggestions.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

------------------------------------------------------------------
-- 4. chapter_edit_log — user edits + reasons (feeds next classify run)
------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chapter_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chapter_edit_log_chapter_idx
  ON public.chapter_edit_log (chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chapter_edit_log_recent_idx
  ON public.chapter_edit_log (created_at DESC);

COMMENT ON TABLE public.chapter_edit_log IS
  'Audit trail of user edits to chapter fields. The reason text feeds the next classify run as context so AI learns from edits rather than just being blocked by them.';

ALTER TABLE public.chapter_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY chapter_edit_log_sel_own ON public.chapter_edit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_edit_log.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY chapter_edit_log_ins_own ON public.chapter_edit_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = chapter_edit_log.chapter_id
        AND c.owner_id = (SELECT auth.uid())
    )
  );

-- No update or delete policy for edit log — append-only audit trail.
