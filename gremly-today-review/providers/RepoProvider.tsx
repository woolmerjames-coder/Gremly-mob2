import React, { createContext, useContext, useMemo } from 'react';
import type { IRepo } from '../lib/repo/IRepo';
import { MemoryRepo } from '../lib/repo/memory';
import { SupabaseRepo } from '../lib/repo/supabase';
import { useAuth } from './AuthProvider';
import { augmentRepoWithListAdapters } from '../lib/repo/adapters/listAdapters';

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
    if (__DEV__) {
      console.log('[RepoProvider] Backend:', backend);
      console.log('[RepoProvider] User ID:', userId || '(none)');
    }

    if (backend === 'supabase') {
      const supabaseRepo = new SupabaseRepo(userId || undefined);
      // Update userId when auth changes
      if (userId) {
        supabaseRepo.setUserId(userId);
      }
      if (__DEV__) {
        console.log('[RepoProvider] ✅ Using SupabaseRepo');
      }
      return augmentRepoWithListAdapters(supabaseRepo);
    }

    // Default to memory repo
    if (__DEV__) {
      console.log('[RepoProvider] ✅ Using MemoryRepo');
    }
    return augmentRepoWithListAdapters(new MemoryRepo(userId || 'anonymous'));
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
