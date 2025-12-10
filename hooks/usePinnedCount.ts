import { useState, useEffect, useCallback } from 'react';
import { useRepo } from '../providers/RepoProvider';

/**
 * Hook to fetch pinned item count for a Space
 */
export function usePinnedCount(spaceId: string | undefined): {
  count: number;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const repo = useRepo();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!spaceId) {
      setLoading(false);
      return;
    }

    try {
      const result = await repo.getPinnedCountForSpace(spaceId);
      setCount(result);
    } catch (e) {
      console.warn('[usePinnedCount] Error:', e);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [spaceId, repo]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  return { count, loading, refetch: fetchCount };
}

export default usePinnedCount;
