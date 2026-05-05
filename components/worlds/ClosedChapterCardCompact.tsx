import { Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { lightTokens } from '../../design/tokens';
import { Text } from '../../ui';
import type { Chapter } from '../../lib/supabase/types';

interface ClosedChapterCardCompactProps {
  chapter: Chapter;
  onPress: (chapterId: string) => void;
}

export function ClosedChapterCardCompact({ chapter, onPress }: ClosedChapterCardCompactProps) {
  const range = formatRange(chapter.start_date, chapter.end_date);
  return (
    <Pressable
      onPress={() => onPress(chapter.id)}
      style={styles.card}
      testID={`closed-chapter-${chapter.id}`}
    >
      <Text style={styles.name}>{chapter.title}</Text>
      <Text style={styles.sub}>{range} · closed</Text>
    </Pressable>
  );
}

function formatRange(start: string | null, end: string | null): string {
  if (start && end) {
    return `${format(new Date(start), 'MMM')}-${format(new Date(end), 'MMM')}`;
  }
  if (end) return format(new Date(end), 'MMM');
  return '';
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: lightTokens.colors.oatCard,
    borderWidth: 1,
    borderColor: lightTokens.colors.oatCardBorder,
    borderRadius: 12,
  },
  name: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
    color: lightTokens.colors.warmGrey,
  },
  sub: {
    fontFamily: 'Inter-Regular',
    fontSize: 10,
    color: lightTokens.colors.doneTextMuted,
    marginTop: 2,
  },
});
