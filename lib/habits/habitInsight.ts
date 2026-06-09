/**
 * habitInsight — per-habit weekly insight assembly (no AI).
 *
 * buildHabitInsightInput assembles the { facts, crossSignal } payload sent to
 * the cortex-proxy 'habit-insight' endpoint. All data comes from existing store
 * arrays — no new DB queries required.
 */

import { getDateService } from '../date/DateService';
import type { HabitProgressRow } from '../store/useGremlyStore';
import type { Habit, Note } from '../types';
import { computeHabitCardStats } from './habitCardStats';
import type { HabitAdaptationRow } from '../store/useGremlyStore';

// ─────────────────────────────────────────────────────────────────────────────
// Result type (returned by the endpoint and cached in the store)
// ─────────────────────────────────────────────────────────────────────────────

export interface HabitInsightResult {
  show: boolean;
  line: string | null;
  kind:
    | 'day_of_week_pattern'
    | 'pairing'
    | 'journal_link'
    | 'building'
    | 'drifting'
    | 'steady'
    | 'adapted'
    | 'target_mismatch'
    | 'other'
    | null;
  /** Cached key: habitId + '_' + observedForWeek (YYYY-MM-DD Monday) */
  observedForWeek: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input payload shape (sent to cortex-proxy)
// ─────────────────────────────────────────────────────────────────────────────

export interface HabitInsightInput {
  facts: {
    name: string;
    cadence: string;
    target_per_period: number;
    weekHits: number;
    weekTarget: number;
    streak: { count: number; unit: 'day' | 'week' };
    pct30: number;
    /** 7-element array: one entry per rolling-window day, oldest first */
    dayPattern: Array<{ date: string; dayLabel: string; hit: boolean }>;
    trend: {
      read: 'building' | 'steady' | 'drifting' | null;
      bars: Array<{ weekLabel: string; hits: number; target: number }>;
    };
  };
  crossSignal: {
    /** Count of completions per weekday name (Mon-Sun) over last ~8 weeks */
    dayOfWeekDistribution: Partial<Record<string, number>>;
    /** Names of other habits frequently done on the same day (top 3) */
    pairings: string[];
    /** Short body snippets from journal notes within +/-1 day of a completion */
    journalNearCompletions: string[];
    /** Current week's intention note body if any */
    weekIntention: string | null;
  };
}

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Assemble the insight payload for a single habit from in-memory store data.
 * Pure function — no side effects, no DB calls.
 */
export function buildHabitInsightInput(
  habitId: string,
  habits: Habit[],
  habitProgress: HabitProgressRow[],
  habitAdaptations: HabitAdaptationRow[],
  notes: Note[],
): HabitInsightInput | null {
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) return null;

  const ds = getDateService();
  const today = ds.today();
  const stats = computeHabitCardStats(habit, habitProgress, habitAdaptations);
  const progressForHabit = habitProgress.filter((p) => p.habit_id === habitId);

  // ── facts ───────────────────────────────────────────────────────────────
  const facts: HabitInsightInput['facts'] = {
    name: habit.name ?? '',
    cadence: habit.cadence ?? 'daily',
    target_per_period: habit.target_per_period ?? 1,
    weekHits: stats.weekHits,
    weekTarget: stats.weekTarget,
    streak: stats.streak,
    pct30: stats.pct30,
    dayPattern: stats.days.map((d) => ({
      date: d.date,
      dayLabel: d.dayLabel,
      hit: d.isCompleted,
    })),
    trend: {
      read: stats.trend.read,
      bars: stats.trend.bars.map((b) => ({
        weekLabel: b.weekLabel,
        hits: b.hits,
        target: b.target,
      })),
    },
  };

  // ── crossSignal: dayOfWeekDistribution (last 56 days) ──────────────────
  const cutoff8w = ds.addDays(today, -56);
  const dayOfWeekDistribution: Partial<Record<string, number>> = {};
  for (const p of progressForHabit) {
    if (p.occurred_day < cutoff8w) continue;
    const d = ds.fromLocalDate(p.occurred_day);
    if (!d) continue;
    const dow = DOW_NAMES[d.getDay()];
    dayOfWeekDistribution[dow] = (dayOfWeekDistribution[dow] ?? 0) + 1;
  }

  // ── crossSignal: pairings (last 28 days, top 3 other habits by co-occurrence) ──
  const cutoff4w = ds.addDays(today, -28);
  const habitCompletionDays = new Set(
    progressForHabit.filter((p) => p.occurred_day >= cutoff4w).map((p) => p.occurred_day),
  );
  // For every other habit, count how many of its completion days overlap
  const coOccurrenceCount = new Map<string, { count: number; name: string }>();
  for (const p of habitProgress) {
    if (p.habit_id === habitId) continue;
    if (!habitCompletionDays.has(p.occurred_day)) continue;
    const entry = coOccurrenceCount.get(p.habit_id);
    if (entry) {
      entry.count++;
    } else {
      const h = habits.find((x) => x.id === p.habit_id);
      if (h?.name) coOccurrenceCount.set(p.habit_id, { count: 1, name: h.name });
    }
  }
  const pairings = Array.from(coOccurrenceCount.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((x) => x.name);

  // ── crossSignal: journalNearCompletions (last 28 days, +/-1 day of completion) ──
  const journalNearCompletions: string[] = [];
  const journalNotes = notes.filter(
    (n) => n.subtype === 'journal' && !n.archived && n.body && n.body.length > 3,
  );
  for (const p of progressForHabit) {
    if (p.occurred_day < cutoff4w) continue;
    const dayBefore = ds.addDays(p.occurred_day, -1);
    const dayAfter = ds.addDays(p.occurred_day, 1);
    for (const n of journalNotes) {
      const noteDate = n.target_date ?? ds.extractLocalDate(n.created_at);
      if (!noteDate || noteDate < dayBefore || noteDate > dayAfter) continue;
      const snippet = (n.body ?? '').slice(0, 80);
      if (!journalNearCompletions.includes(snippet)) {
        journalNearCompletions.push(snippet);
      }
      if (journalNearCompletions.length >= 4) break;
    }
    if (journalNearCompletions.length >= 4) break;
  }

  // ── crossSignal: weekIntention ─────────────────────────────────────────
  const weekStart = ds.getStartOfWeek();
  const weekEnd = ds.addDays(weekStart, 6);
  const intentionNote = notes.find(
    (n) =>
      n.journal_subtype === 'intention' &&
      !n.archived &&
      n.target_date != null &&
      n.target_date >= weekStart &&
      n.target_date <= weekEnd,
  );
  const weekIntention = intentionNote?.body ?? null;

  return {
    facts,
    crossSignal: {
      dayOfWeekDistribution,
      pairings,
      journalNearCompletions,
      weekIntention,
    },
  };
}
