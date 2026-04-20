/**
 * useMascotController Hook
 *
 * Thin adapter over the Zustand mascot store. Preserves the legacy API
 * for backward compatibility; actual state machine lives in
 * `lib/store/useMascotStore.ts`.
 *
 * Each action is individually memoized on `requestMode` (which is a stable
 * Zustand action reference), so downstream consumers get stable function
 * references across renders — matching the original controller's contract.
 */

import { useCallback } from 'react';
import type { AnimationMode } from '../lib/types';
import { useMascotStore } from '../lib/store/useMascotStore';

export interface MascotController {
  mode: AnimationMode;
  celebrate: () => void;
  celebrateFed: () => void;
  wave: () => void;
  fallAsleep: () => void;
  sleep: () => void;
  wakeUp: () => void;
  idle: () => void;
}

export function useMascotController(): MascotController {
  const mode = useMascotStore((s) => s.current);
  const requestMode = useMascotStore((s) => s.requestMode);

  const celebrate = useCallback(() => requestMode('drop'), [requestMode]);
  const celebrateFed = useCallback(() => requestMode('fed'), [requestMode]);
  const wave = useCallback(() => requestMode('waving'), [requestMode]);
  const fallAsleep = useCallback(() => requestMode('fallingAsleep'), [requestMode]);
  const sleep = useCallback(() => requestMode('sleeping', { force: true }), [requestMode]);
  const wakeUp = useCallback(() => requestMode('wakingUp'), [requestMode]);
  const idle = useCallback(() => requestMode('idle', { force: true }), [requestMode]);

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
