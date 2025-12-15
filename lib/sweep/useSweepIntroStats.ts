/**
 * useSweepIntroStats - Hook for fetching sweep intro stats
 *
 * Fetches activity stats since the user's last sweep for display on the intro screen.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchSweepIntroStats, type SweepIntroStats } from './introStats';
import { supabase } from '../supabase/client';
import { useAuth } from '../../providers/AuthProvider';

interface UseSweepIntroStatsResult {
  stats: SweepIntroStats | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch sweep intro stats for the current user.
 *
 * @returns Object with stats, loading state, error, and refetch function
 */
export function useSweepIntroStats(): UseSweepIntroStatsResult {
  const { userId } = useAuth();

  const [stats, setStats] = useState<SweepIntroStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchSweepIntroStats(userId, supabase);
      setStats(result);
    } catch (err) {
      console.error('[useSweepIntroStats] Failed to fetch stats:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch sweep intro stats'));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Fetch on mount and when userId changes
  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    error,
    refetch: fetchStats,
  };
}
