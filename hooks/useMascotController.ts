/**
 * useMascotController Hook - Phase 10.6
 *
 * Manages mascot emotional state transitions with minimal side effects.
 * Provides calm, brand-aligned animation triggers for chat interactions.
 */

import { useState, useCallback, useRef } from 'react';
import type { MascotState } from '../lib/types';

export interface MascotController {
  state: MascotState;
  thinking: () => void;
  replying: () => void;
  playful: () => void;
  celebrate: () => void;
  rest: () => void;
  idle: () => void;
}

export function useMascotController(): MascotController {
  const [state, setState] = useState<MascotState>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to clear existing timeouts
  const clearExistingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Set state with optional auto-return to idle
  const setStateWithTimeout = useCallback(
    (newState: MascotState, duration?: number) => {
      clearExistingTimeout();
      setState(newState);

      if (duration) {
        timeoutRef.current = setTimeout(() => {
          setState('idle');
          timeoutRef.current = null;
        }, duration);
      }
    },
    [clearExistingTimeout],
  );

  const thinking = useCallback(() => {
    setStateWithTimeout('thinking');
  }, [setStateWithTimeout]);

  const replying = useCallback(() => {
    // Micro-bounce on assistant message (≈250ms)
    setStateWithTimeout('replying', 250);
  }, [setStateWithTimeout]);

  const playful = useCallback(() => {
    // Slight wink when in chit-chat mode (≈600ms)
    setStateWithTimeout('playful', 600);
  }, [setStateWithTimeout]);

  const celebrate = useCallback(() => {
    // Small cheer pose for "Saved ✅" events (≈800ms)
    setStateWithTimeout('celebration', 800);
  }, [setStateWithTimeout]);

  const rest = useCallback(() => {
    // Low-motion idle for reduced motion mode
    clearExistingTimeout();
    setState('rest');
  }, [clearExistingTimeout]);

  const idle = useCallback(() => {
    // Return to default calm state
    clearExistingTimeout();
    setState('idle');
  }, [clearExistingTimeout]);

  return {
    state,
    thinking,
    replying,
    playful,
    celebrate,
    rest,
    idle,
  };
}
