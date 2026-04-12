/**
 * MascotModeContext
 *
 * Provides the lifecycle-managed AnimationMode to any MascotLottie
 * in the tree without explicit prop drilling.
 */

import React, { createContext, useContext } from 'react';
import type { AnimationMode } from '../lib/types';

interface MascotModeContextValue {
  mode: AnimationMode;
  resetInactivity: () => void;
}

const MascotModeContext = createContext<MascotModeContextValue>({
  mode: 'idle',
  resetInactivity: () => {},
});

export const MascotModeProvider = MascotModeContext.Provider;

export function useMascotMode(): MascotModeContextValue {
  return useContext(MascotModeContext);
}
