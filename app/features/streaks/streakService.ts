/**
 * Phase 10.9: Streak Service
 *
 * Computes daily activity streaks from completions (todos + habit checkins).
 * Provides milestone detection for celebration triggers.
 */

import { getDateService } from '../../../lib/date';

export interface StreakResult {
  currentStreak: number;
  lastActivityDate?: string; // YYYY-MM-DD
  isToday: boolean;
  crossedMilestone?: number; // 2, 3, 7, 14
}

const MILESTONES = [2, 3, 7, 14, 21, 30, 60, 90, 180, 365];

/**
 * Calculate current streak from activity dates
 * @param activityDates Array of YYYY-MM-DD dates with any completion
 * @returns StreakResult with current streak count and milestone info
 */
export function getCurrentStreak(activityDates: string[]): StreakResult {
  if (activityDates.length === 0) {
    return {
      currentStreak: 0,
      isToday: false,
    };
  }

  // Sort dates descending (most recent first)
  const sortedDates = [...new Set(activityDates)].sort((a, b) => b.localeCompare(a));

  const ds = getDateService();
  const today = ds.ritualDay();
  const yesterday = ds.addDays(today, -1);

  // Check if streak is active (today or yesterday)
  const mostRecent = sortedDates[0];
  const isToday = mostRecent === today;
  const isYesterday = mostRecent === yesterday;

  if (!isToday && !isYesterday) {
    // Streak is broken
    return {
      currentStreak: 0,
      lastActivityDate: mostRecent,
      isToday: false,
    };
  }

  // Count contiguous days working backwards
  let streakCount = 0;
  let checkDate = isToday ? today : yesterday;

  for (let i = 0; i < sortedDates.length; i++) {
    if (sortedDates[i] === checkDate) {
      streakCount++;
      checkDate = getDateService().addDays(checkDate, -1);
    } else {
      // Gap found, break
      break;
    }
  }

  return {
    currentStreak: streakCount,
    lastActivityDate: mostRecent,
    isToday,
  };
}

/**
 * Detect if crossing a milestone threshold
 * @param previousStreak Previous streak count
 * @param currentStreak Current streak count
 * @returns Milestone number if crossed, undefined otherwise
 */
export function detectMilestoneCrossed(
  previousStreak: number,
  currentStreak: number,
): number | undefined {
  for (const milestone of MILESTONES) {
    if (previousStreak < milestone && currentStreak >= milestone) {
      return milestone;
    }
  }
  return undefined;
}

/**
 * Check if a streak count is at a milestone
 */
export function isMilestone(streakCount: number): boolean {
  return MILESTONES.includes(streakCount);
}

/**
 * Get next milestone from current streak
 */
export function getNextMilestone(currentStreak: number): number | undefined {
  return MILESTONES.find((m) => m > currentStreak);
}
