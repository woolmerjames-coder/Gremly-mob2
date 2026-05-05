import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterBeforeYouGoSectionProps {
  chapter: Chapter;
}

export function ChapterBeforeYouGoSection({ chapter }: ChapterBeforeYouGoSectionProps) {
  const actions = (chapter.key_priorities ?? [])
    .filter((p) => p.kind === 'action')
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  if (actions.length === 0) return null;

  const { experienceAccentDeep, warmGrey, worldsInk } = lightTokens.colors;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: experienceAccentDeep }]}>BEFORE YOU GO</Text>
      {actions.map((p, i) => {
        const isLast = i === actions.length - 1;
        return (
          <View key={i} style={[styles.row, !isLast && styles.rowDivider]}>
            {/* Empty square checkbox marker */}
            <View style={[styles.checkbox, { borderColor: warmGrey }]} />
            <Text style={[styles.body, { color: worldsInk }]}>{p.text}</Text>
            {p.due_date != null && p.due_date.length > 0 && (
              <Text style={[styles.dueDate, { color: warmGrey }]}>
                {formatShortDate(p.due_date)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function formatShortDate(ymd: string): string {
  const [, mm, dd] = ymd.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[parseInt(mm, 10) - 1] ?? mm} ${parseInt(dd, 10)}`;
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
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.border,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    flexShrink: 0,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  dueDate: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    textAlign: 'right',
    flexShrink: 0,
  },
});
