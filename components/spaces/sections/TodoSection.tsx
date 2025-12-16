/**
 * TodoSection - Compact todo list for Space Dashboard
 *
 * Features:
 * - Left-aligned checkboxes
 * - Max 4 visible items
 * - "+X more" expansion
 * - Section hides when empty
 * - Satisfying completion animation
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Circle, CheckCircle2, ChevronDown, ChevronUp, Pin } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
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

  // Filter to ONLY incomplete todos (completed todos shown via CompletedInSpaceOverlay)
  const incompleteTodos = todos.filter((t) => !t.completed_at && (t as any).status !== 'completed');
  const count = incompleteTodos.length;

  // Hide section if no incomplete todos
  if (incompleteTodos.length === 0) {
    return null;
  }

  const visibleTodos = expanded ? incompleteTodos : incompleteTodos.slice(0, maxVisible);
  const moreCount = incompleteTodos.length - maxVisible;
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
        {incompleteTodos.length > maxVisible &&
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
  const [isCompleting, setIsCompleting] = useState(false);

  // Animation values
  const rowOpacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const textOpacity = useSharedValue(1);
  const rowHeight = useSharedValue(38);

  // Debug: log completion state
  console.log(
    '[TodoRow]',
    todo.id,
    todo.title,
    'completed:',
    isCompleted,
    'isCompleting:',
    isCompleting,
  );

  const handleComplete = () => {
    if (isCompleting) return; // Prevent double-tap

    console.log('[TodoRow] Starting completion animation for:', todo.id);
    setIsCompleting(true);

    // Call onToggle IMMEDIATELY for optimistic count update
    // The animation plays out locally while the store updates
    onToggle();

    // Phase 1 (0-200ms): Text dims with strikethrough
    textOpacity.value = withTiming(0.5, { duration: 200, easing: Easing.out(Easing.ease) });

    // Phase 2 (500-800ms): Fade out + slide up + collapse height
    rowOpacity.value = withDelay(
      500,
      withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) }),
    );
    translateY.value = withDelay(
      500,
      withTiming(-12, { duration: 300, easing: Easing.in(Easing.ease) }),
    );
    rowHeight.value = withDelay(
      500,
      withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) }),
    );
  };

  // Animated styles
  const animatedRowStyle = useAnimatedStyle(() => ({
    opacity: rowOpacity.value,
    transform: [{ translateY: translateY.value }],
    height: rowHeight.value,
    overflow: 'hidden' as const,
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  // Show as checked if completing or already completed
  const showChecked = isCompleting || isCompleted;

  return (
    <Animated.View style={[styles.row, animatedRowStyle]}>
      <Pressable
        onPress={() => {
          console.log('[TodoSection] Checkbox pressed for:', todo.id, todo.title || todo.name);
          handleComplete();
        }}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={styles.checkbox}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: showChecked }}
        accessibilityLabel={`Mark ${todo.title || todo.name} as ${showChecked ? 'incomplete' : 'complete'}`}
        testID={`todo-checkbox-${todo.id}`}
      >
        {showChecked ? (
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
          <Animated.Text
            style={[styles.rowText, showChecked && styles.rowTextCompleting, animatedTextStyle]}
            numberOfLines={1}
          >
            {todo.title || todo.name}
          </Animated.Text>
          {todo.is_pinned && <Pin size={14} color={BRAND.colors.inkMuted} style={styles.pinIcon} />}
        </View>
      </Pressable>
    </Animated.View>
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
  rowTextCompleting: {
    textDecorationLine: 'line-through',
    color: BRAND.colors.inkMuted,
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
