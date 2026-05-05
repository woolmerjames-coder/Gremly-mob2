import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import {
  useChapterHeldStripCells,
  useChapterHeldStripStats,
} from '../../../lib/store/chaptersSelectors';
import type { Chapter } from '../../../lib/supabase/types';

// commitmentAccent (#7F77DD) = rgb(127,119,221).
// Opacity variants are computed once at module level to avoid scattered hex
// literals in component code (follows same pattern as ChapterCadenceSection).
const COMMITMENT_RGB = '127,119,221';
const HELD_BG = `rgba(${COMMITMENT_RGB},0.55)`;
const FUTURE_BG = `rgba(${COMMITMENT_RGB},0.10)`;

interface ChapterHeldStripBannerProps {
  chapter: Chapter;
}

export function ChapterHeldStripBanner({ chapter }: ChapterHeldStripBannerProps) {
  const cells = useChapterHeldStripCells(chapter);
  const stats = useChapterHeldStripStats(chapter);

  if (!stats || cells.length === 0) return null;

  const { commitmentSlipMarker, linenCream, onInkLabel } = lightTokens.colors;

  return (
    <View>
      {/* Held/slip strip */}
      <View style={styles.strip}>
        {cells.map((cell) => {
          const isSlip = cell.tense === 'slip' || (cell.tense === 'today' && !!cell.slipReason);
          const isToday = cell.tense === 'today';
          const isFuture = cell.tense === 'future';

          const bg = isSlip ? commitmentSlipMarker : isFuture ? FUTURE_BG : HELD_BG;

          return (
            <View
              key={cell.dateIso}
              style={[styles.cell, { backgroundColor: bg }, isToday && styles.cellToday]}
            />
          );
        })}
      </View>

      {/* Meta line */}
      <View style={styles.meta}>
        <Text style={[styles.metaText, { color: onInkLabel }]}>
          {stats.heldCount} held · {stats.currentStreak}-day current streak
        </Text>
        <Text style={[styles.metaText, { color: onInkLabel }]}>
          {stats.slipCount === 1 ? '1 slip' : `${stats.slipCount} slips`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: 2,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 2,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: lightTokens.colors.linenCream,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaText: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
  },
});
