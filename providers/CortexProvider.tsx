import React, { createContext, useContext, useMemo } from 'react';
import type { ICortexEngine } from '../cortex/ICortexEngine';
import { createCortexEngine } from '../cortex/createEngine';

const defaultEngine = createCortexEngine();
const CortexCtx = createContext<ICortexEngine>(defaultEngine);
export const CortexProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const value = useMemo(() => createCortexEngine(), []);
  return <CortexCtx.Provider value={value}>{children}</CortexCtx.Provider>;
};
export const useCortex = () => useContext(CortexCtx);
