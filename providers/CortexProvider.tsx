import React, { createContext, useContext, useMemo } from 'react';
import type { ICortexEngine } from '../cortex/ICortexEngine';
import { heuristicEngine } from '../cortex/heuristicEngine';

const CortexCtx = createContext<ICortexEngine>(heuristicEngine);
export const CortexProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const value = useMemo(() => heuristicEngine, []);
  return <CortexCtx.Provider value={value}>{children}</CortexCtx.Provider>;
};
export const useCortex = () => useContext(CortexCtx);
