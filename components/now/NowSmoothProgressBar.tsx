/**
 * NowSmoothProgressBar - Smooth continuous progress bar for NOW screen
 *
 * Dopamine Sequence (total ~600-700ms from tap):
 * 1. Tap checkbox → card strikes through immediately
 * 2. After ~150ms: dot fills to "done" color with scale 0.9→1.1→1.0 + glow
 * 3. After ~300ms (150ms after dot): bar animates oldPercent→newPercent over 300ms
 * 4. If hitting 100%: shimmer runs after bar settles (~800ms effect)
 *
 * Features:
 * - Single continuous fill bar (Moss Green) with smooth animation
 * - Percentage label animates in sync with bar
 * - Row of dots underneath (one per item, wraps to multiple lines)
 * - Dopamine animation on dots for just-completed items
 * - Shimmer effect when reaching 100%
 */

import React, { useEffect, useMemo, useRef, memo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import { Text } from '../../ui';
import { BRAND } from '../../design/brand';

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

/** Item for progress dots */
export type NowProgressDotItem = {
  id: string;
  type: 'todo' | 'habit';
  done: boolean;
};

type NowSmoothProgressBarProps = {
  /** Progress as a fraction (0-1) */
  progress: number;
  /** Items for dot row */
  items?: NowProgressDotItem[];
  /** IDs of items just completed (for glow effect) */
  justCompletedIds?: Set<string>;
  /** Optional press handler */
  onPress?: () => void;
};

// ───────────────────────────────────────────────────────────────────────────────
// Constants - Animation Timing
// ───────────────────────────────────────────────────────────────────────────────

// Dopamine sequence timing (all in ms)
const DOT_ANIMATION_DELAY = 150; // Delay before dot animation starts
const DOT_SCALE_DURATION = 250; // Duration of dot scale animation
const BAR_ANIMATION_DELAY = 300; // Delay before bar starts (after tap, not after dot)
const BAR_ANIMATION_DURATION = 300; // Duration of bar fill animation
const SHIMMER_DELAY = 100; // Extra delay after bar settles before shimmer
const SHIMMER_DURATION = 600; // Duration of shimmer sweep

// Visual constants
const DOT_SIZE = 10;
const DOT_GAP = 6;
const GLOW_SIZE = 16;

const MOSS_GREEN = BRAND.colors.mossGreen;
const SAGE_MIST = BRAND.colors.sageMist;
const NEUTRAL_GREY = '#D4D4D4';

// ───────────────────────────────────────────────────────────────────────────────
// CompletionDot - Individual dot with dopamine animation
// ───────────────────────────────────────────────────────────────────────────────

type CompletionDotProps = {
  isDone: boolean;
  isJustCompleted: boolean;
};

const CompletionDot = memo(function CompletionDot({ isDone, isJustCompleted }: CompletionDotProps) {
  // Track previous "just completed" state to detect transitions
  const wasJustCompletedRef = useRef(false);

  // Animation values
  const dotScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.8);
  const dotColorProgress = useSharedValue(isDone ? 1 : 0);

  useEffect(() => {
    // Only animate if transitioning from not-just-completed to just-completed
    const shouldAnimate = isJustCompleted && !wasJustCompletedRef.current;
    wasJustCompletedRef.current = isJustCompleted;

    if (shouldAnimate) {
      // Dopamine sequence for dot:
      // 1. After DOT_ANIMATION_DELAY, start the animation
      // 2. Scale: 0.9 → 1.1 → 1.0
      // 3. Color: grey → green (if not already done)
      // 4. Glow: fade in, pulse, then fade out

      // Dot scale animation: 0.9 → 1.1 → 1.0
      dotScale.value = withDelay(
        DOT_ANIMATION_DELAY,
        withSequence(
          withTiming(0.9, { duration: 50 }),
          withTiming(1.15, { duration: 150, easing: Easing.out(Easing.back(1.5)) }),
          withTiming(1.0, { duration: 100, easing: Easing.out(Easing.ease) }),
        ),
      );

      // Dot color fill (grey → green)
      dotColorProgress.value = withDelay(
        DOT_ANIMATION_DELAY,
        withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) }),
      );

      // Glow animation: fade in with scale, hold, then fade out
      glowOpacity.value = withDelay(
        DOT_ANIMATION_DELAY,
        withSequence(
          withTiming(0.8, { duration: 150, easing: Easing.out(Easing.ease) }),
          withTiming(0.6, { duration: 300 }), // Hold
          withTiming(0, { duration: 400, easing: Easing.in(Easing.ease) }),
        ),
      );

      glowScale.value = withDelay(
        DOT_ANIMATION_DELAY,
        withSequence(
          withTiming(1.2, { duration: 150, easing: Easing.out(Easing.back(1.2)) }),
          withTiming(1.0, { duration: 200 }),
          withTiming(0.8, { duration: 500 }),
        ),
      );
    } else if (!isJustCompleted && wasJustCompletedRef.current) {
      // If we're no longer "just completed", ensure glow is off
      glowOpacity.value = withTiming(0, { duration: 200 });
      glowScale.value = withTiming(0.8, { duration: 200 });
    }

    // Sync color state with isDone prop (for non-animated state changes)
    if (!shouldAnimate) {
      dotColorProgress.value = isDone ? 1 : 0;
    }
  }, [isJustCompleted, isDone, dotScale, dotColorProgress, glowOpacity, glowScale]);

  // Animated styles
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    backgroundColor: dotColorProgress.value > 0.5 ? MOSS_GREEN : NEUTRAL_GREY,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <View style={styles.dotContainer}>
      <Animated.View style={[styles.dotGlow, glowStyle]} />
      <Animated.View style={[styles.dot, dotStyle]} />
    </View>
  );
});

