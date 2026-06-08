/**
 * habitCardStats — per-habit stats for the weekly sweep habits deck.
 *
 * Calendar-week (Mon-Sun) framed, NOT rolling-7d.
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

// Mon-Sun one-char labels
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ─────────────────────────────────────────────────────────────────────────────
// Pure computation
// ─────────────────────────────────────────────────────────────────────────────

export function computeHabitCardStats(
  habit: Habit,
  habitProgress: HabitProgressRow[],
): HabitCardStats {
  const ds = getDateService();
  const today = ds.today();
  const weekStart = getStartOfWeek(); // Monday YYYY-MM-DD (timezone-correct)

  // Build Mon-Sun 7-day array
  const days: HabitDayCell[] = Array.from({ length: 7 }, (_, i) => {
    const date = ds.addDays(weekStart, i);
    return {
      date,
      dayLabel: DAY_LABELS[i],
      isToday: date === today,
      isFuture: date > today,
      isCompleted: false, // filled below
      isScheduled: true, // filled below
    };
  });

  // Mark completions from habitProgress
  const progressForHabit = habitProgress.filter((p) => p.habit_id === habit.id);
  const completedDaySet = new Set(progressForHabit.map((p) => p.occurred_day));
  for (const cell of days) {
    cell.isCompleted = completedDaySet.has(cell.date);
  }

  // Mark scheduled days via days_active (0=Sun..6=Sat → shift to Mon-based index)
  if (habit.days_active && habit.days_active.length > 0) {
    // days_active uses 0=Sunday; our array index 0=Monday.
    // Convert: Mon=1,Tue=2,...,Sun=0 → array index 0..6
    const scheduledSet = new Set(habit.days_active.map((d) => (d === 0 ? 6 : d - 1)));
    for (let i = 0; i < days.length; i++) {
      days[i].isScheduled = scheduledSet.has(i);
    }
  }

  // weekHits = completed and not future (don't count accidental future entries)
  const weekHits = days.filter((d) => d.isCompleted && !d.isFuture).length;

  // weekTarget:
  //   daily → count of days elapsed this week (Mon..today, inclusive) — i.e. min(daysElapsed,7)
  //   weekly / monthly → target_per_period (default 1)
  const cadence = habit.cadence ?? 'daily';
  const targetPerPeriod = habit.target_per_period ?? 1;
  let weekTarget: number;
  if (cadence === 'daily') {
    const daysElapsed = days.filter((d) => !d.isFuture).length;
    weekTarget = Math.max(1, daysElapsed);
  } else {
    weekTarget = targetPerPeriod;
  }

  // Streak — delegate entirely to computeHabitStreak
  const allCompletedDates = progressForHabit.map((p) => p.occurred_day);
  const streak = computeHabitStreak(allCompletedDates, cadence, targetPerPeriod);

  // Status
  const daysElapsed = days.filter((d) => !d.isFuture).length;
  const expectedByNow =
    cadence === 'daily' ? daysElapsed : Math.round((daysElapsed / 7) * targetPerPeriod);

  let status: HabitCardStats['status'];
  if (weekHits >= weekTarget) {
    status = 'done_for_week';
  } else if (weekHits < expectedByNow) {
    status = 'needs_attention';
  } else {
    status = 'on_track';
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
