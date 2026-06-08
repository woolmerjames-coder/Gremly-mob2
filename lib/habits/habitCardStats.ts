/**
 * habitCardStats — per-habit stats for the weekly sweep habits deck.
 *
 * Window: rolling 7 days ending today (today = last cell) for ALL cadences.
 * No future cells. All 7 cells tappable (past + today).
 *
 * Composes existing streakUtils + frequencyUtils; does NOT duplicate streak math.
 * No AI, no gauge side-effects.
 *
 * NOTE: monthly habits use a rolling-7d window — this is imperfect for monthly
 * cadence but accepted; flagged for future per-cadence refinement.
 */

import { useMemo } from 'react';
import { getDateService } from '../date/DateService';
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
  dayLabel: string; // single char derived from the actual weekday
  isToday: boolean;
  isFuture: boolean; // always false in rolling window
  isCompleted: boolean;
  isScheduled: boolean; // always true in rolling window
}

export interface HabitCardStats {
  id: string;
  name: string;
  cadence: string;
  frequencyLabel: string;
  weekHits: number;
  weekTarget: number;
  /** 30-day completion percentage (0-100, integer). */
  pct30: number;
  streak: { count: number; unit: 'day' | 'week' };
  days: HabitDayCell[];
  status: 'on_track' | 'needs_attention' | 'done_for_week';
}

// One-char weekday labels indexed by JS getDay() (0=Sun)
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

  // ── Rolling 7-day window (ALL cadences) ──────────────────────────────────
  // Index 0 = today-6, index 6 = today. No future cells, all tappable.
  const days: HabitDayCell[] = Array.from({ length: 7 }, (_, i) => {
    const date = ds.addDays(today, -(6 - i));
    const jsDate = ds.fromLocalDate(date) ?? ds.now();
    return {
      date,
      dayLabel: WEEKDAY_LABELS[jsDate.getDay()],
      isToday: date === today,
      isFuture: false,
      isCompleted: completedDaySet.has(date),
      isScheduled: true,
    };
  });

  // ── weekHits / weekTarget ─────────────────────────────────────────────────
  const weekHits = days.filter((d) => d.isCompleted).length;
  const weekTarget = cadence === 'daily' ? 7 : targetPerPeriod;

  // ── pct30 ─────────────────────────────────────────────────────────────────
  const last30Start = ds.addDays(today, -29);
  const distinctDaysIn30 = new Set(
    progressForHabit
      .filter((p) => p.occurred_day >= last30Start && p.occurred_day <= today)
      .map((p) => p.occurred_day),
  ).size;

  let pct30Denominator: number;
  if (cadence === 'daily') {
    pct30Denominator = 30;
  } else if (cadence === 'weekly') {
    // ~4.286 weeks in 30 days
    pct30Denominator = Math.max(1, Math.round(targetPerPeriod * 4.286));
  } else {
    // monthly: ~1 month
    pct30Denominator = Math.max(1, targetPerPeriod);
  }
  const pct30 = Math.min(100, Math.round((distinctDaysIn30 / pct30Denominator) * 100));

  // ── Streak ───────────────────────────────────────────────────────────────
  const allCompletedDates = progressForHabit.map((p) => p.occurred_day);
  const streak = computeHabitStreak(allCompletedDates, cadence, targetPerPeriod);

  // ── Status ───────────────────────────────────────────────────────────────
  let status: HabitCardStats['status'];

  if (cadence === 'daily') {
    // Mirror computeDailyStats: done if 7/7; on_track if missed<=1; else needs_attention
    const missedCount = 7 - weekHits;
    if (weekHits >= 7) {
      status = 'done_for_week';
    } else if (missedCount <= 1) {
      status = 'on_track';
    } else {
      status = 'needs_attention';
    }
  } else {
    // weekly / monthly rolling-7d: done if target met; on_track if partial; else no activity
    if (weekHits >= weekTarget) {
      status = 'done_for_week';
    } else if (weekHits > 0) {
      status = 'on_track';
    } else {
      status = 'needs_attention';
    }
  }

  return {
    id: habit.id,
    name: habit.name ?? '',
    cadence,
    frequencyLabel: getHabitFrequencyLabel(habit) ?? '',
    weekHits,
    weekTarget,
    pct30,
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
