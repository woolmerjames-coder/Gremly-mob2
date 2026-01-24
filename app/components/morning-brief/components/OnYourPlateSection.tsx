/**
 * OnYourPlateSection
 *
 * Displays unassigned/flexible tasks in Morning Brief.
 * Tasks here can be tapped to assign to a time block.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { BRAND } from '../../../../design/brand';
import { TaskItem, type TaskItemData } from './TaskItem';

interface OnYourPlateSectionProps {
  tasks: TaskItemData[];
  onTaskPress: (task: TaskItemData) => void;
  onAddPress: () => void;
}

export function OnYourPlateSection({ tasks, onTaskPress, onAddPress }: OnYourPlateSectionProps) {
  const count = tasks.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>On Your Plate</Text>
          <Text style={styles.count}>· {count} flexible</Text>
        </View>
        <Pressable
          style={styles.addButton}
          onPress={onAddPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="morning-brief-add-task"
        >
          <Plus size={18} color={BRAND.colors.mossGreen} />
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      {/* Instructions */}
      {count > 0 && <Text style={styles.instructions}>Tap to assign, or leave flexible</Text>}

      {/* Task List */}
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onPress={onTaskPress} />
      ))}

      {/* Empty State */}
      {count === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Nothing here yet! Add a task or check your time blocks above.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    padding: 16,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.md,
    ...BRAND.elevation.one,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  count: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    marginLeft: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BRAND.radius.sm,
    backgroundColor: BRAND.colors.linenCream,
  },
  addText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
    marginLeft: 4,
  },
  instructions: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginBottom: 12,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: BRAND.colors.linenCream,
    borderRadius: BRAND.radius.sm,
    marginVertical: 4,
  },
  taskIcon: {
    fontSize: 14,
    color: BRAND.colors.mossGreen,
    marginRight: 10,
  },
  taskTitle: {
    flex: 1,
    fontSize: 15,
    color: BRAND.colors.charcoalInk,
  },
  taskEstimate: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginLeft: 8,
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
