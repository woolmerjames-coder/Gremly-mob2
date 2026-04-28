import { GenericChapterLayout } from './GenericChapterLayout';
import { OutcomeChapterLayout } from './OutcomeChapterLayout';
import { ProcessChapterLayout } from './ProcessChapterLayout';
import { ExperienceChapterLayout } from './ExperienceChapterLayout';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterDispatcherProps {
  chapter: Chapter;
}

export function ChapterDispatcher({ chapter }: ChapterDispatcherProps) {
  // C.2b: active Outcome chapters get the phase-spine layout.
  // Closed Outcome chapters fall through to GenericChapterLayout (closed
  // "what shipped" tail is its own future sub-phase).
  // C.2c (shipped): active Process chapters get phase-spine + cadence heatmap.
  // Closed Process falls through to GenericChapterLayout.
  // C.2d.1 (shipped): active Experience chapters get timeline + before-you-go + with-you.
  // C.2d.1.b (closed Experience) and C.2d.2 (Commitment) still remaining.
  if (chapter.arc_shape === 'outcome' && !chapter.closed_at) {
    return <OutcomeChapterLayout chapter={chapter} />;
  }
  if (chapter.arc_shape === 'process' && !chapter.closed_at) {
    return <ProcessChapterLayout chapter={chapter} />;
  }
  if (chapter.arc_shape === 'experience' && !chapter.closed_at) {
    return <ExperienceChapterLayout chapter={chapter} />;
  }
  return <GenericChapterLayout chapter={chapter} />;
}
