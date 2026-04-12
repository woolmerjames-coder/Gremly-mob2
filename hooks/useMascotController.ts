/**
 * useMascotController Hook
 *
 * Unified mascot animation state machine.
 * Drives AnimationMode transitions with timeout-based auto-return.
 */

import { useState, useCallback, useRef } from 'react';
import type { AnimationMode } from '../lib/types';

export interface MascotController {
  mode: AnimationMode;
  /** Trigger the drop one-shot (≈800 ms auto-return) */
  celebrate: () => void;
  /** Trigger the fed one-shot (≈800 ms auto-return) */
  celebrateFed: () => void;
  /** Waving greeting (≈5 000 ms auto-return) */
  wave: () => void;
  /** Transition to fallingAsleep, then auto-advance to sleeping after 5 500 ms */
  fallAsleep: () => void;
  /** Jump straight to sleeping (no auto-return) */
  sleep: () => void;
  /** Wake up animation (≈5 500 ms auto-return to idle) */
  wakeUp: () => void;
  /** Return to idle immediately */
  idle: () => void;
}

export function useMascotController(): MascotController {
  const [mode, setMode] = useState<AnimationMode>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearExistingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /** Set mode with optional auto-transition (defaults to 'idle' if no `next` given). */
  const setModeWithTimeout = useCallback(
    (next: AnimationMode, duration?: number, after: AnimationMode = 'idle') => {
      clearExistingTimeout();
      setMode(next);

      if (duration) {
        timeoutRef.current = setTimeout(() => {
          setMode(after);
          timeoutRef.current = null;
        }, duration);
      }
    },
    [clearExistingTimeout],
  );

  const celebrate = useCallback(() => {
    setModeWithTimeout('drop', 800);
  }, [setModeWithTimeout]);

  const celebrateFed = useCallback(() => {
    setModeWithTimeout('fed', 800);
  }, [setModeWithTimeout]);

  const wave = useCallback(() => {
    setModeWithTimeout('waving', 5000);
  }, [setModeWithTimeout]);

  const fallAsleep = useCallback(() => {
    // fallingAsleep → auto-advance to sleeping after 5 500 ms
    setModeWithTimeout('fallingAsleep', 5500, 'sleeping');
  }, [setModeWithTimeout]);

  const sleep = useCallback(() => {
    clearExistingTimeout();
    setMode('sleeping');
  }, [clearExistingTimeout]);

  const wakeUp = useCallback(() => {
    setModeWithTimeout('wakingUp', 5500);
  }, [setModeWithTimeout]);

  const idle = useCallback(() => {
    clearExistingTimeout();
    setMode('idle');
  }, [clearExistingTimeout]);

  return {
    mode,
    celebrate,
    celebrateFed,
    wave,
    fallAsleep,
    sleep,
    wakeUp,
    idle,
  };
}
