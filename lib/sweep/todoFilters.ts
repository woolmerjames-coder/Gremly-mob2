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
 * TWO-DATE SYSTEM (Phase C Date Intelligence)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gremly now distinguishes between two types of dates:
 *
 * 1. **Do Date** (`scheduled_date`) - When the user plans to WORK on something
 *    - Internal, movable, set by user in Sweep
 *    - Controls when item appears on Today page
 *    - Example: "I'll book the hotel tomorrow"
 *
 * 2. **Deadline** (`target_date`) - When something IS or is DUE
 *    - External, often immovable
 *    - Provides context/urgency, shown as badge on cards
 *    - Example: "The race is on Feb 1" or "Taxes due April 15"
 *
 * **Backwards Compatibility:**
 * - Legacy `due_day` field is treated as a do date
 * - Effective do date = `scheduled_date ?? due_day`
 * - New code writes to `scheduled_date` AND `due_day` for compat
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CORE FILTER RULES (used by both Today page and Sweep)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A todo is "active" if:
 * - `status !== 'completed'` (not done)
 * - `archived !== true` (not archived)
 *
 * A todo is "scheduled for today" if:
 * - `effective_do_date === todayDay`
 *
 * A todo is "overdue" if:
 * - `effective_do_date < todayDay` (past the planned work date)
 *
 * A todo has "deadline pressure" if:
 * - `target_date` is set AND is approaching/passed
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SWEEP-SPECIFIC RULES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A todo appears in Sweep if:
 * - Do date reached or overdue (scheduled_date/due_day <= today)
 * - Has deadline but no do date planned (needs scheduling prompt)
 * - New item (created after last sweep)
 * - Previously skipped (skipped_in_sweep_at IS NOT NULL)
 * - Unscheduled recent drop (no dates, created in last 3 days)
 */

import { getDateService } from '../date/DateService';

/**
 * Minimal todo interface for filter functions.
 * Accepts any object with at least these fields.
 */
export interface FilterableTodo {
  // New two-date system
  scheduled_date?: string | null; // Do date - when to work on it
  target_date?: string | null; // Deadline - when it's due

  // Legacy fields (for backwards compatibility)
  due_day?: string | null; // Legacy do date (use scheduled_date instead)
  due_date?: string | null; // Legacy timestamp (deprecated)

  // Status fields
  status?: 'active' | 'completed' | 'archived' | string;
  archived?: boolean;
  completed_at?: string | null;
  carry_forward?: boolean;
  created_at?: string | null;
}

/**
 * Validate a date string is in YYYY-MM-DD format.
 */
function isValidDateString(dateStr: string): boolean {
  // Must match YYYY-MM-DD pattern
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  // Must parse to valid Date
  const parsed = new Date(dateStr);
  return !isNaN(parsed.getTime());
}

/**
 * Get the effective "do date" for a todo - when the user plans to work on it.
 *
 * Priority:
 * 1. `scheduled_date` (new canonical field)
 * 2. `due_day` (legacy field, for backwards compatibility)
 * 3. `due_date` (legacy timestamp, extract date portion)
 *
 * @param todo - The todo to check
 * @returns YYYY-MM-DD string or null if no do date scheduled
 */
export function getEffectiveDoDate(todo: FilterableTodo): string | null {
  // New field takes priority
  if (todo.scheduled_date) {
    return todo.scheduled_date;
  }
  // Fall back to legacy due_day
  if (todo.due_day) {
    return todo.due_day;
  }
  // Last resort: extract from legacy due_date timestamp
  if (todo.due_date) {
    const dateOnly = todo.due_date.split('T')[0];
    // Validate the extracted date
    if (isValidDateString(dateOnly)) {
      return dateOnly;
    }
    return null;
  }
  return null;
}

/**
 * Get the deadline (target date) for a todo - when it IS or is DUE.
 *
 * @param todo - The todo to check
 * @returns YYYY-MM-DD string or null if no deadline
 */
export function getDeadline(todo: FilterableTodo): string | null {
  return todo.target_date ?? null;
}

/**
 * @deprecated Use getEffectiveDoDate instead.
 * Kept for backwards compatibility with existing code.
 */
