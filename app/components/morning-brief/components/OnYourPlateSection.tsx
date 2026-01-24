/**
 * OnYourPlateSection
 *
 * Displays unassigned/flexible tasks in Morning Brief.
 * Tasks here can be tapped to assign to a time block.
 * Styled to match CalendarScreen section patterns.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Plus, Clock } from 'lucide-react-native';
import { TaskItem, type TaskItemData } from './TaskItem';

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

interface OnYourPlateSectionProps {
  tasks: TaskItemData[];
  onTaskPress: (task: TaskItemData) => void;
  onAddPress: () => void;
}

export function OnYourPlateSection({ tasks, onTaskPress, onAddPress }: OnYourPlateSectionProps) {
  const count = tasks.length;

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

      {/* Task List */}
      {tasks.map((task, index) => (
        <View
          key={task.id}
          style={[styles.taskWrapper, index < tasks.length - 1 && styles.taskBorder]}
        >
          <TaskItem task={task} onPress={onTaskPress} />
        </View>
      ))}

      {/* Empty State */}
      {count === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Nothing flexible right now. Add a task or check your time blocks above.
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
});
