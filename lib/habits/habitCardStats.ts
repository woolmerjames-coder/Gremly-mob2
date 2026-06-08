/**
 * habitCardStats — per-habit stats for the weekly sweep habits deck.
 *
 * Window is cadence-aware:
 *   daily    → rolling 7 days ending today (today is last cell)
 *   weekly / monthly → calendar week Mon-Sun via getStartOfWeek()
 *
 * Composes existing streakUtils + frequencyUtils; does NOT duplicate streak math.
 * No AI, no gauge side-effects.
 */

import { useMemo } from 'react';
import { getDateService, getStartOfWeek } from '../date/DateService';
import type { HabitProgressRow } from '../store/useGremlyStore';
import { useGremlyStore } from '../store/useGremlyStore';
import { computeHabitStreak } from './streakUtils';
import { getHabitFrequencyLabel } from './frequencyUtils';
import type { Habit } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HabitDayCell {
  date: string; // YYYY-MM-DD
  dayLabel: string; // 'M' | 'T' | 'W' | 'T' | 'F' | 'S' | 'S'
  isToday: boolean;
  isFuture: boolean;
  isCompleted: boolean;
  isScheduled: boolean;
}

export interface HabitCardStats {
  id: string;
  name: string;
  cadence: string;
  frequencyLabel: string;
  weekHits: number;
  weekTarget: number;
  streak: { count: number; unit: 'day' | 'week' };
  days: HabitDayCell[];
  status: 'on_track' | 'needs_attention' | 'done_for_week';
}

// Mon-Sun one-char labels (used for calendar-week window)
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// All-week day labels indexed by JS getDay() (0=Sun)
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ─────────────────────────────────────────────────────────────────────────────
// Pure computation
// ─────────────────────────────────────────────────────────────────────────────

export function computeHabitCardStats(
  habit: Habit,
  habitProgress: HabitProgressRow[],
): HabitCardStats {
  const ds = getDateService();
  const today = ds.today();
  const cadence = habit.cadence ?? 'daily';
  const targetPerPeriod = habit.target_per_period ?? 1;

  const progressForHabit = habitProgress.filter((p) => p.habit_id === habit.id);
  const completedDaySet = new Set(progressForHabit.map((p) => p.occurred_day));

  // ── Window: daily = rolling 7d ending today; weekly/monthly = Mon-Sun ──────
  let days: HabitDayCell[];

  if (cadence === 'daily') {
    // Rolling 7 days: index 0 = today-6, index 6 = today
    days = Array.from({ length: 7 }, (_, i) => {
      const date = ds.addDays(today, -(6 - i));
      const jsDate = ds.fromLocalDate(date) ?? ds.now();
      return {
        date,
        dayLabel: WEEKDAY_LABELS[jsDate.getDay()],
        isToday: date === today,
        isFuture: false, // rolling window never includes future days
        isCompleted: completedDaySet.has(date),
        isScheduled: true, // daily = every day
      };
    });
  } else {
    // Calendar week: Mon-Sun
    // NOTE: monthly uses Mon-Sun window (same as weekly). This is a known
    // limitation — flagged for future fix, left as-is per v7-1 spec.
    const weekStart = getStartOfWeek();
    days = Array.from({ length: 7 }, (_, i) => {
      const date = ds.addDays(weekStart, i);
      return {
        date,
        dayLabel: DAY_LABELS[i],
        isToday: date === today,
        isFuture: date > today,
        isCompleted: completedDaySet.has(date),
        isScheduled: true, // filled below via days_active
      };
    });

    // Mark scheduled days via days_active (0=Sun..6=Sat → Mon-based index)
    if (habit.days_active && habit.days_active.length > 0) {
      const scheduledSet = new Set(habit.days_active.map((d) => (d === 0 ? 6 : d - 1)));
      for (let i = 0; i < days.length; i++) {
        days[i].isScheduled = scheduledSet.has(i);
      }
    }
  }

  // ── weekHits / weekTarget ─────────────────────────────────────────────────
  let weekHits: number;
  let weekTarget: number;

  if (cadence === 'daily') {
    // All 7 cells are past or today — count every completed one
    weekHits = days.filter((d) => d.isCompleted).length;
    weekTarget = 7;
  } else {
    // weekly / monthly: only count non-future completions
    weekHits = days.filter((d) => d.isCompleted && !d.isFuture).length;
    weekTarget = targetPerPeriod;
  }

  // ── Streak ───────────────────────────────────────────────────────────────
  const allCompletedDates = progressForHabit.map((p) => p.occurred_day);
  const streak = computeHabitStreak(allCompletedDates, cadence, targetPerPeriod);

  // ── Status ───────────────────────────────────────────────────────────────
  let status: HabitCardStats['status'];

  if (cadence === 'daily') {
    // Mirror useWeeklyHabitStats.computeDailyStats logic
    const missedCount = 7 - weekHits;
    if (weekHits >= 7) {
      status = 'done_for_week';
    } else if (missedCount <= 1) {
      status = 'on_track';
    } else {
      status = 'needs_attention';
    }
  } else {
    // weekly / monthly: done when target met; behind if fewer than expected by now
    const daysElapsed = days.filter((d) => !d.isFuture).length;
    const expectedByNow = Math.round((daysElapsed / 7) * targetPerPeriod);
    if (weekHits >= weekTarget) {
      status = 'done_for_week';
    } else if (weekHits < expectedByNow) {
      status = 'needs_attention';
    } else {
      status = 'on_track';
    }
  }

  return {
    id: habit.id,
    name: habit.name ?? '',
    cadence,
    frequencyLabel: getHabitFrequencyLabel(habit) ?? '',
    weekHits,
    weekTarget,
    streak,
    days,
    status,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook
// ─────────────────────────────────────────────────────────────────────────────

export function useHabitCardStats(habits: Habit[]): HabitCardStats[] {
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  return useMemo(
    () => habits.map((h) => computeHabitCardStats(h, habitProgress)),
    [habits, habitProgress],
  );
}
