// LEGACY: no longer used by SpaceHomeScreen. Kept for reference.
/**
 * HabitsTodosPreview - Shows habits and todos for a space
 * Uses listHabitsForSpace and listTodosForSpace selectors
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Habit, Todo } from '../../../lib/types';
import { lightTokens } from '../../../design/tokens';

interface HabitsTodosPreviewProps {
  habits: Habit[];
  todos: Todo[];
  onViewHabits?: () => void;
  onViewTodos?: () => void;
}

export function HabitsTodosPreview({
  habits,
  todos,
  onViewHabits,
  onViewTodos,
}: HabitsTodosPreviewProps) {
  const hasContent = habits.length > 0 || todos.length > 0;

  if (!hasContent) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyText}>No habits or todos yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Habits Section */}
      {habits.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Habits ({habits.length})</Text>
            {onViewHabits && (
              <TouchableOpacity onPress={onViewHabits}>
                <Text style={styles.viewAllLink}>View all</Text>
              </TouchableOpacity>
            )}
          </View>
          {habits.slice(0, 3).map((habit) => (
            <View key={habit.id} style={styles.item}>
              <Text style={styles.itemIcon}>🔄</Text>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {habit.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Todos Section */}
      {todos.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>To-Dos ({todos.length})</Text>
            {onViewTodos && (
              <TouchableOpacity onPress={onViewTodos}>
                <Text style={styles.viewAllLink}>View all</Text>
              </TouchableOpacity>
            )}
          </View>
          {todos.slice(0, 3).map((todo) => (
            <View key={todo.id} style={styles.item}>
              <Text style={styles.itemIcon}>✓</Text>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {todo.name}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: lightTokens.spacing[4],
  },
  section: {
    gap: lightTokens.spacing[2],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: lightTokens.spacing[1],
  },
  sectionTitle: {
    fontSize: lightTokens.typography.size.md,
    fontWeight: '600',
    color: lightTokens.colors.text,
  },
  viewAllLink: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.primary,
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: lightTokens.spacing[2],
    backgroundColor: lightTokens.colors.bg,
    borderRadius: lightTokens.radius[2],
  },
  itemIcon: {
    fontSize: 16,
    marginRight: lightTokens.spacing[2],
  },
  itemTitle: {
    fontSize: lightTokens.typography.size.md,
    color: lightTokens.colors.text,
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    padding: lightTokens.spacing[5],
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: lightTokens.spacing[2],
  },
  emptyText: {
    fontSize: lightTokens.typography.size.sm,
    color: lightTokens.colors.subtle,
    textAlign: 'center',
  },
});
