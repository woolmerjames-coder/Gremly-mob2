import React, { createContext, useContext, useMemo } from 'react';
import type { ICortexEngine } from '../cortex/ICortexEngine';
import { createCortexEngine } from '../cortex/createEngine';
import { cortexDecide } from '../lib/cortex/cortexDecide';
import type { CortexContext, DecideInput, CortexResponse } from '../lib/cortex/cortexDecide';

const defaultEngine = createCortexEngine();
const CortexCtx = createContext<ICortexEngine>(defaultEngine);

export const CortexProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const value = useMemo(() => createCortexEngine(), []);
  return <CortexCtx.Provider value={value}>{children}</CortexCtx.Provider>;
};

/**
 * Hook to access Cortex SDK
 *
 * Provides:
 * - cortexDecide: New SDK function for AI-powered decisions (Phase 10.1)
 * - classify: Legacy engine method (backward compatibility)
 *
 * @example
 * // New SDK (Phase 10.1):
 * const { cortexDecide } = useCortex();
 * const result = await cortexDecide(
 *   { text: "buy milk" },
 *   { userId: user.id, activeSpaceId: null, uiSurface: "overlay" }
 * );
 *
 * // Legacy (backward compatibility):
 * const { classify } = useCortex();
 * const output = await classify({ text: "buy milk", spaceId: null });
 */
export const useCortex = () => {
  const engine = useContext(CortexCtx);

  return {
    // New SDK (Phase 10.1)
    cortexDecide,

    // Legacy interface (backward compatibility)
    classify: engine.classify.bind(engine),
  };
};
