import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useChapterUpcomingRisk } from '../../../lib/store/chaptersSelectors';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterUpcomingRiskSectionProps {
  chapter: Chapter;
}

export function ChapterUpcomingRiskSection({ chapter }: ChapterUpcomingRiskSectionProps) {
  const risks = useChapterUpcomingRisk(chapter);

  if (risks.length === 0) return null;

  const { chipRelationshipText, commitmentSlipMarker, warmGrey, worldsInk } = lightTokens.colors;
  // Slip marker background at 0.20 opacity
  const markerBg = `rgba(239,159,39,0.20)`;

  return (
    <View style={styles.container}>
      {/* alias for commitmentAccentDeep — same hex as chipRelationshipText */}
      <Text style={[styles.label, { color: chipRelationshipText }]}>UPCOMING RISK</Text>
      {risks.map((item, i) => {
        const isLast = i === risks.length - 1;
        return (
          <View key={item.id} style={[styles.row, !isLast && styles.rowBorder]}>
            {/* ⚠ marker — Text node, not an icon */}
            <View style={[styles.markerBox, { backgroundColor: markerBg }]}>
              <Text style={[styles.markerGlyph, { color: commitmentSlipMarker }]}>⚠</Text>
            </View>
            <Text style={[styles.rowText, { color: worldsInk }]}>{item.text}</Text>
            <Text style={[styles.dateLabel, { color: warmGrey }]}>{item.dateLabel}</Text>
          </View>
        );
      })}
      <Text style={[styles.footnote, { color: warmGrey }]}>
        Decide in advance whether each is a held day or a named exception.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 2,
    gap: 10,
  },
  rowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  markerBox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  markerGlyph: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 14,
  },
  rowText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 11 * 1.35,
    flex: 1,
  },
  dateLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    textAlign: 'right',
    flexShrink: 0,
  },
  footnote: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 8,
    paddingHorizontal: 2,
  },
});
