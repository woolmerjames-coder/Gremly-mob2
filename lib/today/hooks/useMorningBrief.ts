/**
 * useMorningBrief - Morning Brief State Hook
 * Phase 1: Data layer foundation
 *
 * Manages daily intention-setting state with Zustand store integration.
 */

import { useCallback, useMemo } from 'react';
import { useGremlyStore } from '../../store/useGremlyStore';
import type { DailyBrief, DailyBriefInput, SequencedItem } from '../../types';

export interface UseMorningBriefReturn {
  // State
  brief: DailyBrief | null;
  loading: boolean;
  hasCompletedBriefToday: boolean;

  // One Thing
  oneThingId: string | null;
  oneThingType: 'todo' | 'habit' | null;

  // Sequences
  morningSequence: SequencedItem[];
  daySequence: SequencedItem[];
  eveningSequence: SequencedItem[];

  // Candidate items (todos + habits due today, for selection UI)
  candidates: Array<{ id: string; type: 'todo' | 'habit'; name: string }>;

  // Actions
  saveBrief: (input: DailyBriefInput) => Promise<void>;
  clearBrief: () => Promise<void>;
  setOneThing: (id: string | null, type: 'todo' | 'habit' | null) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

/**
 * Get today's date string in YYYY-MM-DD format (local time)
 */
function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function useMorningBrief(): UseMorningBriefReturn {
  // Store state
  const brief = useGremlyStore((s) => s.dailyBrief);
  const loading = useGremlyStore((s) => s.dailyBriefLoading);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);

  // Store actions
  const saveBriefAction = useGremlyStore((s) => s.saveBrief);
  const clearBriefAction = useGremlyStore((s) => s.clearBrief);
  const fetchTodayBrief = useGremlyStore((s) => s.fetchTodayBrief);

  // Derived state
  const todayDate = getTodayDateString();

  const hasCompletedBriefToday = useMemo(() => {
    if (!brief) return false;
    return brief.date === todayDate && brief.completed_at !== null;
  }, [brief, todayDate]);

  // Candidate items: active todos due today + daily habits
  const candidates = useMemo(() => {
    const todayTodos = todos
      .filter((t) => {
        // Not archived, not completed
        if (t.archived || t.completed_at) return false;
        // Due today or no due date (available for selection)
        if (t.due_day && t.due_day > todayDate) return false;
        return true;
      })
      .map((t) => ({
        id: t.id,
        type: 'todo' as const,
        name: t.name || t.title || 'Untitled',
      }));

    const todayHabits = habits
      .filter((h) => {
        // Not archived
        if (h.archived) return false;
        // Daily cadence or should surface today
        return h.cadence === 'daily' || !h.cadence;
      })
      .map((h) => ({
        id: h.id,
        type: 'habit' as const,
        name: h.name || 'Untitled',
      }));

    return [...todayTodos, ...todayHabits];
  }, [todos, habits, todayDate]);

  // Actions
  const saveBrief = useCallback(
    async (input: DailyBriefInput) => {
      await saveBriefAction(input);
    },
    [saveBriefAction],
  );

  const clearBrief = useCallback(async () => {
    await clearBriefAction();
  }, [clearBriefAction]);

  const setOneThing = useCallback(
    async (id: string | null, type: 'todo' | 'habit' | null) => {
      await saveBriefAction({
        one_thing_id: id,
        one_thing_type: type,
        // Preserve existing sequences
        morning_sequence: brief?.morning_sequence ?? [],
        day_sequence: brief?.day_sequence ?? [],
        evening_sequence: brief?.evening_sequence ?? [],
      });
    },
    [saveBriefAction, brief],
  );

  const refresh = useCallback(async () => {
    await fetchTodayBrief();
  }, [fetchTodayBrief]);

  return {
    // State
    brief,
    loading,
    hasCompletedBriefToday,

    // One Thing
    oneThingId: brief?.one_thing_id ?? null,
    oneThingType: brief?.one_thing_type ?? null,

    // Sequences
    morningSequence: brief?.morning_sequence ?? [],
    daySequence: brief?.day_sequence ?? [],
    eveningSequence: brief?.evening_sequence ?? [],

    // Candidates
    candidates,

    // Actions
    saveBrief,
    clearBrief,
    setOneThing,
    refresh,
  };
}
