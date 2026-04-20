/**
 * useMascotLifecycle Hook
 *
 * Orchestrates high-level mascot behavioral states: sleep/wake cycle,
 * idle waving, and inactivity detection. This is the ONLY place that
 * calls fallAsleep/sleep/wakeUp/wave on the controller.
 *
 * Call once at the app root level and pass the returned `mode` to MascotLottie.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { AnimationMode } from '../lib/types';
import { useMascotController } from './useMascotController';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { getDateService } from '../lib/date';

// ─── Constants ───────────────────────────────────────────────────────────────

const INACTIVITY_TIMEOUT_MS = 90_000; // 90 seconds
const SLEEP_WINDOW_CHECK_MS = 60_000; // check once per minute
const WAVE_MIN_MS = 45_000; // min idle before random wave
const WAVE_MAX_MS = 75_000; // max idle before random wave
const WAKE_ANIMATION_MS = 5_500;
const WAKE_TO_WAVE_PAUSE_MS = 1_000;

function randomWaveDelay(): number {
  return WAVE_MIN_MS + Math.random() * (WAVE_MAX_MS - WAVE_MIN_MS);
}

const SLEEP_DURATION_HOURS = 6;

/** Is the current hour inside the [dayBoundaryHour, dayBoundaryHour+6) sleep window? */
function isInSleepWindow(hour: number, dayBoundaryHour: number): boolean {
  const sleepStart = dayBoundaryHour;
  const sleepEnd = (dayBoundaryHour + SLEEP_DURATION_HOURS) % 24;
  if (sleepStart === sleepEnd) return false;
  if (sleepStart < sleepEnd) {
    return hour >= sleepStart && hour < sleepEnd;
  }
  return hour >= sleepStart || hour < sleepEnd;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface MascotLifecycle {
  mode: AnimationMode;
  /** Call on any user interaction to reset the inactivity timer. */
  resetInactivity: () => void;
}

export function useMascotLifecycle(): MascotLifecycle {
  const controller = useMascotController();
  // Destructure stable function refs (each is a useCallback with stable deps)
  const { mode, wave, fallAsleep, sleep: goSleep, wakeUp, idle } = controller;
  const modeRef = useRef<AnimationMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Store selectors
  const dayBoundaryHour = useGremlyStore((s) => s.dayBoundaryHour);
  const lastActiveDate = useGremlyStore((s) => s.lastActiveDate);

  // Timer refs
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const waveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sleepWindowIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sequenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Clear helpers ───────────────────────────────────────────────────────

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const clearWaveTimer = useCallback(() => {
    if (waveTimerRef.current) {
      clearTimeout(waveTimerRef.current);
      waveTimerRef.current = null;
    }
  }, []);

  const clearSequenceTimer = useCallback(() => {
    if (sequenceTimerRef.current) {
      clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
  }, []);

  // ─── Idle wave rotation ──────────────────────────────────────────────────

  const startWaveTimer = useCallback(() => {
    clearWaveTimer();
    waveTimerRef.current = setTimeout(() => {
      waveTimerRef.current = null;
      if (modeRef.current === 'idle') {
        wave(); // 5s auto-return to idle via controller
      }
      // Timer not restarted here; the mode-change effect restarts it when idle resumes
    }, randomWaveDelay());
  }, [wave, clearWaveTimer]);

  // ─── Sequences ────────────────────────────────────────────────────────────

  /** First open of day: wakeUp → pause → wave → idle */
  const playMorningSequence = useCallback(() => {
    wakeUp(); // 5.5s animation → auto-returns to idle
    clearSequenceTimer();
    sequenceTimerRef.current = setTimeout(() => {
      idle(); // brief pause at idle
      sequenceTimerRef.current = setTimeout(() => {
        wave(); // 5s animation, auto-returns to idle via controller
        sequenceTimerRef.current = null;
      }, WAKE_TO_WAVE_PAUSE_MS);
    }, WAKE_ANIMATION_MS);
  }, [wakeUp, idle, wave, clearSequenceTimer]);

  /** Subsequent opens: wave → idle */
  const playReturnSequence = useCallback(() => {
    wave();
  }, [wave]);

  // ─── Inactivity ──────────────────────────────────────────────────────────

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      if (modeRef.current === 'idle' || modeRef.current === 'waving') {
        fallAsleep(); // fallingAsleep → sleeping via controller timeout
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [fallAsleep, clearInactivityTimer]);

  const resetInactivity = useCallback(() => {
    const currentMode = modeRef.current;
    const today = getDateService().today();
    const isFirstOpenToday = lastActiveDate !== today;

    if (currentMode === 'sleeping') {
      // Update active date on first intentional interaction
      useGremlyStore.setState({ lastActiveDate: today });

      if (isFirstOpenToday) {
        playMorningSequence(); // wake → pause → wave → idle
      } else {
        wakeUp(); // just wake, no wave
      }
    } else if (currentMode === 'fallingAsleep') {
      idle(); // cancel the falling asleep
    }

    startInactivityTimer();
  }, [wakeUp, idle, playMorningSequence, startInactivityTimer, lastActiveDate]);

  // ─── App foreground / background ─────────────────────────────────────────

  const handleAppOpen = useCallback(() => {
    const currentHour = getDateService().getHour();
    const today = getDateService().today();
    const inSleepWindow = isInSleepWindow(currentHour, dayBoundaryHour);
    const isFirstOpenToday = lastActiveDate !== today;

    if (inSleepWindow || isFirstOpenToday) {
      // Show sleeping — wait for intentional interaction to wake
      goSleep();
      return;
    }

    // Outside sleep window, already opened today — just wave
    playReturnSequence();
    startInactivityTimer();
  }, [dayBoundaryHour, lastActiveDate, goSleep, playReturnSequence, startInactivityTimer]);

  // ─── AppState listener ───────────────────────────────────────────────────

  useEffect(() => {
    // Run once on mount (initial app open)
    handleAppOpen();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        handleAppOpen();
      } else if (nextState === 'background' || nextState === 'inactive') {
        clearInactivityTimer();
        clearWaveTimer();
        clearSequenceTimer();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [handleAppOpen, clearInactivityTimer, clearWaveTimer, clearSequenceTimer]);

  // ─── Sleep window boundary check ────────────────────────────────────────

  useEffect(() => {
    sleepWindowIntervalRef.current = setInterval(() => {
      const currentHour = getDateService().getHour();
      const inWindow = isInSleepWindow(currentHour, dayBoundaryHour);
      const currentMode = modeRef.current;

      if (inWindow && currentMode !== 'sleeping' && currentMode !== 'fallingAsleep') {
        clearInactivityTimer();
        clearWaveTimer();
        clearSequenceTimer();
        fallAsleep();
      } else if (!inWindow && (currentMode === 'sleeping' || currentMode === 'fallingAsleep')) {
        wakeUp();
        startInactivityTimer();
      }
    }, SLEEP_WINDOW_CHECK_MS);

    return () => {
      if (sleepWindowIntervalRef.current) {
        clearInterval(sleepWindowIntervalRef.current);
      }
    };
  }, [
    dayBoundaryHour,
    fallAsleep,
    wakeUp,
    clearInactivityTimer,
    clearWaveTimer,
    clearSequenceTimer,
    startInactivityTimer,
  ]);

  // ─── Restart wave timer when mode returns to idle ────────────────────────

  useEffect(() => {
    if (mode === 'idle') {
      startWaveTimer();
    } else {
      clearWaveTimer();
    }
    return () => {
      clearWaveTimer();
    };
  }, [mode, startWaveTimer, clearWaveTimer]);

  // ─── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearInactivityTimer();
      clearWaveTimer();
      clearSequenceTimer();
    };
  }, [clearInactivityTimer, clearWaveTimer, clearSequenceTimer]);

  return {
    mode,
    resetInactivity,
  };
}
