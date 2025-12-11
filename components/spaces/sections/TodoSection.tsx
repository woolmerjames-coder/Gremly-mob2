/**
 * TodoSection - Compact todo list for Space Dashboard
 *
 * Features:
 * - Left-aligned checkboxes
 * - Max 4 visible items
 * - "+X more" expansion
 * - Section hides when empty
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Circle, CheckCircle2, ChevronDown, ChevronUp, Pin } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import type { Todo } from '../../../lib/types';

interface TodoSectionProps {
  todos: Todo[];
  onTodoPress: (todo: Todo) => void;
  onTodoComplete: (todo: Todo) => void;
  onTodoLongPress?: (todo: Todo) => void;
  maxVisible?: number;
}

const MAX_VISIBLE_DEFAULT = 4;

export function TodoSection({
  todos,
  onTodoPress,
  onTodoComplete,
  onTodoLongPress,
  maxVisible = MAX_VISIBLE_DEFAULT,
}: TodoSectionProps) {
  const [expanded, setExpanded] = useState(false);

  // Hook must be before any early returns
  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Filter to incomplete todos first, then completed
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed_at && !b.completed_at) return 1;
    if (!a.completed_at && b.completed_at) return -1;
    return 0;
  });

  const incompleteTodos = sortedTodos.filter((t) => !t.completed_at);
  const count = incompleteTodos.length;

  // Hide section if no todos
  if (todos.length === 0) {
    return null;
  }

  const visibleTodos = expanded ? sortedTodos : sortedTodos.slice(0, maxVisible);
  const moreCount = sortedTodos.length - maxVisible;
  const showMore = !expanded && moreCount > 0;

  return (
    <View style={styles.container} testID="todo-section">
      {/* Section Header */}
      <Pressable
        onPress={handleToggleExpand}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`To Do section, ${count} incomplete items`}
      >
        <Text style={styles.headerText}>
          To Do <Text style={styles.headerCount}>({count})</Text>
        </Text>
        {sortedTodos.length > maxVisible &&
          (expanded ? (
            <ChevronUp size={18} color={BRAND.colors.inkMuted} />
          ) : (
            <ChevronDown size={18} color={BRAND.colors.inkMuted} />
          ))}
      </Pressable>

      {/* Todo Rows */}
      <View style={styles.list}>
        {visibleTodos.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            onPress={() => onTodoPress(todo)}
            onToggle={() => onTodoComplete(todo)}
            onLongPress={onTodoLongPress ? () => onTodoLongPress(todo) : undefined}
          />
        ))}
      </View>

      {/* +X more button */}
      {showMore && (
        <Pressable
          onPress={handleToggleExpand}
          style={styles.moreButton}
          accessibilityRole="button"
          accessibilityLabel={`Show ${moreCount} more todos`}
        >
          <Text style={styles.moreText}>+{moreCount} more...</Text>
        </Pressable>
      )}
    </View>
  );
}

interface TodoRowProps {
  todo: Todo;
  onPress: () => void;
  onToggle: () => void;
  onLongPress?: () => void;
}

function TodoRow({ todo, onPress, onToggle, onLongPress }: TodoRowProps) {
  const isCompleted = !!todo.completed_at;

  // Debug: log completion state
  console.log(
    '[TodoRow]',
    todo.id,
    todo.title,
    'completed:',
    isCompleted,
    'completed_at:',
    todo.completed_at,
  );

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          console.log('[TodoSection] Checkbox pressed for:', todo.id, todo.title || todo.name);
          onToggle();
        }}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={styles.checkbox}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted }}
        accessibilityLabel={`Mark ${todo.title || todo.name} as ${isCompleted ? 'incomplete' : 'complete'}`}
        testID={`todo-checkbox-${todo.id}`}
      >
        {isCompleted ? (
          <CheckCircle2 size={22} color={BRAND.colors.mossGreen} />
        ) : (
          <Circle size={22} color={BRAND.colors.inkMuted} />
        )}
      </Pressable>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        style={({ pressed }) => [styles.rowContent, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${todo.title || todo.name}`}
        testID={`todo-row-${todo.id}`}
      >
        <View style={styles.rowTextContainer}>
          <Text style={[styles.rowText, isCompleted && styles.rowTextCompleted]} numberOfLines={1}>
            {todo.title || todo.name}
          </Text>
          {todo.is_pinned && <Pin size={14} color={BRAND.colors.inkMuted} style={styles.pinIcon} />}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // No marginBottom - parent gap handles spacing
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  headerCount: {
    fontWeight: '400',
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
  },
  checkbox: {
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
    flex: 1,
  },
  pinIcon: {
    marginLeft: 6,
  },
  rowTextCompleted: {
    textDecorationLine: 'line-through',
    color: BRAND.colors.inkMuted,
  },
  moreButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  moreText: {
    fontSize: 14,
    color: BRAND.colors.mossGreen,
    fontWeight: '500',
  },
});

export default React.memo(TodoSection);
