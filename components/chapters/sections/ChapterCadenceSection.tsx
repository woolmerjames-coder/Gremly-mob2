import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import {
  useChapterCadenceWeeks,
  useChapterCadenceTotals,
} from '../../../lib/store/chaptersSelectors';
import { getDateService } from '../../../lib/date/DateService';
import { weekKey } from '../../../lib/date/isoWeek';
import type { Chapter } from '../../../lib/supabase/types';

// Cell intensity colors derived from lightTokens.colors.sageGreen (#97AF8F = r151 g175 b143).
// Computed once at module top to satisfy "no scattered hex literals" rule.
const SAGE_RGB = '151,175,143';
const CELL_BG: readonly string[] = [
  `rgba(${SAGE_RGB},0.08)`, // l0: no activity
  `rgba(${SAGE_RGB},0.22)`, // l1: 1 session
  `rgba(${SAGE_RGB},0.45)`, // l2: 2-3 sessions
  `rgba(${SAGE_RGB},0.70)`, // l3: 4-6 sessions
  lightTokens.colors.sageGreen, // l4: 7+ sessions (solid)
];

// Positions in the 19-cell window where month axis labels appear.
// floor(19/5) = 3 → positions 0, 3, 6, 9, 12, 18
const AXIS_POSITIONS = [0, 3, 6, 9, 12, 18] as const;

interface ChapterCadenceSectionProps {
  chapter: Chapter;
  accentColor: string;
  weeksBack?: number;
}

export function ChapterCadenceSection({
  chapter,
  accentColor,
  weeksBack = 19,
}: ChapterCadenceSectionProps) {
  const weeks = useChapterCadenceWeeks(chapter.id, weeksBack);
  const totals = useChapterCadenceTotals(chapter.id, weeksBack);

  // chapterId null/undefined path returns empty array; no heatmap to render
  if (weeks.length === 0) return null;

  const currentWeekKey = weekKey(getDateService().now());
  const axisLabels = AXIS_POSITIONS.map((i) => weeks[i]?.monthLabel ?? '');

  return (
    <View style={styles.container}>
      {/* Label row */}
      <View style={styles.labelRow}>
        <Text style={styles.sectionLabel}>CADENCE</Text>
        <Text style={styles.weeksLabel}> · {weeksBack} weeks</Text>
      </View>

      {/* Heatmap grid */}
      <View style={styles.heatmapRow}>
        {weeks.map((w) => {
          const isCurrent = w.weekStart === currentWeekKey;
          return (
            <View
              key={w.weekStart}
              style={[
                styles.cell,
                { backgroundColor: CELL_BG[w.intensityLevel] },
                isCurrent && styles.cellCurrent,
              ]}
            />
          );
        })}
      </View>

      {/* Month axis */}
      <View style={styles.axisRow}>
        {axisLabels.map((label, i) => (
          <Text key={i} style={styles.axisLabel}>
            {label}
          </Text>
        ))}
      </View>

      {/* Totals box */}
      <View style={[styles.totalsBox, { backgroundColor: `rgba(${SAGE_RGB},0.06)` }]}>
        <View style={styles.statCol}>
          <Text style={[styles.statNum, { color: accentColor }]}>
            {totals.totalSessionsInWindow}
          </Text>
          <Text style={styles.statLbl}>total sessions</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={[styles.statNum, { color: accentColor }]}>{totals.weeksActiveInWindow}</Text>
          <Text style={styles.statLbl}>weeks active</Text>
        </View>
        <View style={styles.statCol}>
          <Text style={[styles.statNum, { color: accentColor }]}>
            {totals.averagePerActiveWeek}
          </Text>
          <Text style={styles.statLbl}>your average</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 22,
    paddingHorizontal: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: lightTokens.colors.warmGrey,
  },
  weeksLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    fontWeight: '400',
    color: lightTokens.colors.warmGrey,
    marginLeft: 4,
  },
  heatmapRow: {
    flexDirection: 'row',
    gap: 2,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 2,
  },
  // Current week: charcoal border (no shadow — platform-divergent in RN)
  cellCurrent: {
    borderWidth: 1.5,
    borderColor: lightTokens.colors.charcoalInk,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 8,
    color: lightTokens.colors.warmGrey,
  },
  totalsBox: {
    flexDirection: 'row',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    fontWeight: '500',
  },
  statLbl: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    marginTop: 2,
  },
});
