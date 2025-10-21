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
