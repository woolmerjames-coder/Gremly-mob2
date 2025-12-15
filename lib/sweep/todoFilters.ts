/**
 * Shared Todo Filter Logic
 *
 * This module provides the SINGLE SOURCE OF TRUTH for determining which todos
 * are due today, overdue, or otherwise relevant for both:
 *
 * 1. **Today/NOW Page** - Shows todos in "Today's Focus" section
 * 2. **Sweep Engine** - Includes todos as sweep candidates
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORE FILTER RULES (used by both Today page and Sweep)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A todo is "active" if:
 * - `status !== 'completed'` (not done)
 * - `archived !== true` (not archived)
 *
 * A todo is "due today" if:
 * - `due_day === todayDay` (canonical date field)
 *
 * A todo is "overdue" if:
 * - `due_day < todayDay` (past due)
 *
 * A todo is "carry forward" if:
 * - `carry_forward === true` (explicitly carried forward from previous day)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SWEEP-SPECIFIC RULES (only for Sweep engine)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * In addition to the core filters, the Sweep engine also includes:
 * - New items: `created_at > lastSweepTimestamp`
 * - Skipped items: `skipped_in_sweep_at IS NOT NULL`
 *
 * These are NOT in this shared module because they're unique to the Sweep flow.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ```ts
 * import { isActiveTodo, isDueToday, isOverdue, needsSweepAttention } from './todoFilters';
 *
 * // Check if a todo should be in Today's Focus
 * const showInToday = isActiveTodo(todo) && (isDueToday(todo, todayDay) || isOverdue(todo, todayDay));
 *
 * // Check if a todo needs sweep attention (due today or overdue)
 * const needsSweep = needsSweepAttention(todo, todayDay);
 * ```
 */

/**
 * Minimal todo interface for filter functions.
 * Accepts any object with at least these fields.
 */
export interface FilterableTodo {
  due_day?: string | null;
  due_date?: string | null;
  status?: 'active' | 'completed' | 'archived' | string;
  archived?: boolean;
  completed_at?: string | null;
  carry_forward?: boolean;
}

/**
 * Get the effective due day for a todo.
 *
 * Priority:
 * 1. `due_day` (canonical YYYY-MM-DD string) - preferred
 * 2. `due_date` (ISO timestamp fallback) - extract date portion
 *
 * @param todo - The todo to check
 * @returns YYYY-MM-DD string or null if no due date
 */
export function getEffectiveDueDay(todo: FilterableTodo): string | null {
  if (todo.due_day) {
    return todo.due_day;
  }
  if (todo.due_date) {
    return todo.due_date.split('T')[0];
  }
  return null;
}

/**
 * Check if a todo is active (not completed, not archived).
 *
 * This is the base filter that both Today and Sweep apply.
 *
 * @param todo - The todo to check
 * @returns true if the todo is active and should be considered
 */
export function isActiveTodo(todo: FilterableTodo): boolean {
  // Check status field
  if (todo.status === 'completed' || todo.status === 'archived') {
    return false;
  }

  // Check archived boolean
  if (todo.archived === true) {
    return false;
  }

  return true;
}

/**
 * Check if a todo was completed today.
 *
 * Used to exclude items that were already handled today from certain views.
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if completed_at is today
 */
export function isCompletedToday(todo: FilterableTodo, todayDay: string): boolean {
  if (!todo.completed_at) {
    return false;
  }
  const completedDay = todo.completed_at.split('T')[0];
  return completedDay === todayDay;
}

/**
 * Check if a todo is due today.
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if due_day equals today
 */
export function isDueToday(todo: FilterableTodo, todayDay: string): boolean {
  const dueDay = getEffectiveDueDay(todo);
  return dueDay === todayDay;
}

/**
 * Check if a todo is overdue.
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if due_day is before today
 */
export function isOverdue(todo: FilterableTodo, todayDay: string): boolean {
  const dueDay = getEffectiveDueDay(todo);
  if (dueDay === null) {
    return false;
  }
  return dueDay < todayDay;
}

/**
 * Check if a todo is a carry-forward item.
 *
 * Carry-forward items are todos that were explicitly carried forward
 * from a previous day and should appear in Today's Focus / Sweep.
 *
 * @param todo - The todo to check
 * @returns true if carry_forward is true
 */
export function isCarryForward(todo: FilterableTodo): boolean {
  return todo.carry_forward === true;
}

/**
 * Check if a todo needs sweep attention.
 *
 * This is the SHARED logic used by both:
 * - Today page sweep pills (via sweepSelectors.ts)
 * - Sweep engine (for candidate fetching)
 *
 * A todo needs sweep attention if it is:
 * - Active (not completed/archived)
 * - Not completed today
 * - AND one of:
 *   - Due today
 *   - Overdue
 *   - Carry forward
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if the todo should appear in sweep
 */
export function needsSweepAttention(todo: FilterableTodo, todayDay: string): boolean {
  // Must be active
  if (!isActiveTodo(todo)) {
    return false;
  }

  // Must not be completed today
  if (isCompletedToday(todo, todayDay)) {
    return false;
  }

  // Must be due today, overdue, or carry-forward
  return isDueToday(todo, todayDay) || isOverdue(todo, todayDay) || isCarryForward(todo);
}

/**
 * Build the Supabase OR clause for fetching sweep-eligible todos.
 *
 * This generates the query filter that matches `needsSweepAttention` logic
 * plus the sweep-specific rules (created after cutoff, skipped).
 *
 * The OR clause includes:
 * 1. `due_day <= todayDay` (due today OR overdue)
 * 2. `created_at > cutoffTimestamp` (new items since last sweep)
 * 3. `skipped_in_sweep_at IS NOT NULL` (previously skipped)
 * 4. `due_day IS NULL AND created_at >= threeDaysAgo` (unscheduled recent drops)
 *
 * Condition (4) aligns with useTodayStats.recentDrops which shows unscheduled
 * todos from the last 3 days. This ensures the sweep pill count matches
 * what's actually shown in the sweep flow.
 *
 * Note: carry_forward is implicitly handled by (1) since carry-forward items
 * should have a due_day set when they're carried forward.
 *
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @param cutoffTimestamp - ISO timestamp for "new item" cutoff (from last sweep)
 * @returns Supabase OR clause string
 */
export function buildSweepTodoOrClause(todayDay: string, cutoffTimestamp: string): string {
  // Calculate 3 days ago for unscheduled items (matching recentDrops logic)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoIso = threeDaysAgo.toISOString();

  // Note: Supabase doesn't support complex AND within OR easily,
  // so we include unscheduled recent items via the created_at condition.
  // Items with due_day=null AND created in last 3 days will be included
  // via the created_at.gt condition if the cutoff is recent enough.
  // For alignment, we use the minimum of cutoffTimestamp and threeDaysAgo.
  const effectiveCutoff = cutoffTimestamp < threeDaysAgoIso ? cutoffTimestamp : threeDaysAgoIso;

  return `due_day.lte.${todayDay},created_at.gt.${effectiveCutoff},skipped_in_sweep_at.not.is.null`;
}
