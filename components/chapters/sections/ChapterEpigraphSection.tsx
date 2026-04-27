import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import type { Chapter, ArcShape } from '../../../lib/supabase/types';

function arcShapeColor(arcShape: ArcShape | null): string {
  switch (arcShape) {
    case 'outcome':
      return lightTokens.colors.mossGreen;
    case 'experience':
      return lightTokens.colors.epigraphBorder;
    case 'process':
      return lightTokens.colors.sageGreen;
    case 'commitment':
      return lightTokens.colors.warmGrey;
    default:
      return lightTokens.colors.warmGrey;
  }
}

interface ChapterEpigraphSectionProps {
  chapter: Chapter;
}

export function ChapterEpigraphSection({ chapter }: ChapterEpigraphSectionProps) {
  if (!chapter.epigraph || chapter.epigraph.trim().length === 0) return null;

  const isClosed = !!chapter.closed_at;
  const arcColor = arcShapeColor(chapter.arc_shape);

  return (
    <View style={styles.container}>
      <View style={[styles.borderLine, { backgroundColor: arcColor }]} />
      <Text style={[styles.epigraph, isClosed && styles.epigraphClosed]}>{chapter.epigraph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 26,
    paddingHorizontal: 16,
    gap: 12,
  },
  borderLine: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    flexShrink: 0,
  },
  epigraph: {
    flex: 1,
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 15,
    lineHeight: 22,
    fontStyle: 'italic',
    color: lightTokens.colors.worldsInk,
  },
  epigraphClosed: {
    color: lightTokens.colors.warmGrey,
  },
});
