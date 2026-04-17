/**
 * OnYourPlateSection
 *
 * Displays unassigned/flexible tasks in Morning Brief.
 * Tasks here can be tapped to assign to a time block.
 * Styled to match CalendarScreen section patterns.
 * Supports exit animations when tasks are being organized.
 *
 * When isPrioritizing is true, enters "prioritization mode":
 * - Tasks show checkboxes and two-line selected state
 * - Tapping a row toggles selection
 * - Selected items sort to top within each sub-section
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { AnimatedTaskItem, type TaskItemData } from './TaskItem';
import type { QueuedDrop } from '../../../../lib/minddrop/dropQueue';

// Colors matching CalendarScreen exactly
const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
};

interface AnimatingAssignment {
  taskId: string;
  block: string;
}

interface OnYourPlateSectionProps {
  tasks: TaskItemData[];
  animatingAssignments?: AnimatingAssignment[] | null;
  onTaskPress: (task: TaskItemData) => void;
  onTimePress?: (task: TaskItemData) => void;
  onAddPress: () => void;
  pendingDrops?: QueuedDrop[];
  // Prioritization mode props
  isPrioritizing?: boolean;
  /** When true, show all tasks regardless of selection state */
  showAll?: boolean;
  selectedIds?: Set<string>;
  lockedIds?: Set<string>;
  onToggleSelect?: (task: TaskItemData) => void;
  onToggleLock?: (task: TaskItemData) => void;
  onAssignPress?: (task: TaskItemData) => void;
  maxLocks?: number;
}

/**
 * PendingDropRow - Shows a processing task with loading animation
 * Matches the visual style of TaskItem but with loading state
 */
function PendingDropRow({ drop }: { drop: QueuedDrop }) {
  const [dots, setDots] = useState('');

  // Animated dots for loading state
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.pendingDropRow}>
      <View style={styles.pendingDropContent}>
        <Text style={styles.pendingDropTitle} numberOfLines={1}>
          {drop.smartTitle || drop.text}
        </Text>
        <Text style={styles.pendingDropSubtitle}>Working on it{dots}</Text>
      </View>
      <ActivityIndicator size="small" color={COLORS.mossGreen} />
    </View>
  );
}

export function OnYourPlateSection({
  tasks,
  animatingAssignments,
  onTaskPress,
  onTimePress,
  onAddPress: _onAddPress,
  pendingDrops = [],
  // Prioritization props
  isPrioritizing = false,
  showAll = false,
  selectedIds,
  lockedIds,
  onToggleSelect,
  onToggleLock,
  onAssignPress,
  maxLocks = 3,
}: OnYourPlateSectionProps) {
  const count = tasks.length + pendingDrops.length;

  // Split tasks into habits and todos for sub-sections
  const habitTasks = useMemo(() => {
    const habits = tasks.filter((t) => t.type === 'habit');
    if (isPrioritizing && selectedIds && !showAll) {
      return habits.filter((t) => selectedIds.has(t.id));
    }
    return habits;
  }, [tasks, isPrioritizing, selectedIds, showAll]);

  const todoTasks = useMemo(() => {
    const todos = tasks.filter((t) => t.type === 'todo');
    if (isPrioritizing && selectedIds && !showAll) {
      return todos.filter((t) => selectedIds.has(t.id));
    }
    return todos;
  }, [tasks, isPrioritizing, selectedIds, showAll]);

  // In prioritization mode, row press toggles selection instead of opening picker
  const handleRowPress = isPrioritizing && onToggleSelect ? onToggleSelect : onTaskPress;

  // Shared prioritization props for TaskItem
  const lockCount = lockedIds?.size ?? 0;

  // Selected count for empty-state check
  const selectedCount = isPrioritizing && selectedIds ? selectedIds.size : 0;

  // Merge habits + todos into a flat list (no sub-section headers)
  const allTasks = useMemo(() => {
    return [...habitTasks, ...todoTasks];
  }, [habitTasks, todoTasks]);

  return (
    <View style={styles.container}>
      {/* Pending Drops - Processing cards from store */}
      {pendingDrops.map((drop) => (
        <PendingDropRow key={drop.localId} drop={drop} />
      ))}

      {/* Flat task list (no sub-section headers) */}
      {allTasks.length > 0 && (
        <View style={isPrioritizing ? styles.prioritizingList : undefined}>
          {allTasks.map((task, index) => {
            const animationIndex =
              animatingAssignments?.findIndex((a) => a.taskId === task.id) ?? -1;
            const isAnimatingOut = animationIndex >= 0;

            return (
              <View
                key={task.id}
                style={[
                  isPrioritizing ? styles.taskWrapperPrioritizing : styles.taskWrapper,
                  !isPrioritizing && index < allTasks.length - 1 && styles.taskBorder,
                ]}
              >
                <AnimatedTaskItem
                  task={task}
                  onPress={handleRowPress}
                  onTimePress={onTimePress}
                  isAnimatingOut={isAnimatingOut}
                  animationDelay={animationIndex * 150}
                  isPrioritizing={isPrioritizing}
                  isSelected={selectedIds?.has(task.id)}
                  isLocked={lockedIds?.has(task.id)}
                  lockCount={lockCount}
                  maxLocks={maxLocks}
                  onToggleSelect={onToggleSelect}
                  onToggleLock={onToggleLock}
                  onAssignPress={onAssignPress}
                />
              </View>
            );
          })}
        </View>
      )}

      {/* Empty State — prioritizing with nothing selected */}
      {isPrioritizing && selectedCount === 0 && pendingDrops.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyPrompt}>What do you want to tackle today?</Text>
        </View>
      )}

      {/* Empty State — no tasks at all */}
      {count === 0 && !isPrioritizing && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Nothing to organize. Add a task or check your time blocks below.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 0,
    paddingBottom: 8,
  },
  taskWrapper: {
    marginHorizontal: 16,
  },
  taskWrapperPrioritizing: {
    marginBottom: 2,
  },
  prioritizingList: {
    marginHorizontal: 14,
  },
  taskBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  emptyState: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyPrompt: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  pendingDropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 1,
    backgroundColor: COLORS.linenCream,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.divider,
  },
  pendingDropContent: {
    flex: 1,
    marginRight: 12,
  },
  pendingDropTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
    lineHeight: 20,
  },
  pendingDropSubtitle: {
    fontSize: 12,
    color: COLORS.mossGreen,
    marginTop: 2,
    fontStyle: 'italic',
  },
});
