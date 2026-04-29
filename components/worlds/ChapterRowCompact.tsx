import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import { useWorldPalette } from '../../lib/store/worldsSelectors';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { Chapter } from '../../lib/supabase/types';

function arcLabel(shape: string | null): string {
  switch (shape) {
    case 'experience':
      return 'Experience';
    case 'commitment':
      return 'Commitment';
    case 'outcome':
      return 'Outcome';
    case 'process':
      return 'Process';
    default:
      return 'Chapter';
  }
}

function arcColor(shape: string | null): string {
  switch (shape) {
    case 'experience':
      return lightTokens.colors.experienceAccentDeep;
    case 'commitment':
      return lightTokens.colors.commitmentAccent;
    case 'outcome':
      return lightTokens.colors.outcomeAccent;
    case 'process':
      return lightTokens.colors.processAccent;
    default:
      return lightTokens.colors.warmGrey;
  }
}

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
      <Text style={[styles.eyebrow, { color: arcColor(chapter.arc_shape) }]}>
        {arcLabel(chapter.arc_shape)}
      </Text>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: lightTokens.colors.worldsCard,
    borderRadius: 13,
  },
  eyebrow: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  chapterTitle: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: -0.16,
    color: lightTokens.colors.worldsInk,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
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
