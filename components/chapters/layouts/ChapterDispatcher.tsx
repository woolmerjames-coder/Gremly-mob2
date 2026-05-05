import { GenericChapterLayout } from './GenericChapterLayout';
import { OutcomeChapterLayout } from './OutcomeChapterLayout';
import { ProcessChapterLayout } from './ProcessChapterLayout';
import { ExperienceChapterLayout } from './ExperienceChapterLayout';
import { CommitmentChapterLayout } from './CommitmentChapterLayout';
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
  // C.2d.2 (shipped): active Commitment chapters get held-strip banner + WHY + upcoming risk.
  //   All four ACTIVE arc layouts are now complete.
  // Closed-state layouts for each arc are the next deferred work (C.2d.1.b and C.2.closed.x).
  if (chapter.arc_shape === 'outcome' && !chapter.closed_at) {
    return <OutcomeChapterLayout chapter={chapter} />;
  }
  if (chapter.arc_shape === 'process' && !chapter.closed_at) {
    return <ProcessChapterLayout chapter={chapter} />;
  }
  if (chapter.arc_shape === 'experience' && !chapter.closed_at) {
    return <ExperienceChapterLayout chapter={chapter} />;
  }
  if (chapter.arc_shape === 'commitment' && !chapter.closed_at) {
    return <CommitmentChapterLayout chapter={chapter} />;
  }
  return <GenericChapterLayout chapter={chapter} />;
}
