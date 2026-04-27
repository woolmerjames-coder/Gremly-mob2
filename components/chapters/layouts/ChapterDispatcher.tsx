import { GenericChapterLayout } from './GenericChapterLayout';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterDispatcherProps {
  chapter: Chapter;
}

export function ChapterDispatcher({ chapter }: ChapterDispatcherProps) {
  // For C.2a: every arc renders GenericChapterLayout.
  // C.2b will add: if (chapter.arc_shape === 'outcome') return <OutcomeChapterLayout chapter={chapter} />;
  // C.2c will add Process; C.2d will add Experience and Commitment.
  return <GenericChapterLayout chapter={chapter} />;
}
