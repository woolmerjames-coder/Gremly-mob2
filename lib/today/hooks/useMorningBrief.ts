/**
 * useMorningBrief - Morning Brief Sequences Hook
 *
 * Manages daily brief sequences (morning/day/evening time blocks).
 * This hook ONLY handles sequences - commitment/lock logic lives in:
 * - selectors.ts: useLockedItems selector
 * - repo: addCommitment/removeCommitment functions
 */

import { useCallback, useMemo } from 'react';
import { useGremlyStore } from '../../store/useGremlyStore';
import type { DailyBrief, SequencedItem } from '../../types';

/** Input for saving brief (sequences only) */
export interface BriefSequenceInput {
  morning_sequence?: SequencedItem[];
  day_sequence?: SequencedItem[];
  evening_sequence?: SequencedItem[];
}

export interface UseMorningBriefReturn {
  brief: DailyBrief | null;
  loading: boolean;
  hasCompletedBriefToday: boolean;
  morningSequence: SequencedItem[];
  daySequence: SequencedItem[];
  eveningSequence: SequencedItem[];
  saveBrief: (input: BriefSequenceInput) => Promise<void>;
  clearBrief: () => Promise<void>;
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

  // Store actions
  const saveBriefAction = useGremlyStore((s) => s.saveBrief);
  const clearBriefAction = useGremlyStore((s) => s.clearBrief);
  const fetchTodayBrief = useGremlyStore((s) => s.fetchTodayBrief);

  // Has completed brief today: check if daily_briefs record exists for today
  const hasCompletedBriefToday = useMemo(() => {
    const todayDate = getTodayDateString();
    return brief?.date === todayDate;
  }, [brief]);

  // Save brief (sequences only)
  const saveBrief = useCallback(
    async (input: BriefSequenceInput) => {
      await saveBriefAction({
        morning_sequence: input.morning_sequence ?? [],
        day_sequence: input.day_sequence ?? [],
        evening_sequence: input.evening_sequence ?? [],
      });
    },
    [saveBriefAction],
  );

  const clearBrief = useCallback(async () => {
    await clearBriefAction();
  }, [clearBriefAction]);

  const refresh = useCallback(async () => {
    await fetchTodayBrief();
  }, [fetchTodayBrief]);

  return {
    brief,
    loading,
    hasCompletedBriefToday,
    morningSequence: brief?.morning_sequence ?? [],
    daySequence: brief?.day_sequence ?? [],
    eveningSequence: brief?.evening_sequence ?? [],
    saveBrief,
    clearBrief,
    refresh,
  };
}
