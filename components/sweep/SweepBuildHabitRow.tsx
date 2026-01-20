/**
 * SweepBuildHabitRow - Swipe-to-complete habit row for build habits in Evening Sweep
 *
 * Features:
 * - Gremly avatar slides left → right on track
 * - Snaps to complete at 75% threshold
 * - Haptic feedback + bounce animation on completion
 * - Displays streak (daily) or progress (weekly/monthly)
 * - Shows "Last: X days ago" for tracking
 * - No card background - uses divider lines
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  interpolateColor,
  Extrapolation,
} from 'react-native-reanimated';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';
import { Icon } from '../../design-system/Icon';
import { Flame, RefreshCw, Calendar, Trophy } from 'lucide-react-native';
import { useSweepHabitGesture } from '../../src/habits/useSweepHabitGesture';

// Gremly avatar for the slider
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_AVATAR = require('../../assets/buttonforHP.png');

// Track dimensions
const TRACK_WIDTH = 280;
const TRACK_HEIGHT = 44;
const GREMLY_SIZE = 40;
const COMPLETE_THRESHOLD = 0.75; // 75% of track = complete
const SNAP_THRESHOLD = 0.5; // 50% = will snap to complete on release

export interface SweepBuildHabitRowProps {
  id: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'monthly';

  // For daily habits: streak count
  streakDays?: number;

  // For weekly/monthly habits: progress toward target
  completedThisPeriod?: number;
  targetPerPeriod?: number;

  // True if habit has met/exceeded target for the period (weekly/monthly)
  isAheadOfTarget?: boolean;

  // Frequency display text (e.g., "Every day", "3x per week")
  frequencyLabel: string;

  // Last time user completed this habit - ISO date
  lastCompletedAt?: string | null;

  // Is this habit visually completed? (controlled by parent)
  isCompleted: boolean;

  // Toggle callback - notifies parent of state change (doesn't commit to DB)
  onToggle: (id: string, completed: boolean) => void;

  // Show divider below?
  showDivider?: boolean;
}

/**
 * Calculate "X days ago" from an ISO date string
 */
function getDaysAgoText(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;

  try {
    const date = new Date(isoDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Last: today';
    if (diffDays === 1) return 'Last: yesterday';
    return `Last: ${diffDays} days ago`;
  } catch {
    return null;
  }
}

export function SweepBuildHabitRow({
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
}: SweepBuildHabitRowProps) {
  // Calculate the max drag distance (track width minus gremly size)
  const maxDrag = TRACK_WIDTH - GREMLY_SIZE - 8; // 8px padding

  // Use shared gesture hook
  const {
    confirmMessage,
    isCompletedState,
    triggerHaptic,
    handleComplete,
    handleUncomplete,
    confirmTextAnimatedStyle,
    checkAnimatedStyle,
  } = useSweepHabitGesture({
    id,
    isCompleted,
    onToggle,
    isAheadOfTarget,
    isBreakHabit: false,
  });

  // Shared value for drag position (maps to progress 0-1)
  const translateX = useSharedValue(isCompleted ? maxDrag : 0);
  const hasTriggeredHaptic = useSharedValue(false);

  // Update position if isCompleted prop changes
  React.useEffect(() => {
    translateX.value = withSpring(isCompleted ? maxDrag : 0, {
      damping: 20,
      stiffness: 300,
    });
  }, [isCompleted, maxDrag, translateX]);

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
    .onEnd(() => {
      const progress = translateX.value / maxDrag;

      if (progress >= SNAP_THRESHOLD) {
        // Snap to complete
        translateX.value = withSpring(maxDrag, {
          damping: 15,
          stiffness: 400,
          overshootClamping: false,
        });
        if (!isCompletedState.value) {
          runOnJS(handleComplete)();
        }
      } else {
        // Snap back to start
        translateX.value = withSpring(0, {
          damping: 15,
          stiffness: 400,
        });
        if (isCompletedState.value) {
          runOnJS(handleUncomplete)();
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

  // "Last: X days ago" text
  const lastCompletedText = getDaysAgoText(lastCompletedAt);

  return (
    <View style={[styles.container, showDivider && styles.withDivider]}>
      {/* Slider Track */}
      <View style={styles.trackContainer}>
        <View style={styles.track}>
          {/* Fill indicator */}
          <Animated.View style={[styles.trackFill, animatedTrackFillStyle]} />

          {/* Confirmation text - appears in filled green area */}
          <Animated.View style={[styles.confirmTextContainer, confirmTextAnimatedStyle]}>
            <Text style={styles.confirmText}>{confirmMessage}</Text>
          </Animated.View>

          {/* Success checkmark at end */}
          <Animated.View style={[styles.successCheck, checkAnimatedStyle]}>
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
          {lastCompletedText && <Text style={styles.lastCompletedText}>{lastCompletedText}</Text>}
        </View>

        {/* Metadata (streak or progress) */}
        {metadataDisplay && (
          <View style={styles.metadataContainer}>
            {metadataDisplay.isAhead && (
              <View style={styles.aheadBadge}>
                <Trophy size={14} color={BRAND.colors.goldenPear} />
                <Text style={styles.aheadBadgeText}>Ahead</Text>
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
  lastCompletedText: {
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
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
    backgroundColor: 'rgba(212, 175, 55, 0.15)', // goldenPear at 15% opacity
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

export default SweepBuildHabitRow;
