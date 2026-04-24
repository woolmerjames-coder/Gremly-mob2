import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { lightTokens } from '../../design/tokens';
import { useChapters } from '../../lib/store/worldsSelectors';
import { ChapterRowCompact } from './ChapterRowCompact';

interface OpenChaptersSectionProps {
  onPressChapter: (chapterId: string) => void;
}

export function OpenChaptersSection({ onPressChapter }: OpenChaptersSectionProps) {
  const chapters = useChapters();
  const open = chapters
    .filter((c) => c.phase !== 'closed')
    .sort((a, b) => {
      if (a.end_date && b.end_date) return a.end_date.localeCompare(b.end_date);
      if (a.end_date) return -1;
      if (b.end_date) return 1;
      return (b.start_date ?? '').localeCompare(a.start_date ?? '');
    });

  if (open.length === 0) return null;

  return (
    <View>
      <View style={styles.sec}>
        <Text style={styles.label}>Priority Chapters</Text>
      </View>
      {open.map((c) => (
        <ChapterRowCompact key={c.id} chapter={c} onPress={onPressChapter} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sec: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 12,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 19,
    fontWeight: '700',
    color: lightTokens.colors.worldsInk,
  },
});
