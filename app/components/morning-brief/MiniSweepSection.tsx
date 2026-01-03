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
import { MiniSweepRow } from './MiniSweepRow';

// Decision types for mini-sweep
type SweepAction = 'today' | 'done' | 'later';

// Color definitions for button states
const BUTTON_COLORS = {
  today: {
    default: { bg: '#E8F0EB', text: '#2E5540', border: '#2E5540' },
    selected: { bg: '#BFD8C0', text: '#2E5540', border: 'transparent' },
  },
  done: {
    default: { bg: '#F0F0F0', text: '#666666', border: '#9CA3AF' },
    selected: { bg: '#9CA3AF', text: '#FFFFFF', border: 'transparent' },
  },
  later: {
    default: { bg: '#FEF3E2', text: '#B45309', border: '#B45309' },
    selected: { bg: '#9CA6E0', text: '#FFFFFF', border: 'transparent' },
  },
};

interface MiniSweepSectionProps {
  /** Section title ("Rolled Over" or "Unscheduled") */
  title: string;
  /** Section description */
  description: string;
  /** Count of items in section */
  count: number;
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
 * BulkActionButton - Small pill button for bulk actions
 */
interface BulkActionButtonProps {
  action: SweepAction;
  onPress: () => void;
  testID?: string;
}

function BulkActionButton({ action, onPress, testID }: BulkActionButtonProps) {
  const colors = BUTTON_COLORS[action].default;
  const label = action === 'today' ? 'All Today' : action === 'done' ? 'All Done' : 'All Later';

  return (
    <Pressable
      style={[
        bulkStyles.button,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
      ]}
      onPress={onPress}
      testID={testID}
    >
      <Text style={[bulkStyles.buttonText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const bulkStyles = StyleSheet.create({
  button: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

/**
 * MiniSweepSection - Main section component
 */
export function MiniSweepSection({
  title,
  description,
  count,
  todos,
  stagedChanges,
  onStageChange,
  onBulkAction,
}: MiniSweepSectionProps) {
  if (todos.length === 0) return null;

  return (
    <View
      style={styles.container}
      testID={`mini-sweep-section-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
    >
      {/* Section Header */}
      <Text style={styles.headerTitle}>
        {title} ({count})
      </Text>

      {/* Description */}
      <Text style={styles.description}>{description}</Text>

      {/* Bulk Action Buttons */}
      <View style={styles.bulkActions}>
        <BulkActionButton
          action="today"
          onPress={() => onBulkAction('today')}
          testID={`mini-sweep-bulk-today-${title.toLowerCase()}`}
        />
        <BulkActionButton
          action="done"
          onPress={() => onBulkAction('done')}
          testID={`mini-sweep-bulk-done-${title.toLowerCase()}`}
        />
        <BulkActionButton
          action="later"
          onPress={() => onBulkAction('later')}
          testID={`mini-sweep-bulk-later-${title.toLowerCase()}`}
        />
      </View>

      {/* Item List */}
      <View style={styles.itemList}>
        {todos.map((todo, index) => (
          <MiniSweepRow
            key={todo.id}
            todo={todo}
            stagedAction={stagedChanges.get(todo.id)}
            onStageChange={(action) => onStageChange(todo.id, action)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0E1116',
  },
  description: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  itemList: {
    // Items handle their own spacing
  },
});

export default MiniSweepSection;
