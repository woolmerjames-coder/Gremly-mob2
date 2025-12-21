/**
 * useSweepIntroStats - Hook for fetching sweep intro stats
 *
 * Uses Zustand store data for instant stats computation.
 * Only fetches last_sweep_completed_at from Supabase (one small query).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SweepIntroStats, SweepIntroItem } from './introStats';
import { useGremlyStore } from '../store/useGremlyStore';
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
 * Uses store data for instant stats, only fetches last_sweep_completed_at from Supabase.
 *
 * @returns Object with stats, loading state, error, and refetch function
 */
export function useSweepIntroStats(): UseSweepIntroStatsResult {
  const { userId } = useAuth();

  const [lastSweepCompletedAt, setLastSweepCompletedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Get raw data from store (stable references)
  const todos = useGremlyStore((state) => state.todos);
  const habits = useGremlyStore((state) => state.habits);
  const notes = useGremlyStore((state) => state.notes);
  const habitProgress = useGremlyStore((state) => state.habitProgress);

  // Compute stats with useMemo to prevent infinite render loops
  const storeStats = useMemo((): SweepIntroStats => {
    const cutoffTimestamp =
      lastSweepCompletedAt || new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Completed todos (has completed_at > cutoff)
    const completedTodos: SweepIntroItem[] = todos
      .filter((t) => t.completed_at && t.completed_at > cutoffTimestamp)
      .map((t) => ({ id: t.id, name: t.name || 'Untitled', type: 'todo' as const }));

    // Completed habits (from habitProgress where occurred_at > cutoff)
    const completedHabitIds = new Set(
      habitProgress.filter((p) => p.occurred_at > cutoffTimestamp).map((p) => p.habit_id),
    );
    const completedHabits: SweepIntroItem[] = habits
      .filter((h) => completedHabitIds.has(h.id))
      .map((h) => ({ id: h.id, name: h.name || 'Untitled', type: 'habit' as const }));

    // Dropped items (created since cutoff, not archived, not completed)
    const droppedTodos: SweepIntroItem[] = todos
      .filter((t) => t.created_at > cutoffTimestamp && !t.archived && !t.completed_at)
      .map((t) => ({ id: t.id, name: t.name || 'Untitled', type: 'todo' as const }));

    const droppedHabits: SweepIntroItem[] = habits
      .filter((h) => h.created_at > cutoffTimestamp && !h.archived)
      .map((h) => ({ id: h.id, name: h.name || 'Untitled', type: 'habit' as const }));

    const droppedNotes: SweepIntroItem[] = notes
      .filter((n) => n.created_at > cutoffTimestamp && !n.archived)
      .map((n) => ({ id: n.id, name: n.title || 'Untitled', type: 'note' as const }));

    return {
      completed: { todos: completedTodos, habits: completedHabits },
      dropped: { todos: droppedTodos, habits: droppedHabits, notes: droppedNotes },
      isFirstSweep: !lastSweepCompletedAt,
      cutoffTimestamp,
    };
  }, [todos, habits, notes, habitProgress, lastSweepCompletedAt]);

  const fetchLastSweepTime = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Only fetch last_sweep_completed_at from cortex_preferences
      const { data: prefs, error: prefsError } = await supabase
        .from('cortex_preferences')
        .select('last_sweep_completed_at')
        .eq('owner_id', userId)
        .single();

      if (prefsError && prefsError.code !== 'PGRST116') {
        // PGRST116 = no rows found, which is fine for first-time users
        console.warn('[useSweepIntroStats] Failed to fetch cortex_preferences:', prefsError);
      }

      setLastSweepCompletedAt(prefs?.last_sweep_completed_at || null);
      setHasFetched(true);
    } catch (err) {
      console.error('[useSweepIntroStats] Failed to fetch last sweep time:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch sweep intro stats'));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Fetch on mount and when userId changes
  useEffect(() => {
    void fetchLastSweepTime();
  }, [fetchLastSweepTime]);

  return {
    // Only return stats after we've fetched the last sweep time
    stats: hasFetched ? storeStats : null,
    isLoading,
    error,
    refetch: fetchLastSweepTime,
  };
}
