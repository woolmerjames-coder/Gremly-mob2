/**
 * habitHelpers.ts - Helper functions for Sweep habit display
 *
 * Computes streaks, progress, and groups habits by cadence.
 * All computations use habitProgress from Zustand store.
 */

import type { Habit, Cadence } from '../types';
import type { HabitProgressRow } from '../store/useGremlyStore';
import { getFrequencyDisplayLabel } from '../habits/frequencyUtils';
import { getDateService } from '../date';

const ds = () => getDateService();

// ─────────────────────────────────────────────────────────────────────────────
// Frequency Parsing Utilities
// ─────────────────────────────────────────────────────────────────────────────

export type HabitCadence = 'daily' | 'weekly' | 'monthly';

export interface ParsedHabitFrequency {
  cadence: HabitCadence;
  target_per_period: number;
  frequency: string;
}

/**
 * Normalizes a cadence value from the database.
 * Handles legacy 'day' values and ensures valid cadence.
 */
export function normalizeCadence(cadence?: string | null): HabitCadence {
  const c = (cadence ?? 'daily').toLowerCase().trim();
  if (c === 'day') return 'daily';
  if (c === 'week') return 'weekly';
  if (c === 'month') return 'monthly';
  if (c === 'daily' || c === 'weekly' || c === 'monthly') return c as HabitCadence;
  return 'daily';
}

/**
 * Parses habit frequency into structured database fields.
 */
