/**
 * TaskItem
 *
 * Renders a single task row in Morning Brief.
 * - Tap row → opens TimeBlockPicker
 * - Tap time estimate → opens TimeEstimatePicker
 * 
 * AnimatedTaskItem wraps TaskItem with exit animation support.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
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

/**
 * AnimatedTaskItem
 * 
 * Wraps TaskItem with exit animation support for organize flow.
 * When isAnimatingOut is true, the card lifts slightly then slides down and fades out.
 */
interface AnimatedTaskItemProps extends TaskItemProps {
  isAnimatingOut?: boolean;
  animationDelay?: number;
}

export function AnimatedTaskItem({
  task,
  onPress,
  onTimePress,
  showEstimate = true,
  dimmed = false,
  isAnimatingOut = false,
  animationDelay = 0,
}: AnimatedTaskItemProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isAnimatingOut) {
      // Staggered exit animation: lift, then slide down and fade
      Animated.sequence([
        Animated.delay(animationDelay),
        // Lift slightly with scale
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -6,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.02,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        // Brief pause at top
        Animated.delay(80),
        // Slide down and fade out
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 40,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.95,
            duration: 280,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      // Reset if not animating
      translateY.setValue(0);
      opacity.setValue(1);
      scale.setValue(1);
    }
  }, [isAnimatingOut, animationDelay, translateY, opacity, scale]);

  return (
    <Animated.View
      style={{
        transform: [{ translateY }, { scale }],
        opacity,
      }}
    >
      <TaskItem
        task={task}
        onPress={onPress}
        onTimePress={onTimePress}
        showEstimate={showEstimate}
        dimmed={dimmed}
      />
    </Animated.View>
  );
}
