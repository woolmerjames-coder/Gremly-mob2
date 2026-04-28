import { View, Pressable, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { Text } from '../../../ui';
import { lightTokens } from '../../../design/tokens';
import { useOpenTodosForChapter } from '../../../lib/store/chaptersSelectors';
import { parseLocalYMD } from '../../../lib/utils/dates';
import type { Chapter } from '../../../lib/supabase/types';

interface ChapterNextSectionProps {
  chapter: Chapter;
  onTodoToggle?: (todoId: string) => void;
  label?: string;
}

export function ChapterNextSection({ chapter, onTodoToggle, label }: ChapterNextSectionProps) {
  const allTodos = useOpenTodosForChapter(chapter.id);
  if (chapter.closed_at) return null;
  if (allTodos.length === 0) return null;

  const total = allTodos.length;
  const visible = allTodos.slice(0, 3);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label ?? 'NEXT'}</Text>
      {visible.map((t, idx) => {
        const isLast = idx === visible.length - 1;
        const dueLabel = t.due_date
          ? format(parseLocalYMD(t.due_date), 'MMM d').toUpperCase()
          : null;
        const isOverdue = t.is_overdue;

        return (
          <Pressable
            key={t.id}
            style={[styles.row, !isLast && styles.rowDivider]}
            onPress={() => onTodoToggle?.(t.id)}
            hitSlop={4}
            testID={`chapter-next-${t.id}`}
          >
            <View style={styles.checkbox} />
            <Text style={styles.body} numberOfLines={2}>
              {t.title}
            </Text>
            {dueLabel ? (
              <Text style={[styles.due, isOverdue && styles.dueOverdue]}>{dueLabel}</Text>
            ) : null}
          </Pressable>
        );
      })}
      {total > 3 ? <Text style={styles.seeAll}>see all {total} →</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 26, paddingHorizontal: 16 },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: lightTokens.colors.warmGrey,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: lightTokens.colors.worldsInk,
  },
  due: {
    fontFamily: 'Inter-Medium',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    flexShrink: 0,
  },
  dueOverdue: {
    color: lightTokens.colors.blockerRed,
  },
  seeAll: {
    fontFamily: 'Inter-Regular',
    fontSize: 9,
    color: lightTokens.colors.warmGrey,
    marginTop: 6,
  },
});
