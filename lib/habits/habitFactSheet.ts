/**
 * habitFactSheet — assembles the per-habit fact sheet payload for the
 * Cortex 'habit-read' route (Phase 3a).
 *
 * COMPUTED ONLY. No AI, no network, no gauge side-effects. Pure functions.
 *
 * Design rules (corpus-derived, do not relax):
 *   1. trend_weeks carries COMPLETED ISO weeks only, from first activity
 *      onward, with NO minimum-week display gate. computeHabitCardStats'
 *      trend is a UI artifact (3-week minimum, includes the current week)
 *      and must never feed this payload; reusing it starved eligibility for
 *      young habits in corpus run v3.
 *   2. week_hits / week_target are the only source of truth about the
 *      current week. They come straight from HabitCardStats (rolling 7d,
 *      pause-aware).
 *   3. Streak comes from HabitCardStats (real streakUtils, adaptation-aware),
 *      never reapproximated.
 *   4. The worker (habitRead.js) enforces caps, eligibility, and event
 *      downselect; this module does not pre-filter habits.
 */

import { getDateService } from '../date/DateService';
import type {
  HabitProgressRow,
  HabitAdaptationRow,
  HabitPlanRow,
  HabitTargetHistoryRow,
} from '../store/useGremlyStore';
import type { HabitCardStats } from './habitCardStats';
import { computeFrequencyRecommendation } from './habitFrequencyRecommendation';
import type { Habit } from '../types';

export const HABIT_READ_VERSION = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Payload types (mirror the habitRead.js contract)
// ─────────────────────────────────────────────────────────────────────────────

export interface FactSheetTrendWeek {
  week_start: string; // Monday, YYYY-MM-DD
  hits: number;
  target: number;
}

export interface HabitFactSheet {
  habit_id: string;
  name: string;
  cadence: string;
  subtype: string;
  target_per_period: number;
  week_hits: number;
  week_target: number;
  streak: { count: number; unit: 'day' | 'week' };
  trend_weeks: FactSheetTrendWeek[];
  completion_days: string[]; // last 56d, capped 80
  planned_dates: string[];
  best_day: string | null; // all-time best weekday, e.g. "Tuesdays" (matches card render)
  total_completions: number;
  tracking_since: string | null;
  floor_note: string | null;
  freq_rec: { chips: number[]; typical: number; current: number } | null;
  adaptations: { mode: string; start: string; end: string }[];
}

export interface HabitReadSignalEvent {
  ref: string; // "cal:<id>"
  title: string;
  start: string; // YYYY-MM-DD
  end: string;
  all_day: boolean;
}

export interface HabitReadSignalNote {
  ref: string; // "note:<id>"
  title: string;
  body: string | null;
  start: string;
  end: string;
}

export interface HabitReadDisruption {
  ref: string;
  label: string;
  start: string;
  end: string;
  ideas: string[];
  offer_pause: boolean;
}

