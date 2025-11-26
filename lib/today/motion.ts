/**
 * Motion utilities for Today v2 screen
 * Phase 9: Energy & Momentum
 * All animations respect reduced motion preferences
 */

import { Animated, Easing } from 'react-native';

/**
 * Fade in and slide up animation
 */
export function fadeInUp(
  animatedValue: Animated.Value,
  reducedMotion: boolean = false,
  delay: number = 0,
): void {
  if (reducedMotion) {
    // Instant transition for reduced motion
    animatedValue.setValue(1);
    return;
  }

  Animated.timing(animatedValue, {
    toValue: 1,
    duration: 300,
    delay,
    easing: Easing.out(Easing.ease),
    useNativeDriver: true,
  }).start();
}

/**
 * Pop/scale animation for completion feedback
 */
export function pop(animatedValue: Animated.Value, reducedMotion: boolean = false): void {
  if (reducedMotion) {
    // No animation for reduced motion
    return;
  }

  Animated.sequence([
    Animated.timing(animatedValue, {
      toValue: 1.1,
      duration: 150,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }),
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 150,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }),
  ]).start();
}

/**
 * Collapse animation config
 */
export function collapseConfig(reducedMotion: boolean = false) {
  return {
    duration: reducedMotion ? 0 : 250,
    easing: Easing.out(Easing.ease),
    useNativeDriver: false, // height animations can't use native driver
  };
}

/**
 * Expand animation config
 */
export function expandConfig(reducedMotion: boolean = false) {
  return {
    duration: reducedMotion ? 0 : 250,
    easing: Easing.out(Easing.ease),
    useNativeDriver: false, // height animations can't use native driver
  };
}

/**
 * Subtle pulse animation for suggestions
 * Returns the animation object so it can be stopped on cleanup
 */
export function pulse(
  animatedValue: Animated.Value,
  reducedMotion: boolean = false,
): Animated.CompositeAnimation | null {
  if (reducedMotion) {
    // No animation for reduced motion
    animatedValue.setValue(1);
    return null;
  }

  const animation = Animated.loop(
    Animated.sequence([
      Animated.timing(animatedValue, {
        toValue: 1.05,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]),
  );

  animation.start();
  return animation;
}

/**
 * Gentle pulse animation for emphasis (limited cycles)
 * Used for Sweep bar or urgent indicators
 */
export function gentlePulse(
  animatedValue: Animated.Value,
  cycles: number = 3,
  reducedMotion: boolean = false,
): void {
  if (reducedMotion) {
    animatedValue.setValue(1);
    return;
  }

  // Pulse 1.0 → 1.04 → 1.0 for specified cycles
  Animated.loop(
    Animated.sequence([
      Animated.timing(animatedValue, {
        toValue: 1.04,
        duration: 800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 800,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]),
    { iterations: cycles },
  ).start();
}

/**
 * Fade and slide expansion animation
 * Used for vault expansion, sections appearing
 */
export function fadeSlideIn(
  opacity: Animated.Value,
  translateY: Animated.Value,
  reducedMotion: boolean = false,
): void {
  if (reducedMotion) {
    opacity.setValue(1);
    translateY.setValue(0);
    return;
  }

  opacity.setValue(0);
  translateY.setValue(20);

  Animated.parallel([
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }),
    Animated.timing(translateY, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }),
  ]).start();
}

/**
 * Fade and slide collapse animation
 * Used for vault collapse, sections disappearing
 */
export function fadeSlideOut(
  opacity: Animated.Value,
  translateY: Animated.Value,
  reducedMotion: boolean = false,
  onComplete?: () => void,
): void {
  if (reducedMotion) {
    opacity.setValue(0);
    translateY.setValue(20);
    onComplete?.();
    return;
  }

  Animated.parallel([
    Animated.timing(opacity, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }),
    Animated.timing(translateY, {
      toValue: 20,
      duration: 150,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }),
  ]).start(onComplete);
}
