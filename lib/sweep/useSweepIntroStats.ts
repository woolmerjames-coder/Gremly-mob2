/**
 * useSweepIntroStats - Hook for fetching sweep intro stats
 *
 * Uses Zustand store data for instant stats computation.
 * Sweep preferences are loaded into Zustand on app init - no separate fetch needed.
 */

import { useMemo, useState } from 'react';
import type { SweepIntroStats, SweepIntroItem } from './introStats';
import { useGremlyStore } from '../store/useGremlyStore';

/**
 * Compute fallback cutoff timestamp (48 hours ago).
 * Extracted to a function to satisfy React purity rules.
 */
function computeFallbackCutoff(): string {
  return new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
}

interface UseSweepIntroStatsResult {
  stats: SweepIntroStats | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to get sweep intro stats for the current user.
 * All data comes from Zustand store - no separate Supabase fetch.
 *
 * @returns Object with stats, loading state, error, and refetch function
 */
export function useSweepIntroStats(): UseSweepIntroStatsResult {
  // Read all data from Zustand - no separate fetch needed
  const todos = useGremlyStore((state) => state.todos);
  const habits = useGremlyStore((state) => state.habits);
  const notes = useGremlyStore((state) => state.notes);
  const habitProgress = useGremlyStore((state) => state.habitProgress);
  const lastSweepCompletedAt = useGremlyStore((state) => state.lastSweepCompletedAt);
  const sweepStreak = useGremlyStore((state) => state.sweepStreak);
  const totalSweepCount = useGremlyStore((state) => state.totalSweepCount);
  const isLoading = useGremlyStore((state) => state.isLoading);
  const isInitialized = useGremlyStore((state) => state.isInitialized);

  // Compute fallback cutoff once on mount (only used when lastSweepCompletedAt is null)
  const [fallbackCutoff] = useState(computeFallbackCutoff);

  // Compute stats with useMemo to prevent infinite render loops
  const stats = useMemo((): SweepIntroStats => {
    const cutoffTimestamp = lastSweepCompletedAt || fallbackCutoff;

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
      totalSweepCount,
      sweepStreak,
    };
  }, [
    todos,
    habits,
    notes,
    habitProgress,
    lastSweepCompletedAt,
    totalSweepCount,
    sweepStreak,
    fallbackCutoff,
  ]);

  return {
    // Return stats once store is initialized
    stats: isInitialized ? stats : null,
    isLoading,
    error: null,
    refetch: async () => {}, // No-op - data comes from store, refreshed on app init
  };
}
