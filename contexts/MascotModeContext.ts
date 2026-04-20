/**
 * MascotModeContext
 *
 * Provides the lifecycle-managed AnimationMode to any MascotLottie
 * in the tree without explicit prop drilling, plus the finish-signal
 * callback that routes animation completion events back to the store.
 */

import { createContext, useContext } from 'react';
import type { AnimationMode } from '../lib/types';

interface MascotModeContextValue {
  mode: AnimationMode;
  resetInactivity: () => void;
  /**
   * Called by MascotLottie when a one-shot animation finishes playing.
   * Routes the completion event to the store's state machine, which advances
   * to the queued mode (if any), the next sequence step (if any), or the
   * mode's auto-return target.
   */
  signalAnimationFinish: (mode: AnimationMode) => void;
}

const MascotModeContext = createContext<MascotModeContextValue>({
  mode: 'idle',
  resetInactivity: () => {},
  signalAnimationFinish: () => {},
});

export const MascotModeProvider = MascotModeContext.Provider;

export function useMascotMode(): MascotModeContextValue {
  return useContext(MascotModeContext);
}
