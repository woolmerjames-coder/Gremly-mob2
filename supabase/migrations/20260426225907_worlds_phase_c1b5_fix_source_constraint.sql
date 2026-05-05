-- C.1a wrote the constraint as IN ('ai', 'user') based on spec text, but the
-- codebase convention (established by Phase A) is 'classifier' for AI-authored.
-- Fix the constraint before C.1b.5's trigger writes the first row.

ALTER TABLE public.chapter_phase_history
  DROP CONSTRAINT IF EXISTS chapter_phase_history_source_chk;

ALTER TABLE public.chapter_phase_history
  ADD CONSTRAINT chapter_phase_history_source_chk
  CHECK (source IN ('classifier', 'user'));

COMMENT ON CONSTRAINT chapter_phase_history_source_chk ON public.chapter_phase_history IS
  'Source provenance: ''classifier'' for AI-authored, ''user'' for user-edited. Matches the convention in worldsWriter.ts.';
