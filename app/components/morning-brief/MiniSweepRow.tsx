/**
 * MiniSweepRow - Swipeable row for Mini Sweep gate
 *
 * Features:
 * - Swipe right → stage 'today' action
 * - Swipe left → stage 'done' action
 * - Tap "Later" button → stage 'later' action
 * - Visual feedback for staged state
 */

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Check, Clock, X } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import type { Todo } from '../../../lib/types';

// Swipe thresholds (smaller for compact rows)
const SWIPE_THRESHOLD = 80;
const VELOCITY_THRESHOLD = 500;

// Decision types for mini-sweep
type SweepAction = 'today' | 'done' | 'later';

interface MiniSweepRowProps {
  /** The todo item to display */
  todo: Todo;
  /** Currently staged action, if any */
  stagedAction: SweepAction | undefined;
  /** Callback when action is staged */
  onStageChange: (action: SweepAction) => void;
}

/**
 * Haptic feedback helper
 */
function triggerHaptic(type: 'light' | 'medium' | 'success') {
  switch (type) {
    case 'light':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'medium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
  }
}

export function MiniSweepRow({ todo, stagedAction, onStageChange }: MiniSweepRowProps) {
  // Animated values
  const translateX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);

  // Handle swipe right completion (today)
  const handleSwipeRight = useCallback(() => {
    onStageChange('today');
  }, [onStageChange]);

  // Handle swipe left completion (done)
  const handleSwipeLeft = useCallback(() => {
    onStageChange('done');
  }, [onStageChange]);

  // Pan gesture for swiping
  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // Only activate for horizontal movement
    .failOffsetY([-15, 15]) // Fail if vertical movement is dominant
    .onUpdate((event) => {
      translateX.value = event.translationX;

      // Trigger haptic at 80% threshold (once)
      const progress = Math.abs(event.translationX) / SWIPE_THRESHOLD;
      if (progress >= 0.8 && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerHaptic)('medium');
      } else if (progress < 0.5) {
        // Reset when user pulls back past halfway
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((event) => {
      const { translationX, velocityX } = event;

      // Check if swipe passes threshold (by position or velocity)
      const swipedRight =
        translationX > SWIPE_THRESHOLD || (translationX > 40 && velocityX > VELOCITY_THRESHOLD);
      const swipedLeft =
        translationX < -SWIPE_THRESHOLD || (translationX < -40 && velocityX < -VELOCITY_THRESHOLD);

      if (swipedRight) {
        // Success haptic on commit
        runOnJS(triggerHaptic)('success');
        runOnJS(handleSwipeRight)();
      } else if (swipedLeft) {
        // Success haptic on commit
        runOnJS(triggerHaptic)('success');
        runOnJS(handleSwipeLeft)();
      }

      // Spring back to center
      translateX.value = withSpring(0, {
        damping: 15,
        stiffness: 150,
      });
    })
    .onFinalize(() => {
      hasTriggeredHaptic.value = false;
    });

  // Animated style for the row slide
  const animatedRowStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  // Animated style for swipe indicator backgrounds
  const animatedLeftIndicatorStyle = useAnimatedStyle(() => {
    // Show green "Today" indicator when swiping right
    const opacity = translateX.value > 0 ? Math.min(translateX.value / SWIPE_THRESHOLD, 1) : 0;
    return {
      opacity,
    };
  });

  const animatedRightIndicatorStyle = useAnimatedStyle(() => {
    // Show gray "Done" indicator when swiping left
    const opacity = translateX.value < 0 ? Math.min(-translateX.value / SWIPE_THRESHOLD, 1) : 0;
    return {
      opacity,
    };
  });

  // Get background color based on staged action
  const getBackgroundColor = () => {
    switch (stagedAction) {
      case 'today':
        return BRAND.colors.sageMist + '40'; // Green tint with alpha
      case 'done':
        return BRAND.colors.inkMuted + '30'; // Gray tint with alpha
      case 'later':
        return BRAND.colors.goldenPear + '30'; // Amber tint with alpha
      default:
        return BRAND.colors.surface;
    }
  };

  // Get icon for staged action
  const renderStagedIcon = () => {
    switch (stagedAction) {
      case 'today':
        return <Check size={16} color={BRAND.colors.mossGreen} />;
      case 'done':
        return <X size={16} color={BRAND.colors.inkMuted} />;
      case 'later':
        return <Clock size={16} color={BRAND.colors.goldenPear} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container} testID={`mini-sweep-row-${todo.id}`}>
      {/* Swipe indicator backgrounds */}
      <Animated.View style={[styles.leftIndicator, animatedLeftIndicatorStyle]}>
        <Check size={20} color={BRAND.colors.surface} />
        <Text style={styles.indicatorText}>Today</Text>
      </Animated.View>
      <Animated.View style={[styles.rightIndicator, animatedRightIndicatorStyle]}>
        <Text style={styles.indicatorText}>Done</Text>
        <X size={20} color={BRAND.colors.surface} />
      </Animated.View>

      {/* Swipeable row content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[styles.rowContent, { backgroundColor: getBackgroundColor() }, animatedRowStyle]}
        >
          {/* Staged action icon */}
          {stagedAction && <View style={styles.stagedIcon}>{renderStagedIcon()}</View>}

          {/* Todo name */}
          <Text
            style={[styles.todoName, stagedAction === 'done' && styles.todoNameStrikethrough]}
            numberOfLines={2}
          >
            {todo.name}
          </Text>

          {/* Later button */}
          <Pressable
            style={[styles.laterButton, stagedAction === 'later' && styles.laterButtonActive]}
            onPress={() => onStageChange('later')}
            testID={`mini-sweep-later-${todo.id}`}
          >
            <Text
              style={[
                styles.laterButtonText,
                stagedAction === 'later' && styles.laterButtonTextActive,
              ]}
            >
              Later
            </Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },
  // Swipe indicator backgrounds
  leftIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 16,
    backgroundColor: BRAND.colors.mossGreen,
    gap: 8,
  },
  rightIndicator: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 16,
    backgroundColor: BRAND.colors.inkMuted,
    gap: 8,
  },
  indicatorText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.surface,
  },
  // Row content
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  stagedIcon: {
    marginRight: 8,
  },
  todoName: {
    flex: 1,
    fontSize: 14,
    color: BRAND.colors.charcoalInk,
    marginRight: 12,
  },
  todoNameStrikethrough: {
    textDecorationLine: 'line-through',
    color: BRAND.colors.inkMuted,
  },
  laterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BRAND.radius.sm,
    backgroundColor: BRAND.colors.linenCream,
    borderWidth: 1,
    borderColor: BRAND.colors.borderSubtle,
  },
  laterButtonActive: {
    backgroundColor: BRAND.colors.goldenPear + '40',
    borderColor: BRAND.colors.goldenPear,
  },
  laterButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.colors.inkSubtle,
  },
  laterButtonTextActive: {
    color: BRAND.colors.charcoalInk,
    fontWeight: '600',
  },
});

export default MiniSweepRow;
