import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepo } from '../../../providers/RepoProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { env } from '../../env';
import { getDateService } from '../../date/DateService';

export interface DropZoneSummary {
  count: number;
  quote: string; // "You've been mentioning ..."
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Very lightweight client summary: keyword frequency extraction
 */
function summarize(lines: string[]): string {
  const text = lines.join(' ').toLowerCase();
  const words = text
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(
      (w) => w.length >= 4 && !['this', 'that', 'with', 'from', 'about', 'there'].includes(w),
    );
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  if (top.length === 0) return 'No new drops - quiet mind.';
  if (top.length === 1) return `You've been mentioning ${top[0]}.`;
  if (top.length === 2) return `You've been mentioning ${top[0]} and ${top[1]}.`;
  return `You've been mentioning ${top[0]}, ${top[1]}, and ${top[2]}.`;
}

export function useDropZoneSummary(): DropZoneSummary {
  const repo = useRepo();
  const { user } = useAuth();

  const [count, setCount] = useState(0);
  const [quote, setQuote] = useState('No new drops - quiet mind.');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sinceIso = useMemo(() => {
    const now = getDateService().now();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return yesterday.toISOString();
  }, []);

  const load = useCallback(async () => {
    if (!user || !env.feature.today.v3) {
      setCount(0);
      setQuote('No new drops - quiet mind.');
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const drops = await repo.listRecentDrops(sinceIso);
      setCount(drops.length);
      const lines = drops
        .map((drop) => `${drop.title ?? ''} ${drop.body ?? ''}`.trim())
        .filter(Boolean);
      setQuote(summarize(lines));
      setLoading(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load Drop Zone summary';
      setError(message);
      setLoading(false);
    }
  }, [repo, user, sinceIso]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  return { count, quote, loading, error, reload: load };
}
