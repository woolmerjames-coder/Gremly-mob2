/**
 * SlottedTaskRow - A task that's been slotted into a specific time gap.
 * Shows inline in the timeline between events.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Circle, Repeat } from 'lucide-react-native';
import type { SlottedTask } from '../../../../lib/timeGaps';

const COLORS = {
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  slotBg: 'rgba(46, 85, 64, 0.06)',
  timeText: '#999999',
};

interface SlottedTaskRowProps {
  task: SlottedTask;
  onPress?: (task: SlottedTask) => void;
}

export function SlottedTaskRow({ task, onPress }: SlottedTaskRowProps) {
  const timeLabel = new Date(task.scheduledStartIso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const Icon = task.type === 'habit' ? Repeat : Circle;
  const estimateLabel =
    task.estimateMinutes < 60
      ? `${task.estimateMinutes}m`
      : `${Math.floor(task.estimateMinutes / 60)}h ${task.estimateMinutes % 60}m`;

  return (
    <Pressable style={styles.container} onPress={() => onPress?.(task)}>
      <Icon size={14} color={COLORS.mossGreen} />
      <Text style={styles.title} numberOfLines={1}>
        {task.title}
      </Text>
      <Text style={styles.estimate}>{estimateLabel}</Text>
      <Text style={styles.time}>{timeLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(46, 85, 64, 0.06)',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    color: '#0E1116',
  },
  estimate: {
    fontSize: 12,
    color: '#666666',
  },
  time: {
    fontSize: 12,
    color: '#999999',
    minWidth: 55,
    textAlign: 'right',
  },
});
