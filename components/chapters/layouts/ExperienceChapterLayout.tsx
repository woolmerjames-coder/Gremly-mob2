import { ChapterEpigraphSection } from '../sections/ChapterEpigraphSection';
import { ChapterPhaseSpineSection } from '../sections/ChapterPhaseSpineSection';
import { ChapterTimelineSection } from '../sections/ChapterTimelineSection';
import { ChapterBeforeYouGoSection } from '../sections/ChapterBeforeYouGoSection';
import { ChapterWithYouSection } from '../sections/ChapterWithYouSection';
import { ChapterRecentSection } from '../sections/ChapterRecentSection';
import { ChapterAlsoTouchedSection } from '../sections/ChapterAlsoTouchedSection';
import { lightTokens } from '../../../design/tokens';
import type { Chapter } from '../../../lib/supabase/types';

// Experience arc: journey not outcome. The visual frame is the timeline — when
// you leave, who's with you, what to do before you go. No STANDING IN THE WAY,
// no Cadence heatmap, no Next session block.

interface ExperienceChapterLayoutProps {
  chapter: Chapter;
}

export function ExperienceChapterLayout({ chapter }: ExperienceChapterLayoutProps) {
  return (
    <>
      <ChapterEpigraphSection chapter={chapter} />
      <ChapterPhaseSpineSection
        chapter={chapter}
        accentColor={lightTokens.colors.experienceAccent}
      />
      <ChapterTimelineSection chapter={chapter} />
      <ChapterBeforeYouGoSection chapter={chapter} />
      <ChapterWithYouSection chapter={chapter} />
      <ChapterRecentSection chapterId={chapter.id} />
      <ChapterAlsoTouchedSection chapter={chapter} />
    </>
  );
}
