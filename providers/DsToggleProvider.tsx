/**
 * DsToggleContext - Runtime toggle for DS UI feature flag
 *
 * Provides a context for overriding FLAGS.USE_DS_UI at runtime in dev mode.
 * Source of truth is FLAGS.USE_DS_UI; this context adds a runtime override.
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { FLAGS } from '../config/flags';

interface DsToggleContextType {
  /** Whether DS UI is currently active (flag + override) */
  useDs: boolean;
  /** Runtime override state (dev-only) */
  useDsOverride: boolean;
  /** Toggle the runtime override */
  toggleDsOverride: () => void;
}

const DsToggleContext = createContext<DsToggleContextType | undefined>(undefined);

interface DsToggleProviderProps {
  children: ReactNode;
}

export function DsToggleProvider({ children }: DsToggleProviderProps) {
  const [useDsOverride, setUseDsOverride] = useState(false);

  // Combine flag with runtime override
  const useDs = FLAGS.USE_DS_UI || useDsOverride;

  const toggleDsOverride = () => {
    setUseDsOverride((prev) => !prev);
    if (__DEV__) {
      console.log('[DS Toggle] Runtime override:', !useDsOverride);
    }
  };

  return (
    <DsToggleContext.Provider value={{ useDs, useDsOverride, toggleDsOverride }}>
      {children}
    </DsToggleContext.Provider>
  );
}

export function useDsToggle(): DsToggleContextType {
  const context = useContext(DsToggleContext);
  if (!context) {
    throw new Error('useDsToggle must be used within DsToggleProvider');
  }
  return context;
}

/**
 * getDsFlag - Module-level getter for navigator requires
 *
 * Since require() is evaluated at module load time, we can't use hooks.
 * This function returns the current flag state for use in conditional requires.
 *
 * Note: Runtime override won't affect already-loaded modules; requires a reload.
 */
export function getDsFlag(): boolean {
  return FLAGS.USE_DS_UI;
}
