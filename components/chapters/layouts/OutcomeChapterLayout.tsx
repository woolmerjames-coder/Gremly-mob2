import { ChapterEpigraphSection } from '../sections/ChapterEpigraphSection';
import { ChapterPhaseSpineSection } from '../sections/ChapterPhaseSpineSection';
import { ChapterPrioritiesSection } from '../sections/ChapterPrioritiesSection';
import { ChapterNextSection } from '../sections/ChapterNextSection';
import { ChapterRecentSection } from '../sections/ChapterRecentSection';
import { ChapterAlsoTouchedSection } from '../sections/ChapterAlsoTouchedSection';
import type { Chapter } from '../../../lib/supabase/types';

interface OutcomeChapterLayoutProps {
  chapter: Chapter;
}

export function OutcomeChapterLayout({ chapter }: OutcomeChapterLayoutProps) {
  return (
    <>
      <ChapterEpigraphSection chapter={chapter} />
      <ChapterPhaseSpineSection chapter={chapter} />
      <ChapterPrioritiesSection chapter={chapter} />
      <ChapterNextSection chapter={chapter} />
      <ChapterRecentSection chapterId={chapter.id} />
      <ChapterAlsoTouchedSection chapter={chapter} />
    </>
  );
}
