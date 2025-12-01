/**
 * TodayProgressGauges - Two ¾-ring progress gauges for Today and Habits
 *
 * Layout:
 * - Left gauge: Today's Focus progress (percentage in center)
 * - Right gauge: Weekly habits progress (fraction in center)
 *
 * Uses react-native-svg for the arc rendering with animated fill.
 *
 * Animation behavior:
 * - On mount: arcs animate from 0 → current value over ~300ms, ease-out
 * - On prop changes: arcs animate from previous → new value over ~250ms, ease-out
 * - On 100% completion: subtle "breath" pulse (scale 1→1.06→1 over 250ms)
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { BRAND } from '../../../design/brand';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WeeklyStatusLabel = 'On track' | 'Needs attention' | 'Off track';

export type TodayProgressGaugesProps = {
  /** Number of completed items for today */
  todayDone: number;
  /** Total items scheduled for today */
  todayTotal: number;
  /** Total habit completions this week */
  weeklyCompleted: number;
  /** Total expected habit completions for the week */
  weeklyTarget: number;
  /** Status label for habits gauge */
  weeklyStatusLabel?: WeeklyStatusLabel;
  /** Handler when Today gauge is pressed */
  onPressToday?: () => void;
  /** Handler when Habits gauge is pressed */
  onPressHabits?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GAUGE_SIZE = 88;
const STROKE_WIDTH = 9; // Thicker for better visual weight and readability

// Animation timing (ms)
const MOUNT_ANIMATION_DURATION = 300; // Initial mount animation
const UPDATE_ANIMATION_DURATION = 250; // Subsequent updates
const PULSE_DURATION = 250; // Completion celebration

// ¾ ring = 270° arc
// We rotate the arc to open at the bottom
const ARC_DEGREES = 270;
const START_ANGLE = 135; // Start from bottom-left

const MOSS_GREEN = BRAND.colors.mossGreen;
const GOLDEN_PEAR = BRAND.colors.goldenPear;
// Darker track color for better contrast between filled and empty
const TRACK_COLOR = 'rgba(0, 0, 0, 0.15)';
const INK_CHARCOAL = BRAND.colors.charcoalInk;
const INK_SUBTLE = BRAND.colors.inkSubtle;

// Create animated circle component
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Gentle easing curve for calm animations
const EASE_OUT_CUBIC = Easing.out(Easing.cubic);

// Minimum progress threshold to show the colored arc
// Below this, we hide the arc to avoid a tiny green blob from rounded caps
const MIN_VISIBLE_PROGRESS = 0.01;

// ─────────────────────────────────────────────────────────────────────────────
// ArcGauge Component
// ─────────────────────────────────────────────────────────────────────────────

type ArcGaugeProps = {
  size: number;
  strokeWidth: number;
  progress: number; // 0-1
  progressColor: string;
  trackColor: string;
  /** Trigger pulse when true and progress just hit 100% */
  shouldPulse?: boolean;
};

