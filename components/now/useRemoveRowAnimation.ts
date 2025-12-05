/**
 * useRemoveRowAnimation - Reusable hook for row removal animation
 *
 * Provides a smooth removal animation for rows:
 * 1. Row elevates slightly (translateY -2px)
 * 2. Row fades out (opacity 1 → 0 over 150-200ms)
 * 3. Row height collapses smoothly to 0
 * 4. Callback fires after animation completes
 *
 * This hook is used by RecentDropsSection for the "+ Today" action.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../design/animations';
import { triggerLight } from '../../lib/haptics';

// Animation timing constants (in ms)
export const REMOVE_TIMING = {
  ELEVATE: 100, // Step 1: Row lifts up
  FADE_OUT: 175, // Step 2: Row fades out
  COLLAPSE: 250, // Step 3: Row height collapses
};

export type RemoveAnimationPhase = 'idle' | 'elevating' | 'fading' | 'collapsing' | 'done';

export interface UseRemoveRowAnimationOptions {
  /** Initial row height for collapse animation */
  initialHeight?: number;
  /** Callback when animation completes and item should be removed */
  onRemove?: () => void;
}

export interface UseRemoveRowAnimationReturn {
  // State
  animationPhase: RemoveAnimationPhase;
  isAnimating: boolean;
  isDone: boolean;

  // Handlers
  animateAndRemove: () => void;
  handleLayout: (event: { nativeEvent: { layout: { height: number } } }) => void;

  // Animated styles
  rowAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  contentAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useRemoveRowAnimation(
  options: UseRemoveRowAnimationOptions = {},
): UseRemoveRowAnimationReturn {
  const { initialHeight = 44, onRemove } = options;
  const reducedMotion = useReducedMotion();

  // Animation state
  const [animationPhase, setAnimationPhase] = useState<RemoveAnimationPhase>('idle');
  const [measuredHeight, setMeasuredHeight] = useState(initialHeight);

  // Ref for managing timeout
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared values for animations
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rowHeight = useSharedValue(measuredHeight);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
    };
  }, []);

  // Handle animation completion
  const handleAnimationDone = useCallback(() => {
    setAnimationPhase('done');
    onRemove?.();
  }, [onRemove]);

  // Trigger the removal animation
  const animateAndRemove = useCallback(() => {
    // Prevent double-triggering
    if (animationPhase !== 'idle') {
      return;
    }

    // Haptic feedback
    void triggerLight();

    // For reduced motion, skip animation
    if (reducedMotion) {
      handleAnimationDone();
      return;
    }

    setAnimationPhase('elevating');

    // Step 1: Elevate (lift up slightly) - 100ms
    // eslint-disable-next-line react-hooks/immutability
    translateY.value = withTiming(-2, {
      duration: REMOVE_TIMING.ELEVATE,
      easing: Easing.out(Easing.ease),
    });

    // Step 2: Fade out - starts after elevate, 175ms
    // Use withSequence to chain: hold during elevate, then fade
    // eslint-disable-next-line react-hooks/immutability
    opacity.value = withSequence(
      withTiming(1, { duration: REMOVE_TIMING.ELEVATE }), // Hold during elevate
      withTiming(0, {
        duration: REMOVE_TIMING.FADE_OUT,
        easing: Easing.out(Easing.ease),
      }),
    );

    // After fade completes, start collapse
    animationTimeoutRef.current = setTimeout(() => {
      setAnimationPhase('collapsing');

      // Step 3: Collapse row height - 250ms
      // eslint-disable-next-line react-hooks/immutability
      rowHeight.value = withTiming(
        0,
        {
          duration: REMOVE_TIMING.COLLAPSE,
          easing: Easing.inOut(Easing.ease),
        },
        () => {
          runOnJS(handleAnimationDone)();
        },
      );
    }, REMOVE_TIMING.ELEVATE + REMOVE_TIMING.FADE_OUT);
  }, [animationPhase, reducedMotion, translateY, opacity, rowHeight, handleAnimationDone]);

  // Animated style for the row wrapper (controls height/overflow)
  const rowAnimatedStyle = useAnimatedStyle(() => ({
    height: rowHeight.value,
    overflow: 'hidden' as const,
  }));

  // Animated style for the content (controls translateY and opacity)
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Handle layout measurement for accurate collapse animation
  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const { height } = event.nativeEvent.layout;
      if (animationPhase === 'idle' && height > 0) {
        setMeasuredHeight(height);
        // eslint-disable-next-line react-hooks/immutability
        rowHeight.value = height;
      }
    },
    [animationPhase, rowHeight],
  );

  return {
    // State
    animationPhase,
    isAnimating: animationPhase !== 'idle' && animationPhase !== 'done',
    isDone: animationPhase === 'done',

    // Handlers
    animateAndRemove,
    handleLayout,

    // Animated styles
    rowAnimatedStyle,
    contentAnimatedStyle,
  };
}