// ───────────────────────────────────────────────────────────────────────────────
// NowSmoothProgressBar - Main component
// ───────────────────────────────────────────────────────────────────────────────

export function NowSmoothProgressBar({
  progress,
  items = [],
  justCompletedIds,
  onPress,
}: NowSmoothProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const targetPercent = Math.round(clamped * 100);

  // Track previous progress for detecting 100% crossings
  const prevProgressRef = useRef(clamped);
  const hasShimmeredRef = useRef(false);

  // Animated progress value (drives bar width)
  const animatedProgress = useSharedValue(clamped);

  // Shimmer animation state
  const shimmerPosition = useSharedValue(-1);

  // Animated percent for label (derived from animatedProgress)
  const animatedPercent = useDerivedValue(() => {
    return Math.round(animatedProgress.value * 100);
  });

  // Animate bar fill when progress changes
  useEffect(() => {
    const wasComplete = prevProgressRef.current >= 1;
    const isNowComplete = clamped >= 1;
    const progressIncreased = clamped > prevProgressRef.current;

    // Only delay bar animation if progress increased (completion happened)
    // If progress decreased (undo), animate immediately
    if (progressIncreased) {
      // Delayed bar animation - starts after dot animation begins
      animatedProgress.value = withDelay(
        BAR_ANIMATION_DELAY,
        withTiming(clamped, {
          duration: BAR_ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
        }),
      );
    } else {
      // Immediate animation for undo/reset
      animatedProgress.value = withTiming(clamped, {
        duration: 200,
        easing: Easing.out(Easing.ease),
      });
    }

    // Trigger shimmer only when progress first reaches 100%
    if (isNowComplete && !wasComplete && !hasShimmeredRef.current && progressIncreased) {
      hasShimmeredRef.current = true;

      // Shimmer starts after bar animation completes
      const shimmerStartDelay = BAR_ANIMATION_DELAY + BAR_ANIMATION_DURATION + SHIMMER_DELAY;

      shimmerPosition.value = withDelay(
        shimmerStartDelay,
        withSequence(
          withTiming(2, { duration: SHIMMER_DURATION, easing: Easing.inOut(Easing.ease) }),
          withTiming(-1, { duration: 0 }), // Reset position
        ),
      );
    }

    // Reset shimmer flag when progress drops below 100%
    if (!isNowComplete) {
      hasShimmeredRef.current = false;
    }

    prevProgressRef.current = clamped;
  }, [clamped, animatedProgress, shimmerPosition]);

  // Animated style for bar fill width
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.round(animatedProgress.value * 100)}%` as `${number}%`,
  }));

  // Animated style for shimmer overlay
  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shimmerPosition.value, [-1, 0, 1, 2], [-60, 0, 100, 160]);
    const opacity = interpolate(shimmerPosition.value, [-1, 0, 0.5, 1, 2], [0, 0.4, 0.7, 0.4, 0]);
    return {
      transform: [{ translateX }],
      opacity,
    };
  });

  // Prepare data
  const justCompletedSet = useMemo(() => justCompletedIds ?? new Set<string>(), [justCompletedIds]);
  const showDots = items.length > 0;

  // console.log('[NowSmoothProgressBar] percent, dots:', { targetPercent, dots: items.length });

  const content = (
    <View style={styles.wrapper}>
      {/* Progress bar row */}
      <View style={styles.barRow}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]}>
            {/* Shimmer overlay - sweeps across the bar at 100% */}
            <Animated.View style={[styles.shimmer, shimmerStyle]} />
          </Animated.View>
        </View>
        {/* Percentage label - shows target immediately for simplicity */}
        <Text style={styles.label}>{targetPercent}%</Text>
      </View>

      {/* Dots row - tighter spacing to feel like one system with bar */}
      {showDots && (
        <View style={styles.dotsContainer}>
          {items.map((item) => (
            <CompletionDot
              key={item.id}
              isDone={item.done}
              isJustCompleted={justCompletedSet.has(item.id)}
            />
          ))}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="View progress">
        {content}
      </Pressable>
    );
  }

  return content;
}

// ───────────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: NEUTRAL_GREY,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: MOSS_GREEN,
    borderRadius: 999,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    transform: [{ skewX: '-20deg' }],
  },
  label: {
    marginLeft: 8,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: BRAND.colors.inkSubtle,
    minWidth: 32, // Prevent layout shift
    textAlign: 'right',
  },
  // Dots container - tighter vertical spacing to unify with bar
  dotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 4, // Reduced from 6 for tighter coupling with bar
    marginBottom: 2,
    gap: DOT_GAP,
  },
  // Individual dot container
  dotContainer: {
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotGlow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: SAGE_MIST,
  },
});
