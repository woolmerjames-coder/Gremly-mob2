/**
 * Sweep Selectors - Shared logic for Evening Sweep feature
 *
 * This module provides a single source of truth for determining which items
 * are eligible for the Evening Sweep. Both the sweep pill count and the
 * SweepDrawer modal use these selectors to ensure consistency.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SWEEP ELIGIBILITY RULES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An item is sweep-eligible if ALL of the following are true:
 *
 * 1. **Type**: Only `todo` items (habits are not swept - they reset daily)
 *
 * 2. **Status**: Must be `status === 'active'` (not completed, not archived)
 *
 * 3. **Due Today or Overdue**:
 *    - `due_day === today` (scheduled for today), OR
 *    - `due_day < today` (overdue from a previous day), OR
 *    - `carry_forward === true` (explicitly carried forward)
 *
 * 4. **Not Completed Today**: `completed_at` is null or not today's date
 *
 * 5. **Not Archived**: `archived !== true`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ```ts
 * import { selectSweepCandidates, getSweepCandidateCount } from './sweepSelectors';
 *
 * // Get full list for modal
 * const candidates = selectSweepCandidates(todos, todayDayString);
 *
 * // Get count for pill
 * const count = getSweepCandidateCount(todos, todayDayString);
 * ```
 */

import { getDateService } from '../date';

export interface SweepCandidate {
  id: string;
  type: 'todo';
  name: string;
  due_day?: string | null;
  due_date?: string | null;
  status?: 'active' | 'completed' | 'archived';
  carry_forward?: boolean;
  completed_at?: string | null;
  archived?: boolean;
  space_id?: string | null;
  tags?: string[];
  /** ISO 8601 timestamp when the item was created */
  created_at?: string | null;
  /** True if due_day (or due_date) is strictly before today */
  isOverdue: boolean;
}

/**
 * Minimal todo interface for sweep eligibility checking.
 * Accepts any object that has at least these fields.
 */
export interface SweepEligibleTodo {
  id: string;
  name: string;
  type?: string;
  due_day?: string | null;
  due_date?: string | null;
  status?: 'active' | 'completed' | 'archived' | string;
  carry_forward?: boolean;
  completed_at?: string | null;
  archived?: boolean;
  space_id?: string | null;
  tags?: string[];
  /** ISO 8601 timestamp when the item was created */
  created_at?: string | null;
}

/**
 * Check if a single todo is eligible for sweep.
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if the todo should appear in sweep
 */
export function isSweepEligible(todo: SweepEligibleTodo, todayDay: string): boolean {
  // Must be a todo (or unspecified type - assume todo)
  if (todo.type && todo.type !== 'todo') {
    return false;
  }

  // Must be active status
  if (todo.status && todo.status !== 'active') {
    return false;
  }

  // Must not be archived
  if (todo.archived === true) {
    return false;
  }

  // Must not be completed today
  if (todo.completed_at) {
    const completedDay = getDateService().extractDateFromIso(todo.completed_at);
    if (completedDay === todayDay) {
      return false;
    }
  }

  // Must be due today, overdue, or carry-forward
  const dueDay = todo.due_day ?? getDateService().extractDateFromIso(todo.due_date);

  if (todo.carry_forward === true) {
    return true;
  }

  if (dueDay) {
    // Due today or overdue
    return dueDay <= todayDay;
  }

  // No due date - include if created in last 3 days
  if (todo.created_at) {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const createdDate = new Date(todo.created_at);
    return createdDate >= threeDaysAgo;
  }

  return false;
}

/**
 * Select all todos that are eligible for Evening Sweep.
 *
 * This is the single source of truth for sweep eligibility.
 * Both the sweep pill and SweepDrawer modal should use this.
 *
 * @param todos - Array of todos to filter
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns Array of sweep-eligible todos
 */
export function selectSweepCandidates(
  todos: SweepEligibleTodo[],
  todayDay: string,
): SweepCandidate[] {
  const candidates = todos
    .filter((todo) => isSweepEligible(todo, todayDay))
    .map((todo) => {
      // Compute isOverdue using same logic as useTodayStats.overdueTodos
      const dueDay = todo.due_day ?? getDateService().extractDateFromIso(todo.due_date);
      const isOverdue = dueDay !== null && dueDay < todayDay;

      return {
        id: todo.id,
        type: 'todo' as const,
        name: todo.name,
        due_day: todo.due_day,
        due_date: todo.due_date,
        status: (todo.status ?? 'active') as 'active' | 'completed' | 'archived',
        carry_forward: todo.carry_forward,
        completed_at: todo.completed_at,
        archived: todo.archived,
        space_id: todo.space_id,
        tags: todo.tags,
        created_at: todo.created_at,
        isOverdue,
      };
    });

  // Enhanced logging for debugging sweep count discrepancy
  // This logs what the client-side selector sees vs what engine fetches
  console.log('[SweepSelectors] selectSweepCandidates:', {
    todayDay,
    inputCount: todos.length,
    candidateCount: candidates.length,
    candidateIds: candidates.map((c) => c.id.slice(0, 8)),
    candidateDetails: candidates.map((c) => ({
      id: c.id.slice(0, 8),
      isOverdue: c.isOverdue,
      dueDay: c.due_day,
      carryForward: c.carry_forward,
    })),
    // NOTE: This selector only counts TODOS, not notes!
    // The actual Sweep engine also includes notes from Mind Drop.
    // A discrepancy between this count and actual sweep cards is expected
    // if there are notes in the sweep.
  });

  return candidates;
}

/**
 * Get the count of sweep-eligible todos.
 *
 * Convenience wrapper around selectSweepCandidates for pill display.
 *
 * @param todos - Array of todos to count
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns Number of sweep-eligible todos
 */
export function getSweepCandidateCount(todos: SweepEligibleTodo[], todayDay: string): number {
  return selectSweepCandidates(todos, todayDay).length;
}
