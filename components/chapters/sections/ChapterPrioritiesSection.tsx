import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterPrioritiesSectionProps {
  chapter: Chapter;
}

export function ChapterPrioritiesSection({ chapter }: ChapterPrioritiesSectionProps) {
  if (chapter.closed_at) return null;

  const blockers = (chapter.key_priorities ?? [])
    .filter((p) => p.kind === 'blocker')
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  if (blockers.length === 0) return null;

  const pillLabel = blockers.length === 1 ? '1 BLOCKER' : `${blockers.length} BLOCKERS`;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>STANDING IN THE WAY</Text>
        <View style={styles.blockerPill}>
          <Text style={styles.blockerPillText}>{pillLabel}</Text>
        </View>
      </View>
      {blockers.map((p, i) => {
        const isLast = i === blockers.length - 1;
        return (
          <View key={i} style={[styles.row, !isLast && styles.rowDivider]}>
            <View style={styles.marker}>
              <Text style={styles.markerText}>!</Text>
            </View>
            <Text style={styles.body}>{p.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 26,
    paddingHorizontal: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: lightTokens.colors.warmGrey,
  },
  blockerPill: {
    backgroundColor: lightTokens.colors.blockerRedBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  blockerPillText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '500',
    color: lightTokens.colors.blockerRed,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    gap: 8,
  },
  rowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  marker: {
    width: 14,
    height: 14,
    backgroundColor: lightTokens.colors.blockerMarkerBg,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  markerText: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    fontWeight: '600',
    color: lightTokens.colors.blockerMarkerFg,
    lineHeight: 13,
  },
  body: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: lightTokens.colors.worldsInk,
  },
});