export function getEffectiveDueDay(todo: FilterableTodo): string | null {
  return getEffectiveDoDate(todo);
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
 * Check if a todo is scheduled for today (do date is today).
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if effective do date equals today
 */
export function isDueToday(todo: FilterableTodo, todayDay: string): boolean {
  const doDate = getEffectiveDoDate(todo);
  return doDate === todayDay;
}

/**
 * Check if a todo is overdue (past its scheduled do date).
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if effective do date is before today
 */
export function isOverdue(todo: FilterableTodo, todayDay: string): boolean {
  const doDate = getEffectiveDoDate(todo);
  if (doDate === null) {
    return false;
  }
  return doDate < todayDay;
}

/**
 * Check if a todo's deadline has passed.
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if target_date is before today
 */
export function isDeadlinePassed(todo: FilterableTodo, todayDay: string): boolean {
  const deadline = getDeadline(todo);
  if (deadline === null) {
    return false;
  }
  return deadline < todayDay;
}

/**
 * Check if a todo's deadline is today.
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns true if target_date equals today
 */
export function isDeadlineToday(todo: FilterableTodo, todayDay: string): boolean {
  const deadline = getDeadline(todo);
  return deadline === todayDay;
}

/**
 * Check if a todo has a deadline but no do date scheduled.
 * These items need a scheduling prompt in Sweep.
 *
 * @param todo - The todo to check
 * @returns true if has target_date but no scheduled_date/due_day
 */
export function hasUnscheduledDeadline(todo: FilterableTodo): boolean {
  const hasDeadline = todo.target_date != null;
  const hasDoDate = getEffectiveDoDate(todo) != null;
  return hasDeadline && !hasDoDate;
}

/**
 * Get the number of days until a deadline.
 *
 * @param todo - The todo to check
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @returns Number of days (negative if passed), or null if no deadline
 */
export function getDaysUntilDeadline(todo: FilterableTodo, todayDay: string): number | null {
  const deadline = getDeadline(todo);
  if (deadline === null) {
    return null;
  }

  const deadlineDate = new Date(deadline);
  const today = new Date(todayDay);
  const diffTime = deadlineDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
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
 *   - Scheduled for today (do date is today)
 *   - Overdue (do date has passed)
 *   - Carry forward
 *   - Has deadline but no do date (needs scheduling)
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

  // Check various conditions that require sweep attention
  return (
    isDueToday(todo, todayDay) ||
    isOverdue(todo, todayDay) ||
    isCarryForward(todo) ||
    hasUnscheduledDeadline(todo)
  );
}

/**
 * Build the Supabase OR clause for fetching sweep-eligible todos.
 *
 * This generates the query filter that matches `needsSweepAttention` logic
 * plus the sweep-specific rules (created after cutoff, skipped).
 *
 * The OR clause includes:
 * 1. `scheduled_date <= today` (do date reached - new field)
 * 2. `scheduled_date IS NULL AND due_day <= today` (legacy do date reached)
 * 3. `target_date IS NOT NULL AND scheduled_date IS NULL AND due_day IS NULL` (has deadline, needs scheduling)
 * 4. `created_at > cutoffTimestamp` (new items since last sweep)
 * 5. `skipped_in_sweep_at IS NOT NULL` (previously skipped)
 * 6. `scheduled_date IS NULL AND due_day IS NULL AND target_date IS NULL AND created_at > threeDaysAgo` (unscheduled recent)
 *
 * **Backwards Compatibility:**
 * - Condition 2 ensures old todos with only `due_day` still appear
 * - Condition 6 ensures completely unscheduled items still appear
 *
 * @param todayDay - Today's date as YYYY-MM-DD string
 * @param cutoffTimestamp - ISO timestamp for "new item" cutoff (from last sweep)
 * @returns Supabase OR clause string
 */
export function buildSweepTodoOrClause(todayDay: string, cutoffTimestamp: string): string {
  // Calculate 3 days ago for unscheduled items (matching recentDrops logic)
  const threeDaysAgo = getDateService().now();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoIso = threeDaysAgo.toISOString();

  // Supabase OR clause conditions:
  //
  // 1. scheduled_date <= today (new do date reached)
  // 2. scheduled_date IS NULL AND due_day <= today (legacy do date reached)
  // 3. target_date IS NOT NULL AND scheduled_date IS NULL AND due_day IS NULL (deadline without plan)
  // 4. created_at > cutoff (new items since last sweep)
  // 5. skipped_in_sweep_at IS NOT NULL (previously skipped)
  // 6. All dates NULL AND created in last 3 days (unscheduled recent items)
  //
  // Note: Supabase uses nested and() syntax within or() clauses

  const conditions = [
    // 1. New scheduled_date field
    `scheduled_date.lte.${todayDay}`,

    // 2. Legacy due_day (when scheduled_date not set)
    `and(scheduled_date.is.null,due_day.lte.${todayDay})`,

    // 3. Has deadline but no do date - needs scheduling prompt
    `and(target_date.not.is.null,scheduled_date.is.null,due_day.is.null)`,

    // 4. New items since last sweep
    `created_at.gt.${cutoffTimestamp}`,

    // 5. Previously skipped
    `skipped_in_sweep_at.not.is.null`,

    // 6. Completely unscheduled recent drops
    `and(scheduled_date.is.null,due_day.is.null,target_date.is.null,created_at.gt.${threeDaysAgoIso})`,
  ];

  return conditions.join(',');
}
