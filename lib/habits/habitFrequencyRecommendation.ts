/**
 * habitFrequencyRecommendation — data-anchored frequency nudge for the sweep habits deck.
 *
 * COMPUTED ONLY — no AI, no model calls.
 *
 * Logic:
 *   - Buckets habit_progress into completed periods (excluding the current in-progress period).
 *   - Uses MEDIAN hits-per-period over the last up-to-8 completed periods.
 *   - Shows when periodsWithData >= 4 AND abs(typical - currentTarget) >= 1.
 *   - Daily habits: always show:false (frequency nudge is N/A for daily cadence in v7-2).
 *   - Monthly: uses Mon-Sun calendar-week bucketing (known limitation; flagged for future fix).
 *
 * No gauge side-effects. No abstract labels ("keep"/"push"/"ease"). Numbers only.
 */

import { getDateService, getStartOfWeek } from '../date/DateService';
import type { HabitProgressRow } from '../store/useGremlyStore';
import { getFrequencyDisplayLabel } from './frequencyUtils';
import type { Habit } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

export interface FrequencyRecommendation {
  show: boolean;
  cadence: 'daily' | 'weekly' | 'monthly';
  typicalPerPeriod: number;
  currentTarget: number;
  /** Chip values (integers). Labels via getFrequencyDisplayLabel(cadence, n). */
  chips: number[];
  sentence: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Integer median — never returns a float; ties round up. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Return the YYYY-MM-DD of the Monday of the ISO week containing dateStr.
 * Uses DateService.fromLocalDate (noon-anchored) so getDay() is timezone-safe.
 */
function getWeekKey(dateStr: string): string {
  const ds = getDateService();
  const d = ds.fromLocalDate(dateStr);
  if (!d) return dateStr;
  const day = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const daysToMon = day === 0 ? -6 : 1 - day;
  return ds.addDays(dateStr, daysToMon);
}

/** YYYY-MM period key for monthly bucketing. */
function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Build a contiguous chip range spanning [min(current,typical)..max(current,typical)],
 * clamped to [1..maxVal]. Both endpoints are always included (deduped).
 */
function buildChips(current: number, typical: number, cadence: 'weekly' | 'monthly'): number[] {
  const maxVal = cadence === 'weekly' ? 7 : 8;
  const lo = Math.max(1, Math.min(current, typical));
  const hi = Math.min(maxVal, Math.max(current, typical));
  const result: number[] = [];
  for (let n = lo; n <= hi; n++) {
    result.push(n);
  }
  // Safety: always include both endpoints (handles edge cases from clamping)
  const s = new Set(result);
  s.add(Math.max(1, Math.min(maxVal, current)));
  s.add(Math.max(1, Math.min(maxVal, typical)));
  return Array.from(s).sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function computeFrequencyRecommendation(
  habit: Habit,
  habitProgress: HabitProgressRow[],
): FrequencyRecommendation {
  const cadence = (habit.cadence ?? 'daily') as 'daily' | 'weekly' | 'monthly';
  const currentTarget = habit.target_per_period ?? 1;

  const noShow: FrequencyRecommendation = {
    show: false,
    cadence,
    typicalPerPeriod: currentTarget,
    currentTarget,
    chips: [],
    sentence: '',
  };

  // Daily habits: no frequency recommendation in v7-2
  if (cadence === 'daily') return noShow;

  const ds = getDateService();
  const today = ds.today();

  // Determine the current (in-progress) period key to exclude it
  const currentPeriodKey =
    cadence === 'weekly'
      ? getStartOfWeek() // Monday of the current week (DST-safe via Intl)
      : getMonthKey(today);

  // Filter progress for this habit only
  const progressForHabit = habitProgress.filter((p) => p.habit_id === habit.id);

  // Bucket distinct occurred_day values into completed periods
  const buckets = new Map<string, Set<string>>();
  for (const p of progressForHabit) {
    const key = cadence === 'weekly' ? getWeekKey(p.occurred_day) : getMonthKey(p.occurred_day);
    if (key === currentPeriodKey) continue; // exclude in-progress period
    if (!buckets.has(key)) buckets.set(key, new Set());
    buckets.get(key)!.add(p.occurred_day);
  }

  // Take the last up-to-8 completed periods (sorted chronologically)
  const allPeriodKeys = Array.from(buckets.keys()).sort();
  const recentPeriodKeys = allPeriodKeys.slice(-8);

  // Gate 1: need at least 4 periods with data
  const periodsWithData = recentPeriodKeys.filter((k) => (buckets.get(k)?.size ?? 0) >= 1).length;
  if (periodsWithData < 4) return noShow;

  // Compute median hits across all retained periods (including zero-hit ones, if any)
  const hitsPerPeriod = recentPeriodKeys.map((k) => buckets.get(k)?.size ?? 0);
  const typicalPerPeriod = median(hitsPerPeriod);

  // Gate 2: gap of at least 1 between typical and current target
  if (Math.abs(typicalPerPeriod - currentTarget) < 1) return noShow;

  const chips = buildChips(currentTarget, typicalPerPeriod, cadence);
  const periodWord = cadence === 'weekly' ? 'week' : 'month';
  const habitName = habit.name ?? 'this habit';

  const sentence = `You usually hit ${habitName} about ${typicalPerPeriod}x a ${periodWord}. Your current target is ${currentTarget}.`;

  return {
    show: true,
    cadence,
    typicalPerPeriod,
    currentTarget,
    chips,
    sentence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export label helper so UI can stay import-light
// ─────────────────────────────────────────────────────────────────────────────

export { getFrequencyDisplayLabel };
