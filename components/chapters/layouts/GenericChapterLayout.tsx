import { ChapterEpigraphSection } from '../sections/ChapterEpigraphSection';
import { ChapterPrioritiesSection } from '../sections/ChapterPrioritiesSection';
import { ChapterNextSection } from '../sections/ChapterNextSection';
import { ChapterRecentSection } from '../sections/ChapterRecentSection';
import { ChapterAlsoTouchedSection } from '../sections/ChapterAlsoTouchedSection';
import type { Chapter } from '../../../lib/supabase/types';

interface GenericChapterLayoutProps {
  chapter: Chapter;
}

export function GenericChapterLayout({ chapter }: GenericChapterLayoutProps) {
  return (
    <>
      <ChapterEpigraphSection chapter={chapter} />
      <ChapterPrioritiesSection chapter={chapter} />
      <ChapterNextSection chapter={chapter} />
      <ChapterRecentSection chapterId={chapter.id} />
      <ChapterAlsoTouchedSection chapter={chapter} />
    </>
  );
}
