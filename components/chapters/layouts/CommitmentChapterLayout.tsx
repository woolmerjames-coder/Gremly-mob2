import { ChapterEpigraphSection } from '../sections/ChapterEpigraphSection';
import { ChapterPhaseSpineSection } from '../sections/ChapterPhaseSpineSection';
import { ChapterWhySection } from '../sections/ChapterWhySection';
import { ChapterUpcomingRiskSection } from '../sections/ChapterUpcomingRiskSection';
import { ChapterRecentSection } from '../sections/ChapterRecentSection';
import { ChapterAlsoTouchedSection } from '../sections/ChapterAlsoTouchedSection';
import { lightTokens } from '../../../design/tokens';
import type { Chapter } from '../../../lib/supabase/types';

// Commitment arc: the banner (incl. held/slip strip) is owned by
// ChapterDetailScreen via the extraRow prop on EditableChapterBanner.
// This layout component owns only the sections BELOW the banner.
//
// No NEXT, STANDING IN THE WAY, TIMELINE, BEFORE YOU GO, WITH YOU, or CADENCE.
// Commitments are personal, progress-shaped, not task-shaped.

interface CommitmentChapterLayoutProps {
  chapter: Chapter;
}

export function CommitmentChapterLayout({ chapter }: CommitmentChapterLayoutProps) {
  return (
    <>
      <ChapterEpigraphSection chapter={chapter} />
      <ChapterPhaseSpineSection
        chapter={chapter}
        accentColor={lightTokens.colors.commitmentAccent}
      />
      <ChapterWhySection chapter={chapter} />
      <ChapterUpcomingRiskSection chapter={chapter} />
      <ChapterRecentSection chapterId={chapter.id} />
      <ChapterAlsoTouchedSection chapter={chapter} />
    </>
  );
}
