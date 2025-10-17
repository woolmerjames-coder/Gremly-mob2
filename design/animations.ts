/**
 * Animation Helpers - Phase 7
 *
 * Reanimated v3 animation presets for consistent motion across the app.
 * All animations respect reduced motion accessibility settings.
 */

import {
  useReducedMotion as useReanimatedReducedMotion,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  Easing,
  type WithTimingConfig,
  type WithSpringConfig,
} from 'react-native-reanimated';

// ============================================================================
// ACCESSIBILITY - Reduced Motion
// ============================================================================

/**
 * Hook to check if user has enabled reduced motion in system settings
 */
export function useReducedMotion(): boolean {
  return useReanimatedReducedMotion();
}

// ============================================================================
// TIMING CONFIGS
// ============================================================================

/**
 * Standard easing curve for most animations
 * Cubic bezier: ease-out
 */
export const EASING = {
  standard: Easing.bezier(0.4, 0.0, 0.2, 1),
  emphasized: Easing.bezier(0.0, 0.0, 0.2, 1),
  decelerate: Easing.bezier(0.0, 0.0, 0.2, 1),
  accelerate: Easing.bezier(0.4, 0.0, 1, 1),
};

/**
 * Standard durations (in milliseconds)
 */
export const DURATION = {
  fast: 100,
  normal: 200,
  slow: 300,
  verySlow: 500,
};

/**
 * Standard delays for staggered animations
 */
export const DELAY = {
  none: 0,
  short: 15,
  medium: 50,
  long: 100,
};

// ============================================================================
// TIMING PRESETS
// ============================================================================

export const timingConfig = {
  fast: {
    duration: DURATION.fast,
    easing: EASING.standard,
  } satisfies WithTimingConfig,

  normal: {
    duration: DURATION.normal,
    easing: EASING.standard,
  } satisfies WithTimingConfig,

  slow: {
    duration: DURATION.slow,
    easing: EASING.standard,
  } satisfies WithTimingConfig,

  emphasized: {
    duration: DURATION.normal,
    easing: EASING.emphasized,
  } satisfies WithTimingConfig,
};

export const springConfig = {
  gentle: {
    damping: 20,
    stiffness: 90,
  } satisfies WithSpringConfig,

  bouncy: {
    damping: 10,
    stiffness: 100,
  } satisfies WithSpringConfig,

  snappy: {
    damping: 15,
    stiffness: 150,
  } satisfies WithSpringConfig,
};

// ============================================================================
// ANIMATION FACTORIES
// ============================================================================

/**
 * Fade in animation
 * @param delay - Optional delay in ms
 * @returns Animation config for opacity 0 → 1
 */
export function fadeIn(delay = 0) {
  return withDelay(delay, withTiming(1, timingConfig.normal));
}

/**
 * Fade out animation
 * @param delay - Optional delay in ms
 * @returns Animation config for opacity 1 → 0
 */
export function fadeOut(delay = 0) {
  return withDelay(delay, withTiming(0, timingConfig.normal));
}

/**
 * Slide up animation (translateY)
 * Note: Use this in combination with initial translateY value
 * @param _from - Starting Y position (unused, kept for API consistency)
 * @param delay - Optional delay in ms
 * @returns Animation config for translateY → 0
 */
export function slideUp(_from = 20, delay = 0) {
  return withDelay(delay, withTiming(0, timingConfig.normal));
}

/**
 * Slide down animation (translateY)
 * @param to - Ending Y position (default: 20)
 * @param delay - Optional delay in ms
 * @returns Animation config for translateY 0 → to
 */
export function slideDown(to = 20, delay = 0) {
  return withDelay(delay, withTiming(to, timingConfig.normal));
}

/**
 * Pop animation (scale with spring)
 * @param delay - Optional delay in ms
 * @returns Animation config for scale 0.9 → 1 with bounce
 */
export function pop(delay = 0) {
  return withDelay(delay, withSpring(1, springConfig.bouncy));
}

/**
 * Pulse animation (scale sequence)
 * @param scaleTo - Peak scale value (default: 1.05)
 * @param delay - Optional delay in ms
 * @returns Animation config for scale 1 → scaleTo → 1
 */
export function pulse(scaleTo = 1.05, delay = 0) {
  return withDelay(
    delay,
    withSequence(
      withTiming(scaleTo, { duration: DURATION.fast, easing: EASING.standard }),
      withTiming(1, { duration: DURATION.fast, easing: EASING.standard }),
    ),
  );
}

/**
 * Press animation (scale down)
 * Used for button press feedback
 * @returns Animation config for scale 1 → 0.98
 */
export function pressDown() {
  return withTiming(0.98, { duration: DURATION.fast, easing: EASING.standard });
}

/**
 * Press release animation (scale up)
 * Used for button release feedback
 * @returns Animation config for scale 0.98 → 1
 */
export function pressUp() {
  return withSpring(1, springConfig.snappy);
}

/**
 * Shake animation (translateX sequence)
 * Used for error feedback
 * @returns Animation config for shake motion
 */
export function shake() {
  return withSequence(
    withTiming(-10, { duration: 50, easing: EASING.standard }),
    withTiming(10, { duration: 50, easing: EASING.standard }),
    withTiming(-10, { duration: 50, easing: EASING.standard }),
    withTiming(0, { duration: 50, easing: EASING.standard }),
  );
}

/**
 * Success checkmark animation
 * Scale up with slight overshoot
 * @returns Animation config for success feedback
 */
export function successPop() {
  return withSequence(
    withTiming(1.2, { duration: DURATION.fast, easing: EASING.emphasized }),
    withSpring(1, springConfig.bouncy),
  );
}

/**
 * Rotation animation
 * @param degrees - Rotation angle in degrees
 * @param delay - Optional delay in ms
 * @returns Animation config for rotation
 */
export function rotate(degrees: number, delay = 0) {
  return withDelay(delay, withTiming(degrees, timingConfig.normal));
}

// ============================================================================
// STAGGER HELPERS
// ============================================================================

/**
 * Calculate stagger delay for list items
 * @param index - Item index in list
 * @param baseDelay - Base delay per item (default: 15ms)
 * @param maxDelay - Maximum total delay (default: 300ms)
 * @returns Calculated delay in ms
 */
export function staggerDelay(index: number, baseDelay = DELAY.short, maxDelay = 300): number {
  return Math.min(index * baseDelay, maxDelay);
}

// ============================================================================
// CONDITIONAL ANIMATION
// ============================================================================

/**
 * Returns animation if reduced motion is disabled, otherwise returns immediate value
 * @param animation - Animation to conditionally apply
 * @param immediateValue - Value to use when reduced motion is enabled
 * @param isReducedMotion - Whether reduced motion is enabled
 * @returns Animation or immediate value
 */
export function conditionalAnimation<T>(
  animation: T,
  immediateValue: number,
  isReducedMotion: boolean,
): T | number {
  return isReducedMotion ? immediateValue : animation;
}
