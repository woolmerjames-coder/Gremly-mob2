import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import type { Chapter, KeyPriority } from '../../../lib/supabase/types';

function markerForKind(kind: KeyPriority['kind'] | undefined): string {
  switch (kind) {
    case 'action':
      return '●';
    case 'momentum':
      return '↗';
    case 'decision':
      return '◆';
    default:
      return '·';
  }
}

function markerColorForKind(kind: KeyPriority['kind'] | undefined): string {
  switch (kind) {
    case 'action':
      return lightTokens.colors.mossGreen;
    case 'momentum':
      return lightTokens.colors.epigraphBorder;
    default:
      return lightTokens.colors.warmGrey;
  }
}

interface ChapterPrioritiesSectionProps {
  chapter: Chapter;
}

export function ChapterPrioritiesSection({ chapter }: ChapterPrioritiesSectionProps) {
  if (chapter.closed_at) return null;

  const priorities = chapter.key_priorities ?? [];
  if (priorities.length === 0) return null;

  const sorted = [...priorities].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>PRIORITIES</Text>
      {sorted.map((p, i) => {
        const isLast = i === sorted.length - 1;
        return (
          <View key={i} style={[styles.row, !isLast && styles.rowDivider]}>
            <Text style={[styles.marker, { color: markerColorForKind(p.kind) }]}>
              {markerForKind(p.kind)}
            </Text>
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
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: lightTokens.colors.warmGrey,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 7,
    gap: 8,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  marker: {
    width: 20,
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    flexShrink: 0,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: lightTokens.colors.worldsInk,
  },
});
