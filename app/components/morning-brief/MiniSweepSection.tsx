/**
 * MiniSweepSection - Section component for Mini Sweep gate
 *
 * Displays a list of todos with individual action buttons and bulk actions.
 * Used within MiniSweepGate for "Rolled Over" and "Unscheduled" sections.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { BRAND } from '../../../design/brand';
import type { Todo } from '../../../lib/types';

// Decision types for mini-sweep
type SweepAction = 'today' | 'done' | 'later';

interface MiniSweepSectionProps {
  /** Section title (e.g., "Rolled Over (4)") */
  title: string;
  /** List of todos to display */
  todos: Todo[];
  /** Map of staged changes: todoId -> action */
  stagedChanges: Map<string, SweepAction>;
  /** Callback when individual item action is staged */
  onStageChange: (id: string, action: SweepAction) => void;
  /** Callback for bulk action on all items in section */
  onBulkAction: (action: SweepAction) => void;
}

/**
 * MiniSweepRow - Individual todo row with action buttons
 */
interface MiniSweepRowProps {
  todo: Todo;
  stagedAction: SweepAction | undefined;
  onAction: (action: SweepAction) => void;
}

function MiniSweepRow({ todo, stagedAction, onAction }: MiniSweepRowProps) {
  return (
    <View style={rowStyles.container} testID={`mini-sweep-row-${todo.id}`}>
      <Text style={rowStyles.name} numberOfLines={2}>
        {todo.name}
      </Text>
      <View style={rowStyles.actions}>
        <Pressable
          style={[
            rowStyles.actionButton,
            stagedAction === 'today' && rowStyles.actionButtonActive,
            stagedAction === 'today' && { backgroundColor: BRAND.colors.sageMist },
          ]}
          onPress={() => onAction('today')}
          testID={`mini-sweep-today-${todo.id}`}
        >
          <Text
            style={[rowStyles.actionText, stagedAction === 'today' && rowStyles.actionTextActive]}
          >
            Today
          </Text>
        </Pressable>
        <Pressable
          style={[
            rowStyles.actionButton,
            stagedAction === 'done' && rowStyles.actionButtonActive,
            stagedAction === 'done' && { backgroundColor: BRAND.colors.mossGreen },
          ]}
          onPress={() => onAction('done')}
          testID={`mini-sweep-done-${todo.id}`}
        >
          <Text
            style={[rowStyles.actionText, stagedAction === 'done' && rowStyles.actionTextActive]}
          >
            Done
          </Text>
        </Pressable>
        <Pressable
          style={[
            rowStyles.actionButton,
            stagedAction === 'later' && rowStyles.actionButtonActive,
            stagedAction === 'later' && { backgroundColor: BRAND.colors.periwinkleSmoke },
          ]}
          onPress={() => onAction('later')}
          testID={`mini-sweep-later-${todo.id}`}
        >
          <Text
            style={[rowStyles.actionText, stagedAction === 'later' && rowStyles.actionTextActive]}
          >
            Later
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  name: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    marginRight: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BRAND.radius.sm,
    backgroundColor: BRAND.colors.linenCream,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  actionButtonActive: {
    borderColor: 'transparent',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
  },
  actionTextActive: {
    color: BRAND.colors.charcoalInk,
    fontWeight: '600',
  },
});

/**
 * MiniSweepSection - Main section component
 */
export function MiniSweepSection({
  title,
  todos,
  stagedChanges,
  onStageChange,
  onBulkAction,
}: MiniSweepSectionProps) {
  if (todos.length === 0) return null;

  // Calculate max height for ~3-4 visible rows (each row ~52px)
  const maxHeight = Math.min(todos.length, 4) * 52;

  return (
    <View
      style={styles.container}
      testID={`mini-sweep-section-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
    >
      {/* Section Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      {/* Scrollable Todo List */}
      <ScrollView
        style={[styles.listContainer, { maxHeight }]}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {todos.map((todo) => (
          <MiniSweepRow
            key={todo.id}
            todo={todo}
            stagedAction={stagedChanges.get(todo.id)}
            onAction={(action) => onStageChange(todo.id, action)}
          />
        ))}
      </ScrollView>

      {/* Bulk Action Buttons */}
      <View style={styles.bulkActions}>
        <Pressable
          style={[styles.bulkButton, { backgroundColor: BRAND.colors.sageMist }]}
          onPress={() => onBulkAction('today')}
          testID="mini-sweep-bulk-today"
        >
          <Text style={styles.bulkButtonText}>All to Today</Text>
        </Pressable>
        <Pressable
          style={[styles.bulkButton, { backgroundColor: BRAND.colors.mossGreen }]}
          onPress={() => onBulkAction('done')}
          testID="mini-sweep-bulk-done"
        >
          <Text style={styles.bulkButtonText}>All Done</Text>
        </Pressable>
        <Pressable
          style={[styles.bulkButton, { backgroundColor: BRAND.colors.periwinkleSmoke }]}
          onPress={() => onBulkAction('later')}
          testID="mini-sweep-bulk-later"
        >
          <Text style={styles.bulkButtonText}>All Later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    overflow: 'hidden',
    ...BRAND.elevation.one,
  },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
  listContainer: {
    // maxHeight is set dynamically
  },
  listContent: {
    // Content container styles if needed
  },
  bulkActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.borderSubtle,
  },
  bulkButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.pill,
  },
  bulkButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
  },
});

export default MiniSweepSection;
