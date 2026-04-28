import { GenericChapterLayout } from './GenericChapterLayout';
import { OutcomeChapterLayout } from './OutcomeChapterLayout';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterDispatcherProps {
  chapter: Chapter;
}

export function ChapterDispatcher({ chapter }: ChapterDispatcherProps) {
  // C.2b: active Outcome chapters get the phase-spine layout.
  // Closed Outcome chapters fall through to GenericChapterLayout (closed
  // "what shipped" tail is its own future sub-phase).
  // C.2c will add: if (chapter.arc_shape === 'process' && !chapter.closed_at)
  // C.2d will add Experience and Commitment arms.
  if (chapter.arc_shape === 'outcome' && !chapter.closed_at) {
    return <OutcomeChapterLayout chapter={chapter} />;
  }
  return <GenericChapterLayout chapter={chapter} />;
}
