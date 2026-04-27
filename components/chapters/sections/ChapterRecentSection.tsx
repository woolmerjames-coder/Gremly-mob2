import { View, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { parseLocalYMD } from '../../../lib/utils/dates';
import { useRecentDropsForChapter } from '../../../lib/store/chaptersSelectors';

interface ChapterRecentSectionProps {
  chapterId: string;
  limit?: number;
}

export function ChapterRecentSection({ chapterId, limit = 4 }: ChapterRecentSectionProps) {
  const drops = useRecentDropsForChapter(chapterId, limit);
  if (drops.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>RECENT</Text>
      {drops.map((d, i) => {
        const isLast = i === drops.length - 1;
        const dateLabel = d.date ? format(parseLocalYMD(d.date), 'MMM d').toUpperCase() : '';
        return (
          <View key={d.id} style={[styles.row, !isLast && styles.rowDivider]}>
            <Text style={styles.date}>{dateLabel}</Text>
            <Text style={styles.body} numberOfLines={2}>
              {d.title || d.content_preview || '(note)'}
            </Text>
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
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  date: {
    width: 54,
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    letterSpacing: 0.4,
    color: lightTokens.colors.warmGrey,
    flexShrink: 0,
    paddingTop: 2,
  },
  body: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: lightTokens.colors.worldsInk,
  },
});
