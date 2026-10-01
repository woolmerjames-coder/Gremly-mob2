-- Lifemaps and context fixes, part 9: the weekly synthesis can set a chapter's
-- stage, so the phase history trigger records it as a synthesis change.
alter table public.chapter_phase_history drop constraint if exists chapter_phase_history_source_chk;
alter table public.chapter_phase_history add constraint chapter_phase_history_source_chk
  check (source = any (array['classifier', 'user', 'synthesis']));
