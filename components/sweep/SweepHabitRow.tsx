/**
 * SweepHabitRow - Swipe-to-complete habit row for Evening Sweep
 *
 * Features:
 * - Gremly avatar slides left → right on track
 * - Snaps to complete at 80% threshold
 * - Haptic feedback + bounce animation on completion
 * - Displays streak (daily) or progress (weekly/monthly)
 * - No card background - uses divider lines
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  interpolateColor,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { Icon } from '../../design-system/Icon';
import { Flame, RefreshCw, Calendar } from 'lucide-react-native';

// Gremly avatar for the slider
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_AVATAR = require('../../assets/buttonforHP.png');

// Track dimensions
const TRACK_WIDTH = 280;
const TRACK_HEIGHT = 44;
const GREMLY_SIZE = 40;
const COMPLETE_THRESHOLD = 0.75; // 75% of track = complete
const SNAP_THRESHOLD = 0.5; // 50% = will snap to complete on release

// Confirmation messages - shown when habit is completed
const CONFIRM_MESSAGES = [
  'BOOM',
  'Smashed it',
  'Another one',
  'Done',
  'Nailed it',
  'Got it',
  'Crushed it',
];

export interface SweepHabitRowProps {
  id: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly';

  // For daily habits: streak count
  streakDays?: number;

  // For weekly/monthly habits: progress toward target
  completedThisPeriod?: number;
  targetPerPeriod?: number;

  // Frequency display text (e.g., "Every day", "3x per week")
  frequencyLabel: string;

  // Is this habit visually completed? (controlled by parent)
  isCompleted: boolean;

  // Toggle callback - notifies parent of state change (doesn't commit to DB)
  onToggle: (id: string, completed: boolean) => void;

  // Show divider below?
  showDivider?: boolean;
}

export function SweepHabitRow({
  id,
  name,
  cadence,
  streakDays,
  completedThisPeriod = 0,
  targetPerPeriod = 1,
  frequencyLabel,
  isCompleted,
  onToggle,
  showDivider = true,
}: SweepHabitRowProps) {
  // Calculate the max drag distance (track width minus gremly size)
  const maxDrag = TRACK_WIDTH - GREMLY_SIZE - 8; // 8px padding

  // Shared value for drag position
  const translateX = useSharedValue(isCompleted ? maxDrag : 0);
  const hasTriggeredHaptic = useSharedValue(false);
  const isCompletedState = useSharedValue(isCompleted);

  // Confirmation animation
  const confirmTextOpacity = useSharedValue(0);
  const confirmTextScale = useSharedValue(0.8);
  const checkScale = useSharedValue(0);

  // Random confirmation message
  const [confirmMessage, setConfirmMessage] = useState('');

  // Update position if isCompleted prop changes
  React.useEffect(() => {
    translateX.value = withSpring(isCompleted ? maxDrag : 0, {
      damping: 20,
      stiffness: 300,
    });
    isCompletedState.value = isCompleted;
  }, [isCompleted, maxDrag, translateX, isCompletedState]);

  // Haptic feedback
  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'success') => {
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Handle toggle - updates visuals and notifies parent
  const handleToggle = useCallback(
    (completed: boolean) => {
      if (completed) {
        // Completing - show confirmation
        triggerHaptic('success');

        const msg = CONFIRM_MESSAGES[Math.floor(Math.random() * CONFIRM_MESSAGES.length)];
        setConfirmMessage(msg);

        confirmTextOpacity.value = 0;
        confirmTextScale.value = 0.8;
        confirmTextOpacity.value = withTiming(1, { duration: 200 });
        confirmTextScale.value = withSpring(1, { damping: 12, stiffness: 200 });

        checkScale.value = 0;
        checkScale.value = withSpring(1, { damping: 10, stiffness: 300 });
      } else {
        // Uncompleting - hide confirmation
        triggerHaptic('light');

        confirmTextOpacity.value = withTiming(0, { duration: 150 });
        checkScale.value = withTiming(0, { duration: 150 });
        setConfirmMessage('');
      }

      onToggle(id, completed);
    },
    [id, onToggle, triggerHaptic, confirmTextOpacity, confirmTextScale, checkScale],
  );

  // Pan gesture for dragging Gremly
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Calculate new position
      const newX = Math.max(
        0,
        Math.min(maxDrag, event.translationX + (isCompletedState.value ? maxDrag : 0)),
      );
      translateX.value = newX;

      // Trigger haptic at threshold (once)
      const progress = newX / maxDrag;
      if (progress >= COMPLETE_THRESHOLD && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerHaptic)('medium');
      } else if (progress < COMPLETE_THRESHOLD) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((event) => {
      const progress = translateX.value / maxDrag;

      if (progress >= SNAP_THRESHOLD) {
        // Snap to complete
        translateX.value = withSpring(maxDrag, {
          damping: 15,
          stiffness: 400,
          overshootClamping: false,
        });
        if (!isCompletedState.value) {
          isCompletedState.value = true;
          runOnJS(handleToggle)(true);
        }
      } else {
        // Snap back to start
        translateX.value = withSpring(0, {
          damping: 15,
          stiffness: 400,
        });
        if (isCompletedState.value) {
          isCompletedState.value = false;
          runOnJS(handleToggle)(false);
        }
      }
      hasTriggeredHaptic.value = false;
    });

  // Animated style for Gremly position
  const animatedGremlyStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  // Animated style for track fill (shows progress)
  const animatedTrackFillStyle = useAnimatedStyle(() => {
    const fillWidth = translateX.value + GREMLY_SIZE / 2;
    const backgroundColor = interpolateColor(
      translateX.value,
      [0, maxDrag * 0.5, maxDrag * 0.8, maxDrag],
      [
        'rgba(191, 216, 192, 0.4)', // Light sage at start
        'rgba(157, 195, 160, 0.6)', // Getting greener
        'rgba(95, 145, 100, 0.8)', // Rich green
        '#2E5540', // Full Moss Green
      ],
    );
    return {
      width: fillWidth,
      backgroundColor,
    };
  });

  // Confirmation text animation
  const animatedConfirmTextStyle = useAnimatedStyle(() => ({
    opacity: confirmTextOpacity.value,
    transform: [{ scale: confirmTextScale.value }],
  }));

  // Checkmark animation
  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  // Animated style for Gremly scale (bounces at threshold)
  const animatedGremlyScaleStyle = useAnimatedStyle(() => {
    const progress = translateX.value / maxDrag;
    const scale = interpolate(
      progress,
      [0, COMPLETE_THRESHOLD - 0.1, COMPLETE_THRESHOLD, 1],
      [1, 1, 1.15, 1.1],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ scale }],
    };
  });

  // Build metadata string
  const metadataDisplay = useMemo(() => {
    if (cadence === 'daily' && streakDays !== undefined && streakDays > 0) {
      return { iconType: 'flame' as const, text: `${streakDays}`, isStreak: true };
    } else if (cadence === 'weekly') {
      return {
        iconType: 'refresh' as const,
        text: `${completedThisPeriod}/${targetPerPeriod}`,
        isStreak: false,
      };
    } else if (cadence === 'monthly') {
      return {
        iconType: 'calendar' as const,
        text: `${completedThisPeriod}/${targetPerPeriod}`,
        isStreak: false,
      };
    }
    return null;
  }, [cadence, streakDays, completedThisPeriod, targetPerPeriod]);

  return (
    <View style={[styles.container, showDivider && styles.withDivider]}>
      {/* Slider Track */}
      <View style={styles.trackContainer}>
        <View style={styles.track}>
          {/* Fill indicator */}
          <Animated.View style={[styles.trackFill, animatedTrackFillStyle]} />

          {/* Confirmation text - appears in filled green area */}
          <Animated.View style={[styles.confirmTextContainer, animatedConfirmTextStyle]}>
            <Text style={styles.confirmText}>{confirmMessage}</Text>
          </Animated.View>

          {/* Success checkmark at end */}
          <Animated.View style={[styles.successCheck, animatedCheckStyle]}>
            <Icon name="Check" size="sm" color="#FFFFFF" strokeWidth={3} />
          </Animated.View>

          {/* Gremly avatar (draggable) */}
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.gremlyContainer, animatedGremlyStyle]}>
              <Animated.View style={animatedGremlyScaleStyle}>
                <Image source={GREMLY_AVATAR} style={styles.gremlyImage} resizeMode="contain" />
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        </View>
      </View>

      {/* Habit Info Row */}
      <View style={styles.infoRow}>
        <View style={styles.nameContainer}>
          <Text style={styles.habitName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.frequencyLabel}>{frequencyLabel}</Text>
        </View>

        {/* Metadata (streak or progress) */}
        {metadataDisplay && (
          <View style={styles.metadataContainer}>
            {metadataDisplay.iconType === 'flame' && (
              <Flame size={12} color={BRAND.colors.goldenPear} strokeWidth={2.5} />
            )}
            {metadataDisplay.iconType === 'refresh' && (
              <RefreshCw size={12} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            )}
            {metadataDisplay.iconType === 'calendar' && (
              <Calendar size={12} color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            )}
            <Text style={[styles.metadataText, metadataDisplay.isStreak && styles.metadataStreak]}>
              {metadataDisplay.text}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  withDivider: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.borderSubtle,
  },

  // Track styles
  trackContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    backgroundColor: 'rgba(191, 216, 192, 0.2)',
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: TRACK_HEIGHT / 2,
  },
  confirmTextContainer: {
    position: 'absolute',
    left: 16,
    right: 56,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.colors.linenCream,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  successCheck: {
    position: 'absolute',
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gremlyContainer: {
    position: 'absolute',
    left: 4,
    width: GREMLY_SIZE,
    height: GREMLY_SIZE,
  },
  gremlyImage: {
    width: GREMLY_SIZE,
    height: GREMLY_SIZE,
    borderRadius: GREMLY_SIZE / 2,
  },

  // Info row styles
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
  },
  nameContainer: {
    flex: 1,
    marginRight: 12,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND.colors.charcoalInk,
    marginBottom: 2,
  },
  frequencyLabel: {
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  metadataContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  metadataText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  metadataStreak: {
    color: BRAND.colors.goldenPear,
  },
});

export default SweepHabitRow;
