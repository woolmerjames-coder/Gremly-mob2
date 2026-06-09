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
import type { HabitProgressRow, HabitAdaptationRow } from '../store/useGremlyStore';
import { useGremlyStore } from '../store/useGremlyStore';
import { computeHabitStreak, computeBestStreak } from './streakUtils';
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
  isPaused: boolean; // true if a pause adaptation covers this day
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
  /** Longest historical run of completions (calendar days). Lifted from computeBestStreak. */
  bestStreak: number;
  /** Pairing: the single most co-occurring other habit over the last 28 days, or null. */
  pairing: { name: string; coDays: number } | null;
  /** Week-over-week delta in hits: current ISO week hits minus prior ISO week hits. */
  wowDelta: number;
  /**
   * Most frequent completion weekday over the last 56 days, or null if no data.
   * NOTE: for the AI payload only — NOT rendered on the card strip.
   */
  bestDay: { weekday: string; count: number } | null;
  /** Most frequent completion weekday over full history, or null if no completions. */
  bestDayAllTime: string | null; // e.g. "Fridays"
  /** Lifetime completion count. */
  totalCompletions: number;
  /** Declared start: start_date, fallback created_at. ISO YYYY-MM-DD or null. */
  trackingSince: string | null;
  /** 'start_habit' (build) or 'break_habit'. From habit.subtype. */
  subtype: string;
  /** Convenience: true when subtype === 'break_habit'. */
  isBreak: boolean;
}

// One-char weekday labels indexed by JS getDay() (0=Sun)
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_FULL = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Strip + AI helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Top co-occurring other habit over last 28 days (matches habitInsight pairing). */
function computeTopPairing(
  habitId: string,
  habitProgress: HabitProgressRow[],
  allHabits: Habit[],
  today: string,
): { name: string; coDays: number } | null {
  const ds = getDateService();
  const cutoff4w = ds.addDays(today, -28);
  const myDays = new Set(
    habitProgress
      .filter((p) => p.habit_id === habitId && p.occurred_day >= cutoff4w)
      .map((p) => p.occurred_day),
  );
  if (myDays.size === 0) return null;

  const counts = new Map<string, { count: number; name: string }>();
  for (const p of habitProgress) {
    if (p.habit_id === habitId) continue;
    if (!myDays.has(p.occurred_day)) continue;
    const existing = counts.get(p.habit_id);
    if (existing) {
      existing.count++;
    } else {
      const h = allHabits.find((x) => x.id === p.habit_id);
      if (h?.name) counts.set(p.habit_id, { count: 1, name: h.name });
    }
  }
  let top: { name: string; coDays: number } | null = null;
  for (const v of counts.values()) {
    if (!top || v.count > top.coDays) top = { name: v.name, coDays: v.count };
  }
  return top;
}

/** Most frequent completion weekday over last 56 days. AI payload only. */
function computeBestDay(
  progressForHabit: HabitProgressRow[],
  today: string,
): { weekday: string; count: number } | null {
  const ds = getDateService();
  const cutoff8w = ds.addDays(today, -56);
  const tally = new Map<string, number>();
  for (const p of progressForHabit) {
    if (p.occurred_day < cutoff8w) continue;
    const d = ds.fromLocalDate(p.occurred_day);
    if (!d) continue;
    const dow = DOW_NAMES[d.getDay()];
    tally.set(dow, (tally.get(dow) ?? 0) + 1);
  }
  let best: { weekday: string; count: number } | null = null;
  for (const [weekday, count] of tally.entries()) {
    if (!best || count > best.count) best = { weekday, count };
  }
  return best;
}

