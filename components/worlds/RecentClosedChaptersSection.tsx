import { View, StyleSheet } from 'react-native';
import { Text } from '../../ui';
import { lightTokens } from '../../design/tokens';
import { useChapters } from '../../lib/store/worldsSelectors';
import { ClosedChapterCardCompact } from './ClosedChapterCardCompact';

interface RecentClosedChaptersSectionProps {
  onPressChapter: (chapterId: string) => void;
}

export function RecentClosedChaptersSection({ onPressChapter }: RecentClosedChaptersSectionProps) {
  const chapters = useChapters();
  const closed = chapters
    .filter((c) => c.phase === 'closed')
    .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))
    .slice(0, 2);

  if (closed.length === 0) return null;

  return (
    <View>
      <View style={styles.sec}>
        <Text style={styles.label}>RECENT CLOSED</Text>
      </View>
      <View style={styles.row}>
        {closed.map((c) => (
          <ClosedChapterCardCompact key={c.id} chapter={c} onPress={onPressChapter} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sec: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 10 },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
});
