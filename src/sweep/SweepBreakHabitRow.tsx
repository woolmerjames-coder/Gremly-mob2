/**
 * SweepBreakHabitRow - Circular "shield" interaction for break habits
 *
 * Features:
 * - User taps and holds to fill a circle over ~1.5 seconds
 * - Fill animation rises from bottom like water filling a glass
 * - Gremly avatar scales up as progress increases
 * - Release before complete drains the fill back down
 * - Completion triggers haptic feedback and confirmation message
 * - Shows "Last: X days ago" for tracking resistance streak
 */

import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  interpolateColor,
  Extrapolation,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { Icon } from '../../design-system/Icon';
import { Flame, RefreshCw, Calendar, Shield } from 'lucide-react-native';
import { useSweepHabitGesture } from '../habits/useSweepHabitGesture';
import { formatLastCompletedAt } from '../../lib/sweep/habitHelpers';

// Gremly avatar for the center of the circle
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_AVATAR = require('../../assets/buttonforHP.png');

// Circle dimensions
const CIRCLE_SIZE = 100;
const GREMLY_SIZE = 40;
const FILL_DURATION = 1500; // 1.5 seconds to fill

export interface SweepBreakHabitRowProps {
  id: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly';

  // Days successfully resisted (streak)
  streakDays?: number;

  // For weekly/monthly habits: progress toward target
  completedThisPeriod?: number;
  targetPerPeriod?: number;

  // True if habit has met/exceeded target for the period
  isAheadOfTarget?: boolean;

  // Frequency display text
  frequencyLabel: string;

  // Last time user completed (resisted) this habit - ISO date
  lastCompletedAt?: string | null;

  // Is this habit visually completed? (controlled by parent)
  isCompleted: boolean;

  // Toggle callback - notifies parent of state change
  onToggle: (id: string, completed: boolean) => void;

  // Show divider below?
  showDivider?: boolean;
}

