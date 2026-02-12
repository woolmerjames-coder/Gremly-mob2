/**
 * GapSlotPicker - Modal for selecting a task to slot into a time gap.
 * Shows unassigned tasks that fit within the gap duration.
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Clock, Circle, Repeat, X } from 'lucide-react-native';
import type { TimeGap } from '../../../../lib/timeGaps';
import type { TaskItemData } from './TaskItem';

const COLORS = {
  surface: '#FFFFFF',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  mossGreen: '#2E5540',
  divider: '#E8E6E1',
  selectedBg: 'rgba(46, 85, 64, 0.1)',
};

interface GapSlotPickerProps {
  visible: boolean;
  gap: TimeGap | null;
  /** All unslotted tasks for the current block */
  availableTasks: TaskItemData[];
  onClose: () => void;
  onSlotTask: (taskId: string, taskType: 'todo' | 'habit', gapStartIso: string) => void;
}

export function GapSlotPicker({
  visible,
  gap,
  availableTasks,
  onClose,
  onSlotTask,
}: GapSlotPickerProps) {
  // Filter to tasks that fit the gap (or have no estimate)
  const fittingTasks = useMemo(() => {
    if (!gap) return [];
    return availableTasks.filter((task) => {
      if (!task.estimatedMinutes) return true; // No estimate = always show
      return task.estimatedMinutes <= gap.durationMinutes;
    });
  }, [availableTasks, gap]);

  const handleSelect = useCallback(
    (task: TaskItemData) => {
      if (!gap) return;
      onSlotTask(task.id, task.type, gap.startIso);
      onClose();
    },
    [gap, onSlotTask, onClose],
  );

  if (!gap) return null;

  const timeLabel = `${formatTime(gap.startIso)} – ${formatTime(gap.endIso)}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <Clock size={20} color={COLORS.mossGreen} />
            <View style={styles.headerText}>
              <Text style={styles.title}>Fill this gap</Text>
              <Text style={styles.subtitle}>
                {timeLabel} · {gap.durationMinutes} min
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={20} color={COLORS.inkMuted} />
            </Pressable>
          </View>

          {/* Task list */}
          <ScrollView style={styles.list} bounces={false}>
            {fittingTasks.length === 0 ? (
              <Text style={styles.emptyText}>
                No tasks fit this gap. Try adding time estimates to your tasks.
              </Text>
            ) : (
              fittingTasks.map((task) => {
                const Icon = task.type === 'habit' ? Repeat : Circle;
                return (
                  <Pressable key={task.id} style={styles.item} onPress={() => handleSelect(task)}>
                    <Icon size={16} color={COLORS.inkMuted} />
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {task.title}
                    </Text>
                    <Text style={styles.itemEstimate}>
                      {task.estimatedMinutes ? `${task.estimatedMinutes}m` : '? min'}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  content: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    maxHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginTop: 1,
  },
  list: {
    maxHeight: 280,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
    gap: 10,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    color: COLORS.charcoalInk,
  },
  itemEstimate: {
    fontSize: 13,
    color: COLORS.inkMuted,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.inkMuted,
    textAlign: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
});
