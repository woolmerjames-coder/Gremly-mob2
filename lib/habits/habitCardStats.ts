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

export interface TrendBar {
  weekLabel: string; // "5w" | "4w" | ... | "1w" | "now"
  hits: number;
  target: number;
  isCurrent: boolean;
}

export interface HabitTrend {
  /** Empty when < 3 weeks of data. */
  bars: TrendBar[];
  /** null when bars is empty (insufficient data). */
  read: 'building' | 'steady' | 'drifting' | null;
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
  trend: HabitTrend;
}

// One-char weekday labels indexed by JS getDay() (0=Sun)
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ─────────────────────────────────────────────────────────────────────────────
// Trend helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Return the YYYY-MM-DD Monday of the ISO week containing dateStr. */
function getIsoWeekKey(dateStr: string): string {
  const ds = getDateService();
  const d = ds.fromLocalDate(dateStr);
  if (!d) return dateStr;
  const day = d.getDay(); // 0=Sun
  const daysToMon = day === 0 ? -6 : 1 - day;
  return ds.addDays(dateStr, daysToMon);
}

/**
 * Compute trend bars over the last ≤6 ISO weeks ending with the current week.
 * Only weeks with >=1 hit are included. Returns { bars:[], read:null } when
 * fewer than 3 weeks have data (not enough to form a trend).
 */
function computeTrend(
  progressForHabit: HabitProgressRow[],
  barTarget: number,
  today: string,
): HabitTrend {
  const ds = getDateService();
  const currentWeekKey = getIsoWeekKey(today);

  // 6 consecutive Monday keys sorted oldest → current
  const weekKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    weekKeys.push(ds.addDays(currentWeekKey, -i * 7));
  }
  // weekKeys[0] = 5 weeks ago, weekKeys[5] = current

  // Bucket distinct occurred_day into week keys
  const hitsMap = new Map<string, Set<string>>();
  for (const p of progressForHabit) {
    const key = getIsoWeekKey(p.occurred_day);
    if (!hitsMap.has(key)) hitsMap.set(key, new Set());
    hitsMap.get(key)!.add(p.occurred_day);
  }

  // Keep only weeks in our window that have >=1 hit
  const weekKeysWithData = weekKeys.filter((k) => (hitsMap.get(k)?.size ?? 0) >= 1);

  if (weekKeysWithData.length < 3) {
    return { bars: [], read: null };
  }

  // Build bar objects; label = weeks-ago from current (0=now)
  const bars: TrendBar[] = weekKeysWithData.map((key) => {
    const hits = hitsMap.get(key)?.size ?? 0;
    const weekIdx = weekKeys.indexOf(key); // 0=oldest(5w ago), 5=current
    const weeksAgo = 5 - weekIdx;
    return {
      weekLabel: weeksAgo === 0 ? 'now' : `${weeksAgo}w`,
      hits,
      target: barTarget,
      isCurrent: key === currentWeekKey,
    };
  });

  // Compare recent half vs earlier half (target-relative ratio, capped at 1)
  const n = bars.length;
  const half = Math.floor(n / 2);
  const earlier = bars.slice(0, half);
  const recent = bars.slice(n - half);
  const avgRatio = (arr: TrendBar[]) =>
    arr.reduce((sum, b) => sum + Math.min(b.hits / b.target, 1), 0) / arr.length;
  const diff = avgRatio(recent) - avgRatio(earlier);
  const read: HabitTrend['read'] = diff > 0.15 ? 'building' : diff < -0.15 ? 'drifting' : 'steady';

  return { bars, read };
}

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

  // ── Trend ────────────────────────────────────────────────────────────────
  const barTarget = cadence === 'daily' ? 7 : targetPerPeriod;
  const trend = computeTrend(progressForHabit, barTarget, today);

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
    trend,
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
