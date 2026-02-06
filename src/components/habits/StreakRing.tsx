/**
 * StreakRing – Animated SVG circular progress ring showing streak toward next milestone.
 *
 * Pure visual component — receives all data via props, no store access or side effects.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../ui';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BRAND } from '../../../design/brand';

// ─── Animated SVG primitive ──────────────────────────────────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Color tokens ────────────────────────────────────────────────────────────
const TRACK_GREEN = 'rgba(46,85,64,0.08)';
const TRACK_AMBER = 'rgba(199,158,95,0.08)';
const FILL_GREEN = BRAND.colors.mossGreen;
const FILL_AMBER = '#C79E5F';
const INK_MUTED = BRAND.colors.inkMuted;

// ─── Animation config ────────────────────────────────────────────────────────
const ANIMATION_DURATION = 1200;
const ANIMATION_EASING = Easing.bezier(0.22, 1, 0.36, 1);

// ─── Props ───────────────────────────────────────────────────────────────────
export interface StreakRingProps {
  /** Current streak count displayed in the center */
  count: number;
  /** Descriptive label below the count, e.g. "day streak" */
  label: string;
  /** Progress fraction 0‒1 toward next milestone */
  progress: number;
  /** Color theme */
  color: 'green' | 'amber';
  /** Ring diameter (default 116) */
  size?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function StreakRing({ count, label, progress, color, size = 116 }: StreakRingProps) {
  const isGreen = color === 'green';
  const trackColor = isGreen ? TRACK_GREEN : TRACK_AMBER;
  const fillColor = isGreen ? FILL_GREEN : FILL_AMBER;

  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  // Animate strokeDashoffset from full circumference → target offset
  const animatedOffset = useSharedValue(circumference);

  useEffect(() => {
    const targetOffset = circumference * (1 - clampedProgress);
    animatedOffset.value = withTiming(targetOffset, {
      duration: ANIMATION_DURATION,
      easing: ANIMATION_EASING,
    });
  }, [clampedProgress, circumference, animatedOffset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedOffset.value,
  }));

  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* SVG ring — rotated -90° so progress starts at 12 o'clock */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Track (background) circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
        />
      </Svg>

      {/* Center content — absolutely positioned over the SVG */}
      <View style={styles.centerContent}>
        <Text style={[styles.count, { color: fillColor }]}>{count}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  centerContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  count: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 0,
    lineHeight: 34,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: INK_MUTED,
    marginTop: 3,
  },
});
