import type { AnimationMode } from '../types';

/** Modes that loop and can always be interrupted. */
export const LOOPING_MODES: ReadonlySet<AnimationMode> = new Set(['idle', 'sleeping']);

/**
 * Per-mode preempt matrix: which incoming modes are allowed to interrupt
 * the currently-playing mode.
 *
 * Design: one-shot animations should play to completion so transitions feel
 * intentional rather than jolty. The sole exception is `fallingAsleep` being
 * preempted by `wakingUp` — when the user taps during the fall-asleep
 * animation, they want the mascot awake *now*, not in 5 seconds.
 *
 * Loops (idle, sleeping) are universally interruptible; that's handled by
 * LOOPING_MODES in canPreempt(), not here.
 */
export const PREEMPT_MATRIX: Record<AnimationMode, ReadonlySet<AnimationMode>> = {
  idle: new Set(), // handled by LOOPING_MODES
  sleeping: new Set(), // handled by LOOPING_MODES
  waving: new Set(),
  fallingAsleep: new Set(['wakingUp']),
  wakingUp: new Set(),
  drop: new Set(),
  fed: new Set(),
};

/**
 * Auto-return target after a one-shot animation finishes.
 * Any mode not listed defaults to 'idle'.
 */
export const AFTER_FINISH: Partial<Record<AnimationMode, AnimationMode>> = {
  fallingAsleep: 'sleeping',
};

/**
 * Maximum expected animation duration per mode, in ms, including a 500ms
 * safety buffer. Used as a fallback in case onAnimationFinish fails to fire
 * (known Lottie issue on backgrounding). Undefined = no safety timer needed
 * (looping modes).
 */
export const MAX_DURATION_MS: Partial<Record<AnimationMode, number>> = {
  waving: 5500,
  fallingAsleep: 6000,
  wakingUp: 6000,
  drop: 1500,
  fed: 2500, // 2× replay
};

/** Is the mode a one-shot (has a defined end) vs a loop? */
export function isOneShot(mode: AnimationMode): boolean {
  return !LOOPING_MODES.has(mode);
}

/** Can `next` preempt `current`? */
export function canPreempt(current: AnimationMode, next: AnimationMode): boolean {
  if (LOOPING_MODES.has(current)) return true;
  return PREEMPT_MATRIX[current].has(next);
}
