import React, { createContext, useContext, useMemo } from 'react';
import type { IRepo } from '../lib/repo/IRepo';
import { MemoryRepo } from '../lib/repo/memory';
import { SupabaseRepo } from '../lib/repo/supabase';
import { useAuth } from './AuthProvider';

/**
 * Repository provider that switches between MemoryRepo and SupabaseRepo
 * based on EXPO_PUBLIC_REPO_BACKEND environment variable.
 *
 * Default: 'memory'
 * Options: 'memory' | 'supabase'
 */

const RepoContext = createContext<IRepo | null>(null);

export const RepoProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { userId } = useAuth();
  const backend = process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory';

  const repo = useMemo(() => {
    if (backend === 'supabase') {
      const supabaseRepo = new SupabaseRepo(userId || undefined);
      // Update userId when auth changes
      if (userId) {
        supabaseRepo.setUserId(userId);
      }
      return supabaseRepo;
    }

    // Default to memory repo
    return new MemoryRepo(userId || 'anonymous');
  }, [backend, userId]);

  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
};

export const useRepo = (): IRepo => {
  const context = useContext(RepoContext);
  if (!context) {
    throw new Error('useRepo must be used within RepoProvider');
  }
  return context;
};
