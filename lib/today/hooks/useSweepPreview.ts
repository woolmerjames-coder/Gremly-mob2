import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepo } from '../../../providers/RepoProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { env } from '../../env';
import { getDateService } from '../../date/DateService';

export interface SweepPreviewState {
  completed: number;
  remaining: number;
  available: boolean; // after threshold
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * useSweepPreview - Phase 10.9
 * Shows “3 done · 2 to tidy” and gates availability after local 17:00.
 */
export function useSweepPreview(thresholdHourLocal = 17): SweepPreviewState {
  const repo = useRepo();
  const { user } = useAuth();

  const [completed, setCompleted] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(() => {
    const h = getDateService().now().getHours();
    const sweepEnabled =
      Boolean(env.feature.today.sweepPreview) || Boolean(env.feature.sweep?.eveningV1);
    return sweepEnabled && h >= thresholdHourLocal;
  }, [thresholdHourLocal]);

  const load = useCallback(async () => {
    if (!user || !env.feature.today.v3) {
      setCompleted(0);
      setRemaining(0);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const summary = await repo.getTodaySummary();
      setCompleted(summary.completed ?? 0);
      setRemaining(summary.remaining ?? 0);
      setLoading(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load Sweep preview';
      setError(message);
      setLoading(false);
    }
  }, [repo, user]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  return { completed, remaining, available, loading, error, reload: load };
}
