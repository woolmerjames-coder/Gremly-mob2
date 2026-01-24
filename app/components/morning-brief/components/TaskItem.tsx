/**
 * TaskItem
 *
 * Displays a single todo or habit in Morning Brief.
 * Shows diamond indicator for locked-in items, circle for regular.
 * Tappable to open assignment picker.
 */

import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { BRAND } from '../../../../design/brand';
import { formatDuration } from '../../../../lib/capacity';
import type { TimeBlock } from '../../../../lib/capacity';

export interface TaskItemData {
  id: string;
  type: 'todo' | 'habit';
  title: string;
  timeWindow?: TimeBlock | 'any' | null;
  isLockedIn: boolean;
  estimatedMinutes?: number;
}

interface TaskItemProps {
  task: TaskItemData;
  onPress: (task: TaskItemData) => void;
  showEstimate?: boolean;
  dimmed?: boolean;
}

export function TaskItem({ task, onPress, showEstimate = true, dimmed = false }: TaskItemProps) {
  // Diamond for locked-in, circle for regular
  const indicator = task.isLockedIn ? '◆' : '○';
  const indicatorColor = task.isLockedIn ? BRAND.colors.mossGreen : BRAND.colors.inkMuted;

  const hasEstimate = showEstimate && task.estimatedMinutes != null && task.estimatedMinutes > 0;

  return (
    <Pressable
      style={[styles.container, dimmed && styles.containerDimmed]}
      onPress={() => onPress(task)}
      testID={`task-item-${task.id}`}
    >
      <Text style={[styles.indicator, { color: indicatorColor }]}>{indicator}</Text>
      <Text style={[styles.title, dimmed && styles.textDimmed]} numberOfLines={1}>
        {task.title}
      </Text>
      {hasEstimate && (
        <Text style={[styles.estimate, dimmed && styles.textDimmed]}>
          {formatDuration(task.estimatedMinutes!)}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius.sm,
    marginBottom: 6,
  },
  containerDimmed: {
    opacity: 0.5,
  },
  indicator: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    color: BRAND.colors.charcoalInk,
    lineHeight: 20,
  },
  textDimmed: {
    color: BRAND.colors.inkMuted,
  },
  estimate: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginLeft: 8,
  },
});
