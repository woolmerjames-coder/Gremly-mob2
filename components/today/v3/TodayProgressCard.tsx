/**
 * TodayProgressCard - Tappable card containing a progress ring with labels
 *
 * Design:
 * - Light card background (linen cream)
 * - Progress ring at top
 * - Primary label below ring (e.g., "Today" or "Habits")
 * - Secondary label with chevron on same line
 *
 * Used for both the Today progress card and the Habits progress card
 * in the NowHeader.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import { Icon } from '../../../design-system/Icon';
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

export type TodayProgressCardProps = {
  /** Progress as a fraction (0-1) */
  progress: number;
  /** Text to display in the center of the ring (e.g., "75%" or "3/5") */
  centerText: string;
  /** Primary label below the ring (e.g., "Today" or "Habits") */
  label: string;
  /** Secondary label with count/status (e.g., "2 of 5 done" or "On track") */
  sublabel: string;
  /** Color for the progress arc */
  progressColor?: string;
  /** Color for the sublabel text */
  sublabelColor?: string;
  /** Trigger pulse animation when hitting 100% */
  shouldPulse?: boolean;
  /** Handler when card is pressed */
  onPress?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GAUGE_SIZE = 72;
const STROKE_WIDTH = 9; // Thicker for better visual weight and readability

// Animation timing (ms)
const MOUNT_ANIMATION_DURATION = 300;
const UPDATE_ANIMATION_DURATION = 250;
const PULSE_DURATION = 250;

// ¾ ring = 270° arc
const ARC_DEGREES = 270;
const START_ANGLE = 135;

const MOSS_GREEN = BRAND.colors.mossGreen;
// Darker track color for better contrast between filled and empty
const TRACK_COLOR = 'rgba(0, 0, 0, 0.15)';
const INK_CHARCOAL = BRAND.colors.charcoalInk;
const INK_SUBTLE = BRAND.colors.inkSubtle;
const CARD_BG = '#F7F5F0'; // Linen-like background

// Create animated circle component
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Gentle easing curve
const EASE_OUT_CUBIC = Easing.out(Easing.cubic);

// Minimum progress threshold to show the colored arc
// Below this, we hide the arc to avoid a tiny green blob from rounded caps
const MIN_VISIBLE_PROGRESS = 0.01;

// ─────────────────────────────────────────────────────────────────────────────
// ArcGauge Component (internal)
// ─────────────────────────────────────────────────────────────────────────────

type ArcGaugeProps = {
  size: number;
  strokeWidth: number;
  progress: number;
  progressColor: string;
  trackColor: string;
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
  const fullCircumference = 2 * Math.PI * radius;
  const arcCircumference = fullCircumference * (ARC_DEGREES / 360);
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const isMountedRef = useRef(false);
  const animatedProgress = useSharedValue(0);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    const duration = isMountedRef.current ? UPDATE_ANIMATION_DURATION : MOUNT_ANIMATION_DURATION;

    animatedProgress.value = withTiming(clampedProgress, {
      duration,
      easing: EASE_OUT_CUBIC,
    });

    isMountedRef.current = true;
  }, [clampedProgress, animatedProgress]);

  useEffect(() => {
    if (shouldPulse) {
      pulseScale.value = withSequence(
        withTiming(1.06, { duration: PULSE_DURATION / 2, easing: EASE_OUT_CUBIC }),
        withTiming(1, { duration: PULSE_DURATION / 2, easing: EASE_OUT_CUBIC }),
      );
    }
  }, [shouldPulse, pulseScale]);

  // Animated props for the progress arc
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

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const trackDasharray = `${arcCircumference} ${fullCircumference - arcCircumference}`;

  return (
    <Animated.View style={[{ width: size, height: size }, pulseStyle]}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: `${START_ANGLE}deg` }] }}>
        {/* Background track - uses butt linecap for clean ends */}
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
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function TodayProgressCard({
  progress,
  centerText,
  label,
  sublabel,
  progressColor = MOSS_GREEN,
  sublabelColor = INK_SUBTLE,
  shouldPulse = false,
  onPress,
}: TodayProgressCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${sublabel}`}
    >
      {/* Progress ring with center text */}
      <View style={styles.gaugeWrapper}>
        <ArcGauge
          size={GAUGE_SIZE}
          strokeWidth={STROKE_WIDTH}
          progress={progress}
          progressColor={progressColor}
          trackColor={TRACK_COLOR}
          shouldPulse={shouldPulse}
        />
        <View style={styles.centerTextContainer}>
          <Text style={styles.centerText}>{centerText}</Text>
        </View>
      </View>

      {/* Primary label */}
      <Text style={styles.label}>{label}</Text>

      {/* Secondary label row with chevron */}
      <View style={styles.sublabelRow}>
        <Text style={[styles.sublabel, { color: sublabelColor }]} numberOfLines={1}>
          {sublabel}
        </Text>
        <Icon name="ChevronRight" size="sm" color={INK_SUBTLE} />
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    // Subtle elevation for depth - matches other cards in the app
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
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
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Bold',
    color: INK_CHARCOAL,
  },
  label: {
    marginTop: 6,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: INK_CHARCOAL,
  },
  sublabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 2,
  },
  sublabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: INK_SUBTLE,
  },
});

export default TodayProgressCard;
