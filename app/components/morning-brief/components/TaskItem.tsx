/**
 * TaskItem
 *
 * Renders a single task row in Morning Brief.
 * - Tap row → opens TimeBlockPicker
 * - Tap time estimate → opens TimeEstimatePicker
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Circle, Diamond, Repeat } from 'lucide-react-native';
import type { TimeBlock } from '../../../../lib/capacity';

const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  surface: '#FFFFFF',
};

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
  onTimePress?: (task: TaskItemData) => void;
  showEstimate?: boolean;
  dimmed?: boolean;
}

export function TaskItem({
  task,
  onPress,
  onTimePress,
  showEstimate = true,
  dimmed = false,
}: TaskItemProps) {
  const Icon = task.isLockedIn ? Diamond : task.type === 'habit' ? Repeat : Circle;
  const iconColor = task.isLockedIn ? COLORS.mossGreen : COLORS.inkMuted;

  // Format time estimate
  const timeDisplay = task.estimatedMinutes
    ? task.estimatedMinutes >= 60
      ? `${Math.floor(task.estimatedMinutes / 60)}h${task.estimatedMinutes % 60 > 0 ? ` ${task.estimatedMinutes % 60}m` : ''}`
      : `${task.estimatedMinutes}m`
    : null;

  const handleTimePress = () => {
    if (onTimePress) {
      onTimePress(task);
    }
  };

  return (
    <View style={[styles.container, dimmed && styles.containerDimmed]}>
      <Pressable style={styles.mainContent} onPress={() => onPress(task)}>
        <Icon size={16} color={iconColor} style={styles.icon} />
        <Text style={[styles.title, dimmed && styles.titleDimmed]} numberOfLines={1}>
          {task.title}
        </Text>
      </Pressable>

      {/* Time estimate - separate tap target */}
      {showEstimate && (
        <Pressable
          style={styles.timeButton}
          onPress={handleTimePress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.time, !timeDisplay && styles.timeEmpty]}>
            {timeDisplay ?? '+ time'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  containerDimmed: {
    opacity: 0.5,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    color: COLORS.charcoalInk,
  },
  titleDimmed: {
    color: COLORS.inkMuted,
  },
  timeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: COLORS.linenCream,
    marginLeft: 8,
  },
  time: {
    fontSize: 13,
    color: COLORS.inkMuted,
    fontWeight: '500',
  },
  timeEmpty: {
    color: COLORS.mossGreen,
    fontStyle: 'italic',
  },
});
