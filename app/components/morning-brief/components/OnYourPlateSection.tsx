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
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Plus, Clock } from 'lucide-react-native';
import { AnimatedTaskItem, type TaskItemData } from './TaskItem';
import type { PendingDrop } from '../../../../lib/store/useGremlyStore';

// Colors matching CalendarScreen exactly
const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
};

// Section color for "anytime/flexible" - matches CalendarScreen SECTION_CONFIG
const SECTION_COLOR = '#999999';

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
  pendingDrops?: PendingDrop[];
  // Prioritization mode props
  isPrioritizing?: boolean;
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
function PendingDropRow({ drop }: { drop: PendingDrop }) {
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

/**
 * Stable sort: selected items first, preserving original order within each group.
 */
function sortBySelection(tasks: TaskItemData[], selectedIds: Set<string>): TaskItemData[] {
  const selected: TaskItemData[] = [];
  const deselected: TaskItemData[] = [];
  for (const t of tasks) {
    if (selectedIds.has(t.id)) {
      selected.push(t);
    } else {
      deselected.push(t);
    }
  }
  return [...selected, ...deselected];
}

export function OnYourPlateSection({
  tasks,
  animatingAssignments,
  onTaskPress,
  onTimePress,
  onAddPress,
  pendingDrops = [],
  // Prioritization props
  isPrioritizing = false,
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
    return isPrioritizing && selectedIds ? sortBySelection(habits, selectedIds) : habits;
  }, [tasks, isPrioritizing, selectedIds]);

  const todoTasks = useMemo(() => {
    const todos = tasks.filter((t) => t.type === 'todo');
    return isPrioritizing && selectedIds ? sortBySelection(todos, selectedIds) : todos;
  }, [tasks, isPrioritizing, selectedIds]);

  // In prioritization mode, row press toggles selection instead of opening picker
  const handleRowPress = isPrioritizing && onToggleSelect ? onToggleSelect : onTaskPress;

  // Count badge text
  const countText =
    isPrioritizing && selectedIds ? `${selectedIds.size} selected` : `${count} flexible`;

  // Instruction text
  const instructionText = isPrioritizing
    ? 'Pick what matters \u2014 Gremly handles the rest'
    : 'Tap to assign to a time block, or leave flexible';

  // Shared prioritization props for TaskItem
  const lockCount = lockedIds?.size ?? 0;

  return (
    <View style={styles.container}>
      {/* Section Header - matches CalendarScreen pattern */}
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionHeaderAccent, { backgroundColor: SECTION_COLOR }]} />
        <Clock size={16} color={SECTION_COLOR} style={styles.sectionIcon} />
        <Text style={[styles.sectionHeader, { color: SECTION_COLOR }]}>ON YOUR PLATE</Text>
        <Text style={styles.countBadge}>{countText}</Text>

        {/* Add Button */}
        <Pressable
          style={styles.addButton}
          onPress={onAddPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="morning-brief-add-task"
        >
          <Plus size={16} color={COLORS.mossGreen} />
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      {/* Instructions */}
      {count > 0 && <Text style={styles.instructions}>{instructionText}</Text>}

      {/* Pending Drops - Processing cards from store */}
      {pendingDrops.map((drop) => (
        <PendingDropRow key={drop.localId} drop={drop} />
      ))}

      {/* Habits Sub-section */}
      {habitTasks.length > 0 && (
        <>
          <View style={styles.subSectionHeader}>
            <Text style={styles.subSectionTitle}>Habits</Text>
            <Text style={styles.subSectionCount}>{habitTasks.length}</Text>
          </View>
          <View style={isPrioritizing ? styles.prioritizingList : undefined}>
            {habitTasks.map((task, index) => {
              const animationIndex =
                animatingAssignments?.findIndex((a) => a.taskId === task.id) ?? -1;
              const isAnimatingOut = animationIndex >= 0;

              return (
                <View
                  key={task.id}
                  style={[
                    isPrioritizing ? styles.taskWrapperPrioritizing : styles.taskWrapper,
                    !isPrioritizing && index < habitTasks.length - 1 && styles.taskBorder,
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
        </>
      )}

      {/* To-dos Sub-section */}
      {todoTasks.length > 0 && (
        <>
          <View style={styles.subSectionHeader}>
            <Text style={styles.subSectionTitle}>To-dos</Text>
            <Text style={styles.subSectionCount}>{todoTasks.length}</Text>
          </View>
          <View style={isPrioritizing ? styles.prioritizingList : undefined}>
            {todoTasks.map((task, index) => {
              const animationIndex =
                animatingAssignments?.findIndex((a) => a.taskId === task.id) ?? -1;
              const isAnimatingOut = animationIndex >= 0;

              return (
                <View
                  key={task.id}
                  style={[
                    isPrioritizing ? styles.taskWrapperPrioritizing : styles.taskWrapper,
                    !isPrioritizing && index < todoTasks.length - 1 && styles.taskBorder,
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
        </>
      )}

      {/* Empty State */}
      {count === 0 && (
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
    marginTop: 8,
    paddingBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderAccent: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    marginRight: 10,
  },
  sectionIcon: {
    marginRight: 6,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
  },
  countBadge: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginRight: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: COLORS.linenCream,
  },
  addText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.mossGreen,
    marginLeft: 4,
  },
  instructions: {
    fontSize: 13,
    color: COLORS.inkMuted,
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontStyle: 'italic',
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
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999999',
    letterSpacing: 0.3,
  },
  subSectionCount: {
    fontSize: 12,
    color: '#999999',
    marginLeft: 6,
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
