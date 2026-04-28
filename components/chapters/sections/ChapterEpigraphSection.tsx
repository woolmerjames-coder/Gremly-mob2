import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import type { Chapter, ArcShape } from '../../../lib/supabase/types';

// experienceAccent replaces legacy epigraphBorder — semantically correct arc color
function arcShapeColor(arcShape: ArcShape | null): string {
  switch (arcShape) {
    case 'outcome':
      return lightTokens.colors.mossGreen;
    case 'experience':
      return lightTokens.colors.experienceAccent;
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
  const hasEpigraph = !!chapter.epigraph?.trim();
  const isClosed = !!chapter.closed_at;
  const arcColor = arcShapeColor(chapter.arc_shape);

  return (
    <View style={styles.container}>
      <View style={[styles.borderLine, { backgroundColor: arcColor }]} />
      <View style={styles.content}>
        {hasEpigraph ? (
          <>
            <Text style={[styles.epigraph, isClosed && styles.epigraphClosed]}>
              {chapter.epigraph}
            </Text>
            <Text style={styles.meta}>epigraph \u00b7 tap to rewrite</Text>
          </>
        ) : (
          <Pressable onPress={() => {}} testID="chapter-epigraph-placeholder" hitSlop={8}>
            <Text style={styles.placeholder}>epigraph \u00b7 tap to rewrite</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 26,
    paddingHorizontal: 16,
    gap: 10,
  },
  borderLine: {
    width: 2,
    alignSelf: 'stretch',
    borderRadius: 2,
    flexShrink: 0,
    minHeight: 20,
  },
  content: {
    flex: 1,
  },
  epigraph: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
    color: lightTokens.colors.worldsInk,
  },
  epigraphClosed: {
    color: lightTokens.colors.warmGrey,
  },
  meta: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    fontStyle: 'italic',
    marginTop: 6,
  },
  placeholder: {
    fontFamily: 'PlusJakartaSans-Regular',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    fontStyle: 'italic',
  },
});
