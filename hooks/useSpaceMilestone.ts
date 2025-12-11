import { useState, useEffect, useCallback } from 'react';
import { useRepo } from '../providers/RepoProvider';
import type { SpaceMilestone, SpaceMeta } from '../lib/types';

interface UseSpaceMilestoneResult {
  milestone: SpaceMilestone | null;
  meta: SpaceMeta | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  countdown: {
    days: number | null;
    dateFormatted: string | null;
    isPast: boolean;
  };
}

/**
 * Hook to fetch active milestone and meta for a Space
 * Calculates countdown days if milestone has a date
 */
export function useSpaceMilestone(spaceId: string | undefined): UseSpaceMilestoneResult {
  const repo = useRepo();
  const [milestone, setMilestone] = useState<SpaceMilestone | null>(null);
  const [meta, setMeta] = useState<SpaceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!spaceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [milestoneResult, metaResult] = await Promise.all([
        repo.getActiveMilestone(spaceId),
        repo.getSpaceMeta(spaceId),
      ]);
      setMilestone(milestoneResult);
      setMeta(metaResult);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load milestone';
      setError(errorMessage);
      console.warn('[useSpaceMilestone] Error:', errorMessage);
    } finally {
      setLoading(false);
    }
  }, [spaceId, repo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate countdown
  const countdown = calculateCountdown(milestone?.date ?? null);

  return {
    milestone,
    meta,
    loading,
    error,
    refetch: fetchData,
    countdown,
  };
}

/**
 * Calculate days until a date
 */
function calculateCountdown(dateString: string | null): {
  days: number | null;
  dateFormatted: string | null;
  isPast: boolean;
} {
  if (!dateString) {
    return { days: null, dateFormatted: null, isPast: false };
  }

  try {
    const targetDate = new Date(dateString + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Format date as "June 15"
    const formatted = targetDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });

    return {
      days: diffDays,
      dateFormatted: formatted,
      isPast: diffDays < 0,
    };
  } catch {
    return { days: null, dateFormatted: null, isPast: false };
  }
}

export default useSpaceMilestone;
