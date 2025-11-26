import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepo } from '../../../providers/RepoProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { eventBus } from '../../events';
import { env } from '../../env';

export type FocusEntryType = 'todo' | 'habit' | 'note' | null;
export type FocusSource = 'auto' | 'user' | 'carry_forward';

export interface FocusState {
  id?: string;
  entry_id: string | null;
  entry_type: FocusEntryType;
  source: FocusSource;
  created_at?: string;
  expires_at?: string | null;
}

export interface UseFocusCard {
  focus: FocusState | null;
  choose: (params: {
    entry_id: string | null;
    entry_type: FocusEntryType;
    source: FocusSource;
  }) => Promise<void>;
  clear: () => Promise<void>;
  autosuggest: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

/**
 * useFocusCard - Phase 10.9
 * Persists one focus per owner/day. Uses end-of-day UTC for expires_at.
 */
export function useFocusCard(): UseFocusCard {
  const repo = useRepo();
  const { user } = useAuth();
  const [focus, setFocus] = useState<FocusState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayDay = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const endOfDayIso = useMemo(() => `${todayDay}T23:59:59.999Z`, [todayDay]);

  const load = useCallback(async () => {
    if (!user) {
      setFocus(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!env.feature.today.v3) {
      setFocus(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const focusForDay = await repo.getFocusForDate(todayDay);
      setFocus(
        focusForDay
          ? {
              id: focusForDay.id,
              entry_id: focusForDay.entry_id,
              entry_type: focusForDay.entry_type,
              source: focusForDay.source,
              created_at: focusForDay.created_at,
              expires_at: focusForDay.expires_at,
            }
          : null,
      );
      setLoading(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load focus';
      setError(message);
      setLoading(false);
    }
  }, [repo, user, todayDay]);

  const choose = useCallback(
    async ({
      entry_id,
      entry_type,
      source,
    }: {
      entry_id: string | null;
      entry_type: FocusEntryType;
      source: FocusSource;
    }) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        await repo.setFocus({ entry_id, entry_type, source, expires_at: endOfDayIso });
        await load();
        eventBus.emit('FocusCardChanged', { entry_id, entry_type, source });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to set focus';
        setError(message);
        setLoading(false);
      }
    },
    [repo, user, endOfDayIso, load],
  );

  const clear = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await repo.clearFocusForDate(todayDay);
      await load();
      eventBus.emit('FocusCardCleared', {});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to clear focus';
      setError(message);
      setLoading(false);
    }
  }, [repo, user, todayDay, load]);

  const autosuggest = useCallback(async () => {
    if (!user) return;
    try {
      const candidates = await repo.topFocusCandidates(5);
      const pick = candidates?.[0];
      if (!pick) return;
      await choose({ entry_id: pick.id, entry_type: pick.type, source: 'auto' });
    } catch {
      // fail silently; focus remains unset
    }
  }, [repo, user, choose]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  // Reload when items change
  useEffect(() => {
    const unsub: Array<() => void> = [];
    unsub.push(eventBus.on('ItemUpdated', () => void load()));
    unsub.push(eventBus.on('ItemCompleted', () => void load()));
    return () => unsub.forEach((u) => u());
  }, [load]);

  return { focus, choose, clear, autosuggest, loading, error };
}
