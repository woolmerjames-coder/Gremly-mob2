/**
 * habitHelpers.ts - Helper functions for Sweep habit display
 *
 * Computes streaks, progress, and groups habits by cadence.
 * All computations use habitProgress from Zustand store.
 */

import type { Habit, Cadence } from '../types';
import type { HabitProgressRow } from '../store/useGremlyStore';

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
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Get date string for N days ago
 */
function getDateStringDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Get the start of the current week (Monday) as YYYY-MM-DD
 */
function getWeekStartDateString(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/**
 * Get the start of the current month as YYYY-MM-DD
 */
function getMonthStartDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
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
 */
export function getFrequencyLabel(habit: Habit): string {
  const cadence = habit.cadence ?? 'daily';
  const target = habit.target_per_period ?? 1;

  if (cadence === 'daily') {
    return 'Every day';
  } else if (cadence === 'weekly') {
    if (target === 1) return 'Once a week';
    if (target === 7) return 'Every day';
    return `${target}x per week`;
  } else if (cadence === 'monthly') {
    if (target === 1) return 'Once a month';
    return `${target}x per month`;
  }

  // Fallback to frequency string if set
  if (habit.frequency) {
    return habit.frequency;
  }

  return 'Every day';
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

    const cadence: Cadence = habit.cadence ?? 'daily';
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

    const habitWithMeta: HabitWithMeta = {
      habit,
      cadence,
      streakDays,
      completedThisPeriod,
      targetPerPeriod,
      frequencyLabel: getFrequencyLabel(habit),
      isCompletedForPeriod,
      isCompletedToday,
    };

    // Sort into appropriate group
    if (isCompletedForPeriod) {
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
