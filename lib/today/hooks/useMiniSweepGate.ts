/**
 * useMiniSweepGate - Mini Sweep Gate Hook
 *
 * Determines if the Mini Sweep should be shown based on:
 * - Whether user has already completed mini sweep today
 * - Whether there are rolled over (overdue) todos
 * - Whether there are unscheduled todos from the last 3 days
 */

import { useMemo } from 'react';
import { useGremlyStore } from '../../store/useGremlyStore';
import { useRolledOverTodos, useUnscheduledTodosForMiniSweep } from '../../store/selectors';
import type { Todo } from '../../types';

export interface UseMiniSweepGateReturn {
  /** Should the mini sweep gate be shown? */
  shouldShowMiniSweep: boolean;
  /** Overdue todos (due_day < today) */
  rolledOverTodos: Todo[];
  /** Unscheduled todos created in last 3 days */
  unscheduledTodos: Todo[];
  /** Count of rolled over todos */
  rolledOverCount: number;
  /** Count of unscheduled todos */
  unscheduledCount: number;
  /** Mark mini sweep as completed for today */
  markMiniSweepCompleted: () => Promise<void>;
}

/**
 * Get today's date string in YYYY-MM-DD format (local time)
 */
function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function useMiniSweepGate(): UseMiniSweepGateReturn {
  // Store state
  const miniSweepLastCompletedAt = useGremlyStore((s) => s.miniSweepLastCompletedAt);

  // Store actions
  const markMiniSweepCompleted = useGremlyStore((s) => s.markMiniSweepCompleted);

  // Selectors
  const rolledOverTodos = useRolledOverTodos();
  const unscheduledTodos = useUnscheduledTodosForMiniSweep();

  // Has completed mini sweep today: compare date portion of timestamp
  const hasCompletedMiniSweepToday = useMemo(() => {
    if (!miniSweepLastCompletedAt) return false;
    const todayDate = getTodayDateString();
    // miniSweepLastCompletedAt is ISO timestamp, extract date portion
    const completedDate = miniSweepLastCompletedAt.split('T')[0];
    return completedDate === todayDate;
  }, [miniSweepLastCompletedAt]);

  // Should show mini sweep if:
  // 1. Haven't completed it today
  // 2. There are items to sweep (rolled over OR unscheduled)
  const shouldShowMiniSweep = useMemo(() => {
    if (hasCompletedMiniSweepToday) return false;
    return rolledOverTodos.length > 0 || unscheduledTodos.length > 0;
  }, [hasCompletedMiniSweepToday, rolledOverTodos.length, unscheduledTodos.length]);

  return {
    shouldShowMiniSweep,
    rolledOverTodos,
    unscheduledTodos,
    rolledOverCount: rolledOverTodos.length,
    unscheduledCount: unscheduledTodos.length,
    markMiniSweepCompleted,
  };
}