export interface HabitRead {
  read_paragraph: string | null;
  frequency_line: string | null;
  disruption: HabitReadDisruption | null;
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend: completed ISO weeks, no display gate (rule 1)
// ─────────────────────────────────────────────────────────────────────────────

function isoWeekMonday(dateStr: string): string {
  const ds = getDateService();
  const d = ds.fromLocalDate(dateStr);
  if (!d) return dateStr;
  const day = d.getDay(); // 0=Sun
  return ds.addDays(dateStr, day === 0 ? -6 : 1 - day);
}

/**
 * The target_per_period in effect for the given habit during the week starting
 * weekStartKey. Picks the latest history row with effective_from <= weekStartKey.
 * Falls back to currentTarget when no history row covers that week.
 */
export function targetForWeek(
  history: HabitTargetHistoryRow[],
  habitId: string,
  weekStartKey: string,
  currentTarget: number,
): number {
  const rows = history
    .filter((h) => h.habit_id === habitId && h.effective_from <= weekStartKey)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return rows[0]?.target_per_period ?? currentTarget;
}

function computeCompletedTrendWeeks(
  habitId: string,
  completionDays: string[],
  cadence: string,
  targetPerPeriod: number,
  habitTargetHistory: HabitTargetHistoryRow[],
  today: string,
): FactSheetTrendWeek[] {
  const ds = getDateService();
  const currentMon = isoWeekMonday(today);
  // Last 6 COMPLETED weeks: currentMon-42 .. currentMon-7. The in-progress
  // ISO week is excluded by construction (rule 2).
  const weekKeys: string[] = [];
  for (let i = 6; i >= 1; i--) {
    weekKeys.push(ds.addDays(currentMon, -i * 7));
  }
  const hitsMap = new Map<string, Set<string>>();
  for (const day of completionDays) {
    const key = isoWeekMonday(day);
    if (!hitsMap.has(key)) hitsMap.set(key, new Set());
    hitsMap.get(key)!.add(day);
  }
  const firstIdx = weekKeys.findIndex((k) => (hitsMap.get(k)?.size ?? 0) > 0);
  if (firstIdx === -1) return [];
  // In-span empty weeks are kept: a zero week between active weeks is real
  // information (a miss week the model may correlate with an event).
  return weekKeys.slice(firstIdx).map((key) => ({
    week_start: key,
    hits: hitsMap.get(key)?.size ?? 0,
    target:
      cadence === 'daily' ? 7 : targetForWeek(habitTargetHistory, habitId, key, targetPerPeriod),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fact sheet
// ─────────────────────────────────────────────────────────────────────────────

const DOW_SHORT_TO_FULL: Record<string, string> = {
  Sun: 'Sundays',
  Mon: 'Mondays',
  Tue: 'Tuesdays',
  Wed: 'Wednesdays',
  Thu: 'Thursdays',
  Fri: 'Fridays',
  Sat: 'Saturdays',
};

const WEEKDAY_FULL = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];

function weekdayIdx(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function bestOf(tally: number[]): string | null {
  const ranked = tally.map((count, idx) => ({ idx, count })).sort((a, b) => b.count - a.count);
  const top = ranked[0] ?? { idx: -1, count: 0 };
  const second = ranked[1] ?? { idx: -1, count: 0 };
  if (top.idx < 0 || top.count < 3 || top.count <= second.count) return null;
  return WEEKDAY_FULL[top.idx] ?? null;
}

export function buildHabitFactSheet(
  habit: Habit,
  card: HabitCardStats,
  habitProgress: HabitProgressRow[],
  habitAdaptations: HabitAdaptationRow[],
  habitPlans: HabitPlanRow[],
  habitTargetHistory: HabitTargetHistoryRow[],
): HabitFactSheet {
  const ds = getDateService();
  const today = ds.today();
  const cutoff56 = ds.addDays(today, -56);

  const completionDaysAll = [
    ...new Set(habitProgress.filter((p) => p.habit_id === habit.id).map((p) => p.occurred_day)),
  ].sort();
  const completionDays56 = completionDaysAll.filter((d) => d >= cutoff56).slice(-80);
  const tallyAll = new Array(7).fill(0);
  for (const d of completionDaysAll) {
    tallyAll[weekdayIdx(d)]++;
  }

  return {
    habit_id: card.id,
    name: card.name,
    cadence: card.cadence,
    subtype: card.subtype,
    target_per_period: card.targetPerPeriod,
    week_hits: card.weekHits,
    week_target: card.weekTarget,
    streak: { count: card.streak.count, unit: card.streak.unit },
    trend_weeks: computeCompletedTrendWeeks(
      habit.id,
      completionDaysAll,
      card.cadence,
      card.targetPerPeriod,
      habitTargetHistory,
      today,
    ),
    completion_days: completionDays56,
    planned_dates: [
      ...new Set(
        habitPlans
          .filter((p) => p.habit_id === habit.id && p.planned_date >= today)
          .map((p) => p.planned_date),
      ),
    ].sort(),
    best_day: bestOf(tallyAll),
    total_completions: card.totalCompletions,
    tracking_since: card.trackingSince,
    floor_note: (habit.floor_note as string | null) ?? null,
    freq_rec: (() => {
      const rec = computeFrequencyRecommendation(habit, habitProgress);
      return rec.show
        ? { chips: rec.chips, typical: rec.typicalPerPeriod, current: rec.currentTarget }
        : null;
    })(),
    adaptations: habitAdaptations
      .filter((a) => a.habit_id === habit.id && a.period_end >= today)
      .map((a) => ({ mode: a.mode, start: a.period_start, end: a.period_end })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Input hash: stable FNV-1a over block-identity inputs only. Cache keys
// already include week_start, so this hash should only reflect read version
// + habit identity to avoid mid-week regeneration.
// ─────────────────────────────────────────────────────────────────────────────

export function computeInputHash(
  factSheet: HabitFactSheet,
  events: { ref: string; title: string; start: string; end: string }[],
  eventNotes: { ref: string; title: string; start: string; end: string }[],
): string {
  // Keep params in signature for caller compatibility; hash no longer depends on them.
  void events;
  void eventNotes;

  const basis = JSON.stringify([HABIT_READ_VERSION, factSheet.habit_id]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
