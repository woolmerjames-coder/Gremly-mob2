import React, { createContext, useContext, useMemo } from 'react';
import type { IRepo } from '../lib/repo/IRepo';
import { memoryRepo } from '../lib/repo/memory';

const RepoCtx = createContext<IRepo>(memoryRepo);
export const RepoProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  // (later we can toggle between memoryRepo and supabaseRepo)
  const value = useMemo(() => memoryRepo, []);
  return <RepoCtx.Provider value={value}>{children}</RepoCtx.Provider>;
};
export const useRepo = () => useContext(RepoCtx);
