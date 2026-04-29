import { ChapterEpigraphSection } from '../sections/ChapterEpigraphSection';
import { ChapterPhaseSpineSection } from '../sections/ChapterPhaseSpineSection';
import { ChapterPrioritiesSection } from '../sections/ChapterPrioritiesSection';
import { ChapterNextSection } from '../sections/ChapterNextSection';
import { ChapterWithYouSection } from '../sections/ChapterWithYouSection';
import { ChapterRecentSection } from '../sections/ChapterRecentSection';
import { ChapterAlsoTouchedSection } from '../sections/ChapterAlsoTouchedSection';
import { lightTokens } from '../../../design/tokens';
import type { Chapter } from '../../../lib/supabase/types';

interface OutcomeChapterLayoutProps {
  chapter: Chapter;
}

export function OutcomeChapterLayout({ chapter }: OutcomeChapterLayoutProps) {
  return (
    <>
      <ChapterEpigraphSection chapter={chapter} />
      <ChapterPhaseSpineSection chapter={chapter} accentColor={lightTokens.colors.mossGreen} />
      <ChapterPrioritiesSection chapter={chapter} />
      <ChapterNextSection chapter={chapter} />
      <ChapterWithYouSection chapter={chapter} />
      <ChapterRecentSection chapterId={chapter.id} />
      <ChapterAlsoTouchedSection chapter={chapter} />
    </>
  );
}