export function SweepBreakHabitRow({
  id,
  name,
  cadence,
  streakDays,
  completedThisPeriod = 0,
  targetPerPeriod = 1,
  isAheadOfTarget = false,
  frequencyLabel,
  lastCompletedAt,
  isCompleted,
  onToggle,
  showDivider = true,
}: SweepBreakHabitRowProps) {
  // Use shared gesture hook
  const {
    progress,
    confirmMessage,
    isCompletedState,
    triggerHaptic,
    handleComplete,
    handleUncomplete,
    resetProgress,
    confirmTextAnimatedStyle,
    checkAnimatedStyle,
  } = useSweepHabitGesture({
    id,
    isCompleted,
    onToggle,
    isAheadOfTarget,
    isBreakHabit: true,
  });

  // Start filling animation
  const startFilling = useCallback(() => {
    'worklet';
    if (isCompletedState.value) return;

    // Animate progress from current value to 1 over FILL_DURATION
    progress.value = withTiming(
      1,
      { duration: FILL_DURATION * (1 - progress.value) },
      (finished) => {
        if (finished && progress.value >= 1) {
          runOnJS(handleComplete)();
        }
      },
    );
  }, [progress, isCompletedState, handleComplete]);

  // Stop filling and drain back
  const stopFilling = useCallback(() => {
    'worklet';
    if (isCompletedState.value) return;

    // Cancel current animation
    cancelAnimation(progress);

    // Only drain if not complete
    if (progress.value < 1) {
      progress.value = withSpring(0, {
        damping: 15,
        stiffness: 300,
      });
    }
  }, [progress, isCompletedState]);

  // Handle tap on completed habit to uncomplete
  const handleTapCompleted = useCallback(() => {
    if (isCompletedState.value) {
      handleUncomplete();
      resetProgress();
    }
  }, [isCompletedState, handleUncomplete, resetProgress]);

  // Long press gesture for filling
  const longPressGesture = Gesture.LongPress()
    .minDuration(50) // Start almost immediately
    .maxDistance(100) // Allow some movement
    .onBegin(() => {
      'worklet';
      if (!isCompletedState.value) {
        runOnJS(triggerHaptic)('light');
        startFilling();
      }
    })
    .onFinalize(() => {
      'worklet';
      stopFilling();
    });

  // Animated style for circle fill (rising from bottom)
  const animatedFillStyle = useAnimatedStyle(() => {
    const fillHeight = interpolate(progress.value, [0, 1], [0, CIRCLE_SIZE], Extrapolation.CLAMP);

    const backgroundColor = interpolateColor(
      progress.value,
      [0, 0.5, 1],
      [
        'rgba(191, 216, 192, 0.4)', // Light sage at start
        'rgba(157, 195, 160, 0.7)', // Getting greener
        BRAND.colors.mossGreen, // Full mossGreen
      ],
    );

    return {
      height: fillHeight,
      backgroundColor,
    };
  });

  // Animated style for Gremly scale
  const animatedGremlyStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 0.5, 1], [1, 1.05, 1.1], Extrapolation.CLAMP);

    return {
      transform: [{ scale }],
    };
  });

  // Build metadata display
  const metadataDisplay = useMemo(() => {
    if (cadence === 'daily' && streakDays !== undefined && streakDays > 0) {
      return { iconType: 'flame' as const, text: `${streakDays}`, isStreak: true, isAhead: false };
    } else if (cadence === 'weekly') {
      return {
        iconType: 'refresh' as const,
        text: `${completedThisPeriod}/${targetPerPeriod}`,
        isStreak: false,
        isAhead: isAheadOfTarget,
      };
    } else if (cadence === 'monthly') {
      return {
        iconType: 'calendar' as const,
        text: `${completedThisPeriod}/${targetPerPeriod}`,
        isStreak: false,
        isAhead: isAheadOfTarget,
      };
    }
    return null;
  }, [cadence, streakDays, completedThisPeriod, targetPerPeriod, isAheadOfTarget]);

  // "Last: X days ago" text - uses DateService for timezone-safe calculation
  const lastCompletedText = formatLastCompletedAt(lastCompletedAt);

  return (
    <View style={[styles.container, showDivider && styles.withDivider]}>
      {/* Shield Circle Container */}
      <View style={styles.circleContainer}>
        {/* Circle with fill */}
        <GestureDetector gesture={longPressGesture}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleTapCompleted}
            style={styles.circleTouchable}
          >
            <View style={styles.circle}>
              {/* Fill layer (rises from bottom) */}
              <Animated.View style={[styles.circleFill, animatedFillStyle]} />

              {/* Shield icon watermark (behind Gremly) */}
              <View style={styles.shieldWatermark}>
                <Shield size={48} color="rgba(46, 85, 64, 0.1)" strokeWidth={1.5} />
              </View>

              {/* Gremly avatar */}
              <Animated.View style={[styles.gremlyContainer, animatedGremlyStyle]}>
                <Image source={GREMLY_AVATAR} style={styles.gremlyImage} resizeMode="contain" />
              </Animated.View>

              {/* Success checkmark overlay */}
              <Animated.View style={[styles.successCheck, checkAnimatedStyle]}>
                <Icon name="Check" size="md" color="#FFFFFF" strokeWidth={3} />
              </Animated.View>
            </View>
          </TouchableOpacity>
        </GestureDetector>

        {/* Confirmation message below circle */}
        <Animated.View style={[styles.confirmTextContainer, confirmTextAnimatedStyle]}>
          <Text style={styles.confirmText}>{confirmMessage}</Text>
        </Animated.View>

        {/* Hold hint (shown when not completed) */}
        {!isCompleted && <Text style={styles.holdHint}>Hold to mark</Text>}
      </View>

      {/* Habit Info Row */}
      <View style={styles.infoRow}>
        <View style={styles.nameContainer}>
          <Text style={styles.habitName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.frequencyLabel}>{frequencyLabel}</Text>
          {lastCompletedText && <Text style={styles.lastCompletedText}>{lastCompletedText}</Text>}
        </View>

        {/* Metadata (streak or progress) */}
        {metadataDisplay && (
          <View style={styles.metadataContainer}>
            {metadataDisplay.isAhead && (
              <View style={styles.aheadBadge}>
                <Shield size={14} color={BRAND.colors.goldenPear} />
                <Text style={styles.aheadBadgeText}>Strong</Text>
              </View>
            )}
            {metadataDisplay.iconType === 'flame' && (
              <Flame size={12} color={BRAND.colors.goldenPear} strokeWidth={2.5} />
            )}
            {metadataDisplay.iconType === 'refresh' && (
              <RefreshCw
                size={12}
                color={metadataDisplay.isAhead ? BRAND.colors.goldenPear : BRAND.colors.mossGreen}
                strokeWidth={2.5}
              />
            )}
            {metadataDisplay.iconType === 'calendar' && (
              <Calendar
                size={12}
                color={metadataDisplay.isAhead ? BRAND.colors.goldenPear : BRAND.colors.mossGreen}
                strokeWidth={2.5}
              />
            )}
            <Text
              style={[
                styles.metadataText,
                (metadataDisplay.isStreak || metadataDisplay.isAhead) && styles.metadataStreak,
              ]}
            >
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

  // Circle styles
  circleContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  circleTouchable: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(191, 216, 192, 0.6)',
    backgroundColor: 'rgba(191, 216, 192, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circleFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: CIRCLE_SIZE / 2,
  },
  shieldWatermark: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
  gremlyContainer: {
    width: GREMLY_SIZE,
    height: GREMLY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  gremlyImage: {
    width: GREMLY_SIZE,
    height: GREMLY_SIZE,
    borderRadius: GREMLY_SIZE / 2,
  },
  successCheck: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(46, 85, 64, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  confirmTextContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.colors.mossGreen,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  holdHint: {
    marginTop: 6,
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    letterSpacing: 0.5,
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
  lastCompletedText: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
    fontStyle: 'italic',
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
  aheadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  aheadBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.goldenPear,
  },
});

export default SweepBreakHabitRow;
