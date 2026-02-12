/**
 * OnYourPlateSection
 *
 * Displays unassigned/flexible tasks in Morning Brief.
 * Tasks here can be tapped to assign to a time block.
 * Styled to match CalendarScreen section patterns.
 * Supports exit animations when tasks are being organized.
 */

import React, { useState, useEffect } from 'react';
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

export function OnYourPlateSection({
  tasks,
  animatingAssignments,
  onTaskPress,
  onTimePress,
  onAddPress,
  pendingDrops = [],
}: OnYourPlateSectionProps) {
  const count = tasks.length + pendingDrops.length;

  // Split tasks into habits and todos for sub-sections
  const habitTasks = tasks.filter((t) => t.type === 'habit');
  const todoTasks = tasks.filter((t) => t.type === 'todo');

  return (
    <View style={styles.container}>
      {/* Section Header - matches CalendarScreen pattern */}
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionHeaderAccent, { backgroundColor: SECTION_COLOR }]} />
        <Clock size={16} color={SECTION_COLOR} style={styles.sectionIcon} />
        <Text style={[styles.sectionHeader, { color: SECTION_COLOR }]}>ON YOUR PLATE</Text>
        <Text style={styles.countBadge}>{count} flexible</Text>

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
      {count > 0 && (
        <Text style={styles.instructions}>Tap to assign to a time block, or leave flexible</Text>
      )}

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
          {habitTasks.map((task, index) => {
            const animationIndex =
              animatingAssignments?.findIndex((a) => a.taskId === task.id) ?? -1;
            const isAnimatingOut = animationIndex >= 0;

            return (
              <View
                key={task.id}
                style={[styles.taskWrapper, index < habitTasks.length - 1 && styles.taskBorder]}
              >
                <AnimatedTaskItem
                  task={task}
                  onPress={onTaskPress}
                  onTimePress={onTimePress}
                  isAnimatingOut={isAnimatingOut}
                  animationDelay={animationIndex * 150}
                />
              </View>
            );
          })}
        </>
      )}

      {/* To-dos Sub-section */}
      {todoTasks.length > 0 && (
        <>
          <View style={styles.subSectionHeader}>
            <Text style={styles.subSectionTitle}>To-dos</Text>
            <Text style={styles.subSectionCount}>{todoTasks.length}</Text>
          </View>
          {todoTasks.map((task, index) => {
            const animationIndex =
              animatingAssignments?.findIndex((a) => a.taskId === task.id) ?? -1;
            const isAnimatingOut = animationIndex >= 0;

            return (
              <View
                key={task.id}
                style={[styles.taskWrapper, index < todoTasks.length - 1 && styles.taskBorder]}
              >
                <AnimatedTaskItem
                  task={task}
                  onPress={onTaskPress}
                  onTimePress={onTimePress}
                  isAnimatingOut={isAnimatingOut}
                  animationDelay={animationIndex * 150}
                />
              </View>
            );
          })}
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
