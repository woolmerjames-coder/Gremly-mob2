import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette } from '../../lib/store/worldsSelectors';
import type { Chapter } from '../../lib/supabase/types';

interface ChapterRowCompactProps {
  chapter: Chapter;
  onPress: (chapterId: string) => void;
}

export function ChapterRowCompact({ chapter, onPress }: ChapterRowCompactProps) {
  const palette = useWorldPalette(chapter.primary_world_id ?? '');

  return (
    <Pressable
      onPress={() => onPress(chapter.id)}
      style={styles.card}
      testID={`chapter-row-${chapter.id}`}
    >
      <Text style={[styles.phaseHero, { color: palette.base }]} numberOfLines={1}>
        {chapter.current_phase_key?.toUpperCase() ?? ''}
      </Text>
      <Text style={styles.chapterTitle} numberOfLines={2}>
        {chapter.title}
      </Text>
      {chapter.start_date ? (
        <Text style={styles.dateLine}>since {format(new Date(chapter.start_date), 'MMM d')}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: lightTokens.colors.oatCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.oatCardBorder,
    borderRadius: 13,
  },
  phaseHero: {
    fontFamily: 'Inter-Medium',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  chapterTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    color: lightTokens.colors.worldsInk,
    marginBottom: 2,
  },
  dateLine: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: lightTokens.colors.warmGrey,
  },
});