function ArcGauge({
  size,
  strokeWidth,
  progress,
  progressColor,
  trackColor,
  shouldPulse = false,
}: ArcGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Circumference of full circle
  const fullCircumference = 2 * Math.PI * radius;

  // Arc circumference (270° = 3/4 of full circle)
  const arcCircumference = fullCircumference * (ARC_DEGREES / 360);

  // Clamp progress to [0, 1] to prevent overshooting
  const clampedProgress = Math.max(0, Math.min(1, progress));

  // Track if this is the initial mount
  const isMountedRef = useRef(false);

  // Animated progress value - persists across renders
  const animatedProgress = useSharedValue(0);

  // Pulse animation value for 100% celebration
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    const duration = isMountedRef.current ? UPDATE_ANIMATION_DURATION : MOUNT_ANIMATION_DURATION;

    animatedProgress.value = withTiming(clampedProgress, {
      duration,
      easing: EASE_OUT_CUBIC,
    });

    isMountedRef.current = true;
  }, [clampedProgress, animatedProgress]);

  // Handle pulse animation when hitting 100%
  useEffect(() => {
    if (shouldPulse) {
      // Subtle "breath" pulse: 1 → 1.06 → 1
      pulseScale.value = withSequence(
        withTiming(1.06, { duration: PULSE_DURATION / 2, easing: EASE_OUT_CUBIC }),
        withTiming(1, { duration: PULSE_DURATION / 2, easing: EASE_OUT_CUBIC }),
      );
    }
  }, [shouldPulse, pulseScale]);

  // Animated props for the progress arc stroke
  // Hides the arc when progress is too small to avoid a tiny green blob
  const animatedProps = useAnimatedProps(() => {
    const prog = animatedProgress.value;
    // Hide arc completely when progress is below threshold
    if (prog < MIN_VISIBLE_PROGRESS) {
      return {
        strokeDasharray: [0, fullCircumference] as [number, number],
        opacity: 0,
      };
    }
    const filledLength = arcCircumference * prog;
    const gapLength = fullCircumference - filledLength;
    return {
      strokeDasharray: [filledLength, gapLength] as [number, number],
      opacity: 1,
    };
  });

  // Animated style for pulse effect - scales the entire gauge wrapper
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Track arc (background) - static
  const trackDasharray = `${arcCircumference} ${fullCircumference - arcCircumference}`;

  return (
    <Animated.View style={[{ width: size, height: size }, pulseStyle]}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: `${START_ANGLE}deg` }] }}>
        {/* Background track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeDasharray={trackDasharray}
          strokeLinecap="round"
          fill="transparent"
        />
        {/* Progress arc - only visible when progress > 0 */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          animatedProps={animatedProps}
        />
      </Svg>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GaugeWithLabel Component
// ─────────────────────────────────────────────────────────────────────────────

type GaugeWithLabelProps = {
  progress: number;
  progressColor: string;
  centerText: string;
  label: string;
  sublabel: string;
  sublabelColor?: string;
  /** Trigger pulse animation when hitting 100% */
  shouldPulse?: boolean;
  onPress?: () => void;
};

function GaugeWithLabel({
  progress,
  progressColor,
  centerText,
  label,
  sublabel,
  sublabelColor = INK_SUBTLE,
  shouldPulse = false,
}: GaugeWithLabelProps) {
  return (
    <View style={styles.gaugeContainer}>
      {/* Gauge ring */}
      <View style={styles.gaugeWrapper}>
        <ArcGauge
          size={GAUGE_SIZE}
          strokeWidth={STROKE_WIDTH}
          progress={progress}
          progressColor={progressColor}
          trackColor={TRACK_COLOR}
          shouldPulse={shouldPulse}
        />
        {/* Center text overlay */}
        <View style={styles.centerTextContainer}>
          <Text style={styles.centerText}>{centerText}</Text>
        </View>
      </View>

      {/* Labels below gauge */}
      <Text style={styles.gaugeLabel}>{label}</Text>
      <Text
        style={[styles.gaugeSublabel, { color: sublabelColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {sublabel}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function TodayProgressGauges({
  todayDone,
  todayTotal,
  weeklyCompleted,
  weeklyTarget,
  weeklyStatusLabel = 'On track',
  onPressToday,
  onPressHabits,
}: TodayProgressGaugesProps) {
  // Calculate Today progress (clamped to [0, 1])
  const todayProgress = todayTotal > 0 ? Math.min(1, Math.max(0, todayDone / todayTotal)) : 0;
  const todayPercent = Math.round(todayProgress * 100);

  // Calculate Habits progress (clamped to [0, 1])
  const habitsProgress =
    weeklyTarget > 0 ? Math.min(1, Math.max(0, weeklyCompleted / weeklyTarget)) : 0;

  // Simplified pulse: trigger on 100% completion
  // The ArcGauge handles the animated fill, so we just pass whether we're complete
  const shouldPulseToday = todayProgress >= 1;
  const shouldPulseHabits = habitsProgress >= 1;

  // Build center text for today
  const todayCenterText = `${todayPercent}%`;

  // Build center text for habits (fraction)
  const habitsCenterText = `${weeklyCompleted}/${weeklyTarget}`;

  // Build sublabel for today
  const todaySublabel =
    todayTotal === 0 ? 'Nothing scheduled' : `${todayDone} of ${todayTotal} done`;

  // Determine status color for habits
  let statusColor: string = MOSS_GREEN;
  if (weeklyStatusLabel === 'Needs attention') {
    statusColor = GOLDEN_PEAR;
  } else if (weeklyStatusLabel === 'Off track') {
    statusColor = GOLDEN_PEAR; // Using golden pear for gentler alert
  }

  return (
    <View style={styles.container}>
      {/* Today Gauge */}
      <GaugeWithLabel
        progress={todayProgress}
        progressColor={MOSS_GREEN}
        centerText={todayCenterText}
        label="Today"
        sublabel={todaySublabel}
        shouldPulse={shouldPulseToday}
        onPress={onPressToday}
      />

      {/* Habits Gauge */}
      <GaugeWithLabel
        progress={habitsProgress}
        progressColor={MOSS_GREEN}
        centerText={habitsCenterText}
        label="Habits"
        sublabel={weeklyStatusLabel}
        sublabelColor={statusColor}
        shouldPulse={shouldPulseHabits}
        onPress={onPressHabits}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  gaugeContainer: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 120, // Prevent gauges from stretching too wide
  },
  gaugeWrapper: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerText: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: INK_CHARCOAL,
  },
  gaugeLabel: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: INK_CHARCOAL,
  },
  gaugeSublabel: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: INK_SUBTLE,
    textAlign: 'center',
    minHeight: 16, // Consistent height even if text wraps
  },
});

export default TodayProgressGauges;
