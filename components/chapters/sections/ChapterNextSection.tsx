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
}

export function ChapterNextSection({ chapter, onTodoToggle }: ChapterNextSectionProps) {
  const todos = useOpenTodosForChapter(chapter.id);
  if (chapter.closed_at) return null;
  if (todos.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>NEXT</Text>
      {todos.map((t, idx) => {
        const isLast = idx === todos.length - 1;
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 26, paddingHorizontal: 16 },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: lightTokens.colors.warmGrey,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lightTokens.colors.worldsCardBorder,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: lightTokens.colors.worldsInk,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    lineHeight: 19,
    color: lightTokens.colors.worldsInk,
  },
  due: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: lightTokens.colors.warmGrey,
    flexShrink: 0,
  },
  dueOverdue: {
    color: lightTokens.colors.blockerRed,
  },
});
