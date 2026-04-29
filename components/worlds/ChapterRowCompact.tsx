import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { ChevronRight } from 'lucide-react-native';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette } from '../../lib/store/worldsSelectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { Chapter } from '../../lib/supabase/types';

interface ChapterRowCompactProps {
  chapter: Chapter;
  onPress: (chapterId: string) => void;
}

export function ChapterRowCompact({ chapter, onPress }: ChapterRowCompactProps) {
  const palette = useWorldPalette(chapter.primary_world_id ?? '');
  const worldData = useGremlyStore((s) => s.worlds.find((w) => w.id === chapter.primary_world_id));
  const worldName = worldData?.display_name || worldData?.name || '';

  return (
    <Pressable
      onPress={() => onPress(chapter.id)}
      style={styles.card}
      testID={`chapter-row-${chapter.id}`}
    >
      <View style={styles.cardInner}>
        <View style={styles.cardContent}>
          <Text style={styles.chapterTitle} numberOfLines={2}>
            {chapter.title}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.worldDot, { backgroundColor: palette.dot }]} />
            <Text style={styles.metaText} numberOfLines={1}>
              {worldName}
              {chapter.start_date
                ? ` \u00b7 since ${format(new Date(chapter.start_date), 'MMM d')}`
                : ''}
            </Text>
          </View>
        </View>
        <ChevronRight size={16} color={lightTokens.colors.warmGrey} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: lightTokens.colors.worldsCard,
    borderRadius: 13,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  chapterTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 16,
    letterSpacing: -0.16,
    color: lightTokens.colors.worldsInk,
    marginTop: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  worldDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  metaText: {
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    color: lightTokens.colors.warmGrey,
    flex: 1,
  },
});
