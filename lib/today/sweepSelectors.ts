/**
 * Sweep Selectors - Shared logic for Evening Sweep feature
 *
 * This module provides a single source of truth for determining which items
 * are eligible for the Evening Sweep. Both the sweep pill count and the
 * SweepDrawer modal use these selectors to ensure consistency.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO-DATE SYSTEM (Phase C Date Intelligence)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gremly now distinguishes between two types of dates:
 *
 * 1. **Do Date** (`scheduled_date`) - When the user plans to WORK on something
 *    - Internal, movable, set by user in Sweep
 *    - Controls when item appears on Today page
 *
 * 2. **Deadline** (`target_date`) - When something IS or is DUE
 *    - External, often immovable
 *    - Provides context/urgency, shown as badge on cards
 *
 * **Backwards Compatibility:**
 * - Legacy `due_day` field is treated as a do date
 * - Effective do date = `scheduled_date ?? due_day`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SWEEP ELIGIBILITY RULES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An item is sweep-eligible if ALL of the following are true:
 *
 * 1. **Type**: Only `todo` items (habits are not swept - they reset daily)
 *
 * 2. **Open only**: Must have `completed_at == null` (status is not reliable)
 *
 * 3. **Needs Attention**: One of:
 *    - Do date reached or passed (`scheduled_date <= today` OR `due_day <= today`)
 *    - Has deadline but no do date (needs scheduling prompt)
 *    - Carry forward flag set
 *    - Recently created with no dates (last 3 days)
 *
 * 4. **Not Completed**: `completed_at` must be null
 *
 * 5. **Not Archived**: `archived !== true`
 */

import { getDateService } from '../date';

export interface SweepCandidate {
  id: string;
  type: 'todo';
  name: string;

  // New two-date system
  /** Do date - when user plans to work on it (YYYY-MM-DD) */
  scheduled_date?: string | null;
  /** Deadline - when it's due (YYYY-MM-DD) */
  target_date?: string | null;

  // Legacy fields (backwards compatibility)
  /** @deprecated Use scheduled_date instead */
  due_day?: string | null;
  /** @deprecated Use scheduled_date instead */
  due_date?: string | null;

  status?: 'active' | 'completed' | 'archived';
  carry_forward?: boolean;
  completed_at?: string | null;
  archived?: boolean;
  space_id?: string | null;
  tags?: string[];
  /** ISO 8601 timestamp when the item was created */
  created_at?: string | null;

  // Computed fields
  /** True if do date (scheduled_date/due_day) is strictly before today */
  isOverdue: boolean;
  /** True if has deadline but no do date scheduled */
  hasUnscheduledDeadline: boolean;
  /** Number of days until deadline (negative if passed), null if no deadline */
  daysUntilDeadline: number | null;
}

/**
 * Minimal todo interface for sweep eligibility checking.
 * Accepts any object that has at least these fields.
 */
export interface SweepEligibleTodo {
  id: string;
  name: string;
  type?: string;

  // New two-date system
  scheduled_date?: string | null;
  target_date?: string | null;

  // Legacy fields
  due_day?: string | null;
  due_date?: string | null;

  status?: 'active' | 'completed' | 'archived' | string;
  carry_forward?: boolean;
  completed_at?: string | null;
  archived?: boolean;
  space_id?: string | null;
  tags?: string[];
  created_at?: string | null;
}

/**
 * Get the effective "do date" - when the user plans to work on this todo.
 *
 * Priority: scheduled_date > due_day > due_date (extract date)
 */
function getEffectiveDoDate(todo: SweepEligibleTodo): string | null {
  if (todo.scheduled_date) {
    return todo.scheduled_date;
  }
  if (todo.due_day) {
    return todo.due_day;
  }
  if (todo.due_date) {
    return getDateService().extractLocalDate(todo.due_date);
  }
  return null;
}

/**
 * Get the deadline (target_date) for a todo.
 */
function getDeadline(todo: SweepEligibleTodo): string | null {
  return todo.target_date ?? null;
}

/**
 * Calculate days until deadline.
 */
function getDaysUntilDeadline(todo: SweepEligibleTodo, todayDay: string): number | null {
  const deadline = getDeadline(todo);
  if (deadline === null) {
    return null;
  }

  return getDateService().daysBetween(todayDay, deadline);
}

/**
 * Check if a todo has a deadline but no do date scheduled.
 */
function hasUnscheduledDeadline(todo: SweepEligibleTodo): boolean {
  const hasDeadline = todo.target_date != null;
  const hasDoDate = getEffectiveDoDate(todo) != null;
  return hasDeadline && !hasDoDate;
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

  // Must not be archived
  if (todo.archived === true) {
    return false;
  }

  // Completion is tracked via completed_at, not status.
  if (todo.completed_at != null) {
    return false;
  }

  // Check: carry forward always eligible
  if (todo.carry_forward === true) {
    return true;
  }

  // Check: do date reached or overdue
  const doDate = getEffectiveDoDate(todo);
  if (doDate && doDate <= todayDay) {
    return true;
  }

  // Check: has deadline but no do date (needs scheduling prompt)
  if (hasUnscheduledDeadline(todo)) {
    return true;
  }

  // Check: no dates at all - include if created in last 3 days
  if (!doDate && !todo.target_date) {
    if (todo.created_at) {
      const threeDaysAgo = getDateService().now();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const createdDate = new Date(todo.created_at);
      return createdDate >= threeDaysAgo;
    }
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
 * @returns Array of sweep-eligible todos with computed metadata
 */
export function selectSweepCandidates(
  todos: SweepEligibleTodo[],
  todayDay: string,
): SweepCandidate[] {
  const candidates = todos
    .filter((todo) => isSweepEligible(todo, todayDay))
    .map((todo) => {
      // Compute metadata
      const doDate = getEffectiveDoDate(todo);
      const isOverdue = doDate !== null && doDate < todayDay;
      const unscheduledDeadline = hasUnscheduledDeadline(todo);
      const daysUntilDeadline = getDaysUntilDeadline(todo, todayDay);

      return {
        id: todo.id,
        type: 'todo' as const,
        name: todo.name,

        // New fields
        scheduled_date: todo.scheduled_date,
        target_date: todo.target_date,

        // Legacy fields (for backwards compat)
        due_day: todo.due_day,
        due_date: todo.due_date,

        status: (todo.status ?? 'active') as 'active' | 'completed' | 'archived',
        carry_forward: todo.carry_forward,
        completed_at: todo.completed_at,
        archived: todo.archived,
        space_id: todo.space_id,
        tags: todo.tags,
        created_at: todo.created_at,

        // Computed
        isOverdue,
        hasUnscheduledDeadline: unscheduledDeadline,
        daysUntilDeadline,
      };
    });

  // Enhanced logging for debugging
  console.log('[SweepSelectors] selectSweepCandidates:', {
    todayDay,
    inputCount: todos.length,
    candidateCount: candidates.length,
    candidateIds: candidates.map((c) => c.id.slice(0, 8)),
    candidateDetails: candidates.map((c) => ({
      id: c.id.slice(0, 8),
      isOverdue: c.isOverdue,
      hasUnscheduledDeadline: c.hasUnscheduledDeadline,
      daysUntilDeadline: c.daysUntilDeadline,
      scheduledDate: c.scheduled_date,
      targetDate: c.target_date,
      dueDay: c.due_day,
      carryForward: c.carry_forward,
    })),
    // NOTE: This selector only counts TODOS, not notes!
    // The actual Sweep engine also includes notes from Mind Drop.
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
