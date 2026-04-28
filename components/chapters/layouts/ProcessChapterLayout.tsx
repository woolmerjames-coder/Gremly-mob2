import { ChapterEpigraphSection } from '../sections/ChapterEpigraphSection';
import { ChapterPhaseSpineSection } from '../sections/ChapterPhaseSpineSection';
import { ChapterCadenceSection } from '../sections/ChapterCadenceSection';
import { ChapterNextSection } from '../sections/ChapterNextSection';
import { ChapterRecentSection } from '../sections/ChapterRecentSection';
import { ChapterAlsoTouchedSection } from '../sections/ChapterAlsoTouchedSection';
import { lightTokens } from '../../../design/tokens';
import type { Chapter } from '../../../lib/supabase/types';

// Process arc: rhythm not progress. No STANDING IN THE WAY — blockers are not
// the frame for a process chapter. Cadence heatmap is the visual centerpiece.

interface ProcessChapterLayoutProps {
  chapter: Chapter;
}

export function ProcessChapterLayout({ chapter }: ProcessChapterLayoutProps) {
  return (
    <>
      <ChapterEpigraphSection chapter={chapter} />
      <ChapterPhaseSpineSection chapter={chapter} accentColor={lightTokens.colors.sageGreen} />
      <ChapterCadenceSection chapter={chapter} accentColor={lightTokens.colors.sageGreen} />
      <ChapterNextSection chapter={chapter} label="THIS WEEK · NEXT SESSION" />
      <ChapterRecentSection chapterId={chapter.id} />
      <ChapterAlsoTouchedSection chapter={chapter} />
    </>
  );
}