export function parseHabitFrequency(
  frequency?: string | null,
  frequencyValue?: number | null,
): ParsedHabitFrequency {
  const freq = (frequency ?? 'daily').toLowerCase().trim();

  let cadence: HabitCadence = 'daily';
  let target = 1;
  let normalizedFrequency = 'daily';

  // Parse "Nx/week" patterns
  const nxWeekMatch = freq.match(/(\d+)\s*x?\s*(\/|per)?\s*week/i);
  if (nxWeekMatch) {
    cadence = 'weekly';
    target = parseInt(nxWeekMatch[1], 10) || 1;
    normalizedFrequency = `${target}x/week`;
  }
  // Parse "Nx/month" patterns
  else if (freq.match(/(\d+)\s*x?\s*(\/|per)?\s*month/i)) {
    const match = freq.match(/(\d+)/);
    cadence = 'monthly';
    target = match ? parseInt(match[1], 10) : 1;
    normalizedFrequency = `${target}x/month`;
  }
  // Explicit cadence values
  else if (freq === 'daily' || freq === 'day' || freq === 'every day') {
    cadence = 'daily';
    target = frequencyValue ?? 1;
    normalizedFrequency = target > 1 ? `${target}x daily` : 'daily';
  } else if (freq === 'weekly' || freq === 'week' || freq === 'every week') {
    cadence = 'weekly';
    target = frequencyValue ?? 1;
    normalizedFrequency = target > 1 ? `${target}x/week` : 'weekly';
  } else if (freq === 'monthly' || freq === 'month' || freq === 'every month') {
    cadence = 'monthly';
    target = frequencyValue ?? 1;
    normalizedFrequency = target > 1 ? `${target}x/month` : 'monthly';
  }
  // Handle 'custom' - preserve the value (user will configure in overlay)
  else if (freq === 'custom') {
    if (frequencyValue && frequencyValue > 1) {
      cadence = 'weekly';
      target = frequencyValue;
      normalizedFrequency = `${target}x/week`;
    } else {
      // Preserve 'custom' as-is - user needs to configure this later
      cadence = 'daily';
      target = 1;
      normalizedFrequency = 'custom';
    }
  }
  // Fallback with frequencyValue
  else if (frequencyValue && frequencyValue > 1) {
    cadence = 'weekly';
    target = frequencyValue;
    normalizedFrequency = `${target}x/week`;
  }

  return { cadence, target_per_period: target, frequency: normalizedFrequency };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HabitWithMeta {
  habit: Habit;
  cadence: Cadence;
  streakDays: number;
  completedThisPeriod: number;
  targetPerPeriod: number;
  frequencyLabel: string;
  isCompletedForPeriod: boolean;
  isCompletedToday: boolean;
  isAheadOfTarget: boolean; // True if completedThisPeriod >= targetPerPeriod (for weekly/monthly)
}

export interface GroupedHabits {
  daily: HabitWithMeta[];
  weekly: HabitWithMeta[];
  monthly: HabitWithMeta[];
  completed: HabitWithMeta[]; // Habits that have met their target for the period
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get today's date as YYYY-MM-DD in local timezone
 */
export function getTodayDateString(): string {
  return ds().getCurrentDate();
}

/**
 * Get date string for N days ago
 */
function getDateStringDaysAgo(daysAgo: number): string {
  return ds().addDays(ds().getCurrentDate(), -daysAgo);
}

/**
 * Get the start of the current week (Monday) as YYYY-MM-DD
 */
function getWeekStartDateString(): string {
  const today = ds().getCurrentDate();
  const date = ds().fromDateString(today);
  const dayOfWeek = date?.getDay() ?? 0;
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return ds().addDays(today, -daysFromMonday);
}

/**
 * Get the start of the current month as YYYY-MM-DD
 */
function getMonthStartDateString(): string {
  const today = ds().getCurrentDate();
  return today.slice(0, 8) + '01'; // YYYY-MM-01
}

// ─────────────────────────────────────────────────────────────────────────────
// Streak Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate streak for a daily habit.
 * Counts consecutive days completed, starting from yesterday (or today if completed).
 */
export function getHabitStreak(habitId: string, habitProgress: HabitProgressRow[]): number {
  const today = getTodayDateString();

  // Get all completion dates for this habit, sorted descending
  const completionDates = habitProgress
    .filter((p) => p.habit_id === habitId)
    .map((p) => p.occurred_day)
    .sort((a, b) => b.localeCompare(a)); // Most recent first

  if (completionDates.length === 0) return 0;

  // Create a Set for O(1) lookups
  const completedSet = new Set(completionDates);

  // Start counting from today (if completed) or yesterday
  let streak = 0;
  let checkDate = today;

  // If today is completed, include it and start checking yesterday
  if (completedSet.has(today)) {
    streak = 1;
    checkDate = getDateStringDaysAgo(1);
  } else {
    // Today not completed - start from yesterday
    checkDate = getDateStringDaysAgo(1);
  }

  // Count consecutive days going backwards
  let daysBack = completedSet.has(today) ? 1 : 0;
  while (daysBack < 365) {
    // Safety limit
    const dateToCheck = getDateStringDaysAgo(daysBack + (completedSet.has(today) ? 1 : 0));

    // Actually, let's simplify:
    // Start from the day before today (or today if completed) and go back
    const checkDateStr = getDateStringDaysAgo(streak + (completedSet.has(today) ? 0 : 1));

    if (completedSet.has(checkDateStr)) {
      streak++;
      daysBack++;
    } else {
      break;
    }

    if (daysBack > 365) break; // Safety
  }

  // Cleaner approach: iterate backwards from yesterday
  streak = completedSet.has(today) ? 1 : 0;
  for (let i = 1; i <= 365; i++) {
    const dateStr = getDateStringDaysAgo(i);
    if (completedSet.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// ─────────────────────────────────────────────────────────────────────────────
// Period Progress Calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get number of completions for a habit within a date range.
 */
function getCompletionsInRange(
  habitId: string,
  habitProgress: HabitProgressRow[],
  startDate: string,
  endDate: string,
): number {
  return habitProgress.filter(
    (p) => p.habit_id === habitId && p.occurred_day >= startDate && p.occurred_day <= endDate,
  ).length;
}

/**
 * Get completions this week for a habit.
 */
export function getWeeklyProgress(habitId: string, habitProgress: HabitProgressRow[]): number {
  const weekStart = getWeekStartDateString();
  const today = getTodayDateString();
  return getCompletionsInRange(habitId, habitProgress, weekStart, today);
}

/**
 * Get completions this month for a habit.
 */
export function getMonthlyProgress(habitId: string, habitProgress: HabitProgressRow[]): number {
  const monthStart = getMonthStartDateString();
  const today = getTodayDateString();
  return getCompletionsInRange(habitId, habitProgress, monthStart, today);
}

/**
 * Check if habit is completed for today specifically.
 */
export function isHabitCompletedToday(habitId: string, habitProgress: HabitProgressRow[]): boolean {
  const today = getTodayDateString();
  return habitProgress.some((p) => p.habit_id === habitId && p.occurred_day === today);
}

// ─────────────────────────────────────────────────────────────────────────────
// Frequency Label Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate human-readable frequency label.
 *
 * @deprecated Use getFrequencyDisplayLabel from frequencyUtils.ts directly
 * for new code. This function delegates to the centralized utility for
 * backwards compatibility.
 */
export function getFrequencyLabel(habit: {
  cadence?: string | null;
  target_per_period?: number | null;
  frequency?: string | null;
}): string {
  // Delegate to single source of truth
  // Note: We use canonical fields (cadence, target_per_period) as the source of truth,
  // NOT the frequency string. The string is only kept for debugging.
  return getFrequencyDisplayLabel(habit.cadence, habit.target_per_period);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Grouping Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process habits and group by cadence, computing metadata for each.
 * Separates habits that have met their period target into "completed" group.
 */
export function groupHabitsForSweep(
  habits: Habit[],
  habitProgress: HabitProgressRow[],
): GroupedHabits {
  const result: GroupedHabits = {
    daily: [],
    weekly: [],
    monthly: [],
    completed: [],
  };

  for (const habit of habits) {
    // Skip archived habits
    if (habit.archived) continue;

    const cadence: Cadence = normalizeCadence(habit.cadence);
    const targetPerPeriod = habit.target_per_period ?? 1;

    // Calculate progress based on cadence
    let completedThisPeriod = 0;
    let streakDays = 0;

    if (cadence === 'daily') {
      streakDays = getHabitStreak(habit.id, habitProgress);
      completedThisPeriod = isHabitCompletedToday(habit.id, habitProgress) ? 1 : 0;
    } else if (cadence === 'weekly') {
      completedThisPeriod = getWeeklyProgress(habit.id, habitProgress);
    } else if (cadence === 'monthly') {
      completedThisPeriod = getMonthlyProgress(habit.id, habitProgress);
    }

    const isCompletedToday = isHabitCompletedToday(habit.id, habitProgress);

    // For daily habits: completed for period = completed today
    // For weekly/monthly: completed for period = met target
    const isCompletedForPeriod =
      cadence === 'daily' ? isCompletedToday : completedThisPeriod >= targetPerPeriod;

    // Track if habit is ahead of target (for weekly/monthly habits)
    const isAheadOfTarget = cadence !== 'daily' && completedThisPeriod >= targetPerPeriod;

    const habitWithMeta: HabitWithMeta = {
      habit,
      cadence,
      streakDays,
      completedThisPeriod,
      targetPerPeriod,
      frequencyLabel: getFrequencyLabel(habit),
      isCompletedForPeriod,
      isCompletedToday,
      isAheadOfTarget,
    };

    // Sort into appropriate group
    // Key change: Only move to "completed" if completed TODAY
    // Habits that are "ahead" for the period but not done today stay visible
    if (isCompletedToday) {
      result.completed.push(habitWithMeta);
    } else {
      // Safety check: ensure cadence is a valid key
      const targetGroup = result[cadence];
      if (targetGroup) {
        targetGroup.push(habitWithMeta);
      } else {
        // Fallback to daily if cadence is unexpected
        result.daily.push(habitWithMeta);
      }
    }
  }

  return result;
}

/**
 * Get total count of habits still needing attention.
 */
export function getOpenHabitsCount(grouped: GroupedHabits): number {
  return grouped.daily.length + grouped.weekly.length + grouped.monthly.length;
}

/**
 * Check if all habit groups are empty (no habits to show).
 */
export function isHabitsEmpty(grouped: GroupedHabits): boolean {
  return (
    grouped.daily.length === 0 &&
    grouped.weekly.length === 0 &&
    grouped.monthly.length === 0 &&
    grouped.completed.length === 0
  );
}
