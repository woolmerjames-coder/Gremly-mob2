/**
 * useMiniSweepGate - Mini Sweep Gate Hook
 *
 * Determines if the Mini Sweep should be shown based on:
 * - Whether user has already completed mini sweep today
 * - Whether there are rolled over (overdue) todos
 * - Whether there are unscheduled todos from the last 3 days
 * - Whether there are fresh drops from today not yet processed through the brief
 */

import { useMemo } from 'react';
import { useGremlyStore } from '../../store/useGremlyStore';
import { useRolledOverTodos, useUnscheduledTodosForMiniSweep } from '../../store/selectors';
import { getDateService } from '../../date';
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
  /** Fresh todos dropped today that haven't been through the brief */
  todayUnprocessedDrops: Todo[];
  /** Count of today's unprocessed drops */
  todayUnprocessedDropsCount: number;
  /** Mark mini sweep as completed for today */
  markMiniSweepCompleted: () => Promise<void>;
}

/**
 * Get today's date string in YYYY-MM-DD format (local time)
 */
function getTodayDateString(): string {
  const now = getDateService().now();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function useMiniSweepGate(): UseMiniSweepGateReturn {
  // Store state
  const miniSweepLastCompletedAt = useGremlyStore((s) => s.miniSweepLastCompletedAt);
  const todos = useGremlyStore((s) => s.todos);

  // Store actions
  const markMiniSweepCompleted = useGremlyStore((s) => s.markMiniSweepCompleted);

  // Selectors
  const rolledOverTodos = useRolledOverTodos();
  const unscheduledTodos = useUnscheduledTodosForMiniSweep();

  // Fresh drops from today that haven't been through the brief yet
  const todayUnprocessedDrops = useMemo(() => {
    const todayDate = getTodayDateString();
    return todos.filter(
      (t) =>
        !t.archived &&
        !t.completed_at &&
        t.due_day === todayDate &&
        !t.daily_block &&
        !t.commitment &&
        t.created_at != null &&
        getDateService().extractDateFromIso(t.created_at) === todayDate
    );
  }, [todos]);

  // Get gremly age to check if user is brand new
  const gremlyAge = useGremlyStore((s) => s.gremlyAge);

  // Has completed mini sweep today: compare date portion of timestamp
  const hasCompletedMiniSweepToday = useMemo(() => {
    if (!miniSweepLastCompletedAt) return false;
    const todayDate = getTodayDateString();
    // miniSweepLastCompletedAt is ISO timestamp, extract date portion
    const completedDate = getDateService().extractDateFromIso(miniSweepLastCompletedAt);
    return completedDate === todayDate;
  }, [miniSweepLastCompletedAt]);

  // Should show mini sweep if:
  // 1. User has completed at least one ritual (gremlyAge >= 1)
  // 2. Haven't completed mini sweep today
  // 3. There are items to sweep (rolled over OR unscheduled OR unprocessed today drops)
  const shouldShowMiniSweep = useMemo(() => {
    if (gremlyAge < 1) return false; // Don't show for brand new users
    if (hasCompletedMiniSweepToday) return false;
    return rolledOverTodos.length > 0 || unscheduledTodos.length > 0 || todayUnprocessedDrops.length > 0;
  }, [gremlyAge, hasCompletedMiniSweepToday, rolledOverTodos.length, unscheduledTodos.length, todayUnprocessedDrops.length]);

  return {
    shouldShowMiniSweep,
    rolledOverTodos,
    unscheduledTodos,
    rolledOverCount: rolledOverTodos.length,
    unscheduledCount: unscheduledTodos.length,
    todayUnprocessedDrops,
    todayUnprocessedDropsCount: todayUnprocessedDrops.length,
    markMiniSweepCompleted,
  };
}