/** Week-over-week hit delta: current ISO week distinct-day hits minus prior week's. */
function computeWowDelta(progressForHabit: HabitProgressRow[], today: string): number {
  const ds = getDateService();
  const curKey = getIsoWeekKey(today);
  const prevKey = ds.addDays(curKey, -7);
  const distinctInWeek = (weekStart: string) => {
    const weekEnd = ds.addDays(weekStart, 6);
    return new Set(
      progressForHabit
        .filter((p) => p.occurred_day >= weekStart && p.occurred_day <= weekEnd)
        .map((p) => p.occurred_day),
    ).size;
  };
  return distinctInWeek(curKey) - distinctInWeek(prevKey);
}

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

  // Find the first week in the window that has data; include EVERY week from
  // there to now (in-span empty weeks count as misses, not dropped).
  const firstIdxWithData = weekKeys.findIndex((k) => (hitsMap.get(k)?.size ?? 0) >= 1);

  if (firstIdxWithData === -1) {
    return { bars: [], read: null };
  }

  const spanKeys = weekKeys.slice(firstIdxWithData); // first activity → current

  // Need at least 3 weeks of span to form a trend read.
  if (spanKeys.length < 3) {
    return { bars: [], read: null };
  }

  const bars: TrendBar[] = spanKeys.map((key) => {
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
  adaptations: HabitAdaptationRow[] = [],
  allHabits: Habit[] = [],
): HabitCardStats {
  const ds = getDateService();
  const today = ds.today();
  const cadence = habit.cadence ?? 'daily';
  const targetPerPeriod = habit.target_per_period ?? 1;
  const subtype = (habit.subtype as string) ?? 'start_habit';
  const isBreak = subtype === 'break_habit';

  const progressForHabit = habitProgress.filter((p) => p.habit_id === habit.id);
  const adaptationsForHabit = adaptations.filter((a) => a.habit_id === habit.id);
  const completedDaySet = new Set(progressForHabit.map((p) => p.occurred_day));

  /** True if a YYYY-MM-DD day is fully inside a pause window */
  const isPaused = (day: string): boolean =>
    adaptationsForHabit.some(
      (a) => a.mode === 'pause' && a.period_start <= day && a.period_end >= day,
    );

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
      isPaused: isPaused(date),
    };
  });

  // ── weekHits / weekTarget ─────────────────────────────────────────────────
  // Paused days are excluded from both numerator and denominator.
  const weekHits = days.filter((d) => d.isCompleted && !isPaused(d.date)).length;
  const activeDaysInWindow = days.filter((d) => !isPaused(d.date)).length;
  const weekTarget =
    cadence === 'daily'
      ? activeDaysInWindow // daily: target = scheduled active days
      : targetPerPeriod;

  // ── pct30 ─────────────────────────────────────────────────────────────────
  const last30Start = ds.addDays(today, -29);
  // Count paused days in the 30-day window to shrink the denominator
  let pausedDaysIn30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = ds.addDays(today, -(29 - i));
    if (isPaused(d)) pausedDaysIn30++;
  }
  const distinctDaysIn30 = new Set(
    progressForHabit
      .filter(
        (p) =>
          p.occurred_day >= last30Start && p.occurred_day <= today && !isPaused(p.occurred_day),
      )
      .map((p) => p.occurred_day),
  ).size;

  let pct30Denominator: number;
  if (cadence === 'daily') {
    pct30Denominator = Math.max(1, 30 - pausedDaysIn30);
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
  const streak = computeHabitStreak(
    allCompletedDates,
    cadence,
    targetPerPeriod,
    adaptationsForHabit,
  );
  const bestStreak = computeBestStreak(allCompletedDates);
  // ── Trend ────────────────────────────────────────────────────────────────
  const barTarget = cadence === 'daily' ? 7 : targetPerPeriod;
  const trend = computeTrend(progressForHabit, barTarget, today);
  // ── Strip + AI fields ────────────────────────────────────────────────────────
  const pairing = computeTopPairing(habit.id, habitProgress, allHabits, today);
  const wowDelta = computeWowDelta(progressForHabit, today);
  const bestDay = computeBestDay(progressForHabit, today);
  // ── Lifetime stats ────────────────────────────────────────────────────────
  const totalCompletions = progressForHabit.length;
  let bestDayAllTime: string | null = null;
  if (progressForHabit.length > 0) {
    const tally = new Array(7).fill(0);
    for (const p of progressForHabit) {
      const d = ds.fromLocalDate(p.occurred_day);
      if (d) tally[d.getDay()]++;
    }
    let bestIdx = -1;
    let bestN = 0;
    for (let i = 0; i < 7; i++) {
      if (tally[i] > bestN) {
        bestN = tally[i];
        bestIdx = i;
      }
    }
    bestDayAllTime = bestIdx >= 0 ? WEEKDAY_FULL[bestIdx] : null;
  }
  const trackingSince =
    (habit.start_date as string | null) ??
    (habit.created_at ? ds.extractLocalDate(habit.created_at) : null) ??
    null;
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
    bestStreak,
    pairing,
    wowDelta,
    bestDay,
    bestDayAllTime,
    totalCompletions,
    trackingSince,
    subtype,
    isBreak,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook
// ─────────────────────────────────────────────────────────────────────────────

export function useHabitCardStats(habits: Habit[]): HabitCardStats[] {
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const habitAdaptations = useGremlyStore((s) => s.habitAdaptations);
  return useMemo(
    () => habits.map((h) => computeHabitCardStats(h, habitProgress, habitAdaptations, habits)),
    [habits, habitProgress, habitAdaptations],
  );
}
