import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date';
import type { WeeklySummary } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TrendContext {
  priorWeekHighlights: Array<{
    weekStart: string;
    keyThemes: string[];
    insightTypesSurfaced: string[];
    cleanupActions: { kept: number; parked: number; dropped: number };
    statsSnapshot: {
      todosCompleted: number;
      journalEntries: number;
      mindDropsSwept: number;
    };
  }>;
  rollingTrends: {
    completionTrend: 'increasing' | 'declining' | 'stable';
    habitConsistencyTrend: 'increasing' | 'declining' | 'stable';
    captureToSweepTrend: 'widening' | 'narrowing' | 'stable';
    staleTrend: 'growing' | 'shrinking' | 'stable';
    workLifeBalanceTrend: string;
    insightFrequency: Record<string, number>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ds = () => getDateService();

/** Get Monday of the current week. */
function getCurrentMonday(): string {
  const today = ds().today();
  const date = ds().fromLocalDate(today);
  if (!date) return today;
  const dow = date.getDay(); // 0=Sun … 6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  return ds().addDays(today, offset);
}

/** Safely read a numeric value from a loose JSONB stats_snapshot. */
function statNum(snapshot: Record<string, unknown>, key: string): number {
  const val = snapshot?.[key];
  return typeof val === 'number' && isFinite(val) ? val : 0;
}

/**
 * Determine 3-state trend from an ordered series of numbers (oldest → newest).
 * Returns 'increasing' / 'declining' / 'stable' based on 10% threshold.
 */
function computeTrend(values: number[]): 'increasing' | 'declining' | 'stable' {
  if (values.length < 2) return 'stable';
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0 && last === 0) return 'stable';
  if (first === 0) return 'increasing'; // went from 0 to something
  const pctChange = (last - first) / first;
  if (pctChange >= 0.1) return 'increasing';
  if (pctChange <= -0.1) return 'declining';
  return 'stable';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildTrendContext(): TrendContext | null {
  const state = useGremlyStore.getState();
  const summaries: WeeklySummary[] = state.weeklySummaries ?? [];

  // Current week Monday — exclude from prior data
  const currentMonday = getCurrentMonday();

  // Sort descending by week_start_date, keep only prior weeks, take up to 4
  const priorSummaries = summaries
    .filter((s) => s.week_start_date < currentMonday)
    .sort((a, b) => b.week_start_date.localeCompare(a.week_start_date))
    .slice(0, 4);

  if (priorSummaries.length < 1) return null;

  // ── Prior week highlights ──────────────────────────────────────────────
  const priorWeekHighlights = priorSummaries.map((s) => {
    // Key themes: prefer content.keyThemes, fall back to top-level key_themes
    const keyThemes: string[] = s.content?.keyThemes?.length
      ? s.content.keyThemes
      : (s.key_themes ?? []);

    // Insight types surfaced this week
    const insightTypesSurfaced: string[] = (s.content?.insights ?? []).map((i) => i.type);

    // Cleanup action counts
    const cleanupActions = { kept: 0, parked: 0, dropped: 0 };
    for (const a of s.cleanup_actions ?? []) {
      if (a.action === 'keep') cleanupActions.kept++;
      else if (a.action === 'park') cleanupActions.parked++;
      else if (a.action === 'drop') cleanupActions.dropped++;
    }

    // Stats snapshot (loose JSONB)
    const snap = s.stats_snapshot ?? {};
    const statsSnapshot = {
      todosCompleted: statNum(snap, 'todosCompleted'),
      journalEntries: statNum(snap, 'journalEntries'),
      mindDropsSwept: statNum(snap, 'mindDropsSwept'),
    };

    return {
      weekStart: s.week_start_date,
      keyThemes,
      insightTypesSurfaced,
      cleanupActions,
      statsSnapshot,
    };
  });

  // ── Rolling trends (oldest → newest order for trend calculation) ───────
  // Reverse so index 0 = oldest
  const chronological = [...priorWeekHighlights].reverse();

  // 1. Completion trend
  const completionTrend = computeTrend(chronological.map((w) => w.statsSnapshot.todosCompleted));

  // 2. Habit consistency trend
  //    Try habitConsistency or habitCompletionRate from stats_snapshot
  const habitValues = [...priorSummaries].reverse().map((s) => {
    const snap = s.stats_snapshot ?? {};
    const rate = statNum(snap, 'habitConsistency') || statNum(snap, 'habitCompletionRate');
    return rate;
  });
  const hasHabitData = habitValues.some((v) => v > 0);
  const habitConsistencyTrend: TrendContext['rollingTrends']['habitConsistencyTrend'] = hasHabitData
    ? computeTrend(habitValues)
    : 'stable';

  // 3. Capture-to-sweep trend
  //    Compare ratio of mindDropsCreated / mindDropsSwept
  const ratios = [...priorSummaries].reverse().map((s) => {
    const snap = s.stats_snapshot ?? {};
    const created = statNum(snap, 'mindDropsCreated');
    const swept = statNum(snap, 'mindDropsSwept');
    // Higher ratio = bigger gap (more created than swept)
    return swept > 0 ? created / swept : created > 0 ? 2 : 1;
  });
  let captureToSweepTrend: TrendContext['rollingTrends']['captureToSweepTrend'] = 'stable';
  if (ratios.length >= 2) {
    const first = ratios[0];
    const last = ratios[ratios.length - 1];
    if (last > first * 1.1) captureToSweepTrend = 'widening';
    else if (last < first * 0.9) captureToSweepTrend = 'narrowing';
  }

  // 4. Stale trend
  //    Look at stale_cleanup insight + cleanup action counts
  const staleCountsByWeek = chronological.map((w) => {
    // If user did cleanup actions, count dropped as resolved
    const resolved = w.cleanupActions.dropped + w.cleanupActions.parked;
    const hadStaleInsight = w.insightTypesSurfaced.includes('stale_cleanup');
    // Positive = stale items surfacing, negative = being resolved
    return hadStaleInsight ? Math.max(1, 1 - resolved) : -resolved;
  });
  let staleTrend: TrendContext['rollingTrends']['staleTrend'] = 'stable';
  if (staleCountsByWeek.length >= 2) {
    const trend = computeTrend(staleCountsByWeek.map((v) => Math.max(0, v)));
    if (trend === 'increasing') staleTrend = 'growing';
    else if (trend === 'declining') staleTrend = 'shrinking';
  }

  // 5. Work-life balance trend
  const balanceInsightWeeks = chronological.filter(
    (w) =>
      w.insightTypesSurfaced.includes('balance') ||
      w.insightTypesSurfaced.includes('space_activity'),
  ).length;
  let workLifeBalanceTrend = 'balanced';
  if (balanceInsightWeeks >= 2) {
    // Check if themes suggest work-heavy or life-heavy
    const allThemes = chronological.flatMap((w) => w.keyThemes).map((t) => t.toLowerCase());
    const workHeavy = allThemes.filter(
      (t) => t.includes('work') || t.includes('busy') || t.includes('overload'),
    ).length;
    const lifeHeavy = allThemes.filter(
      (t) => t.includes('rest') || t.includes('personal') || t.includes('balance'),
    ).length;
    if (workHeavy > lifeHeavy) {
      workLifeBalanceTrend = `work-heavy ${balanceInsightWeeks} week${balanceInsightWeeks > 1 ? 's' : ''}`;
    } else if (lifeHeavy > workHeavy) {
      workLifeBalanceTrend = `personal-focused ${balanceInsightWeeks} week${balanceInsightWeeks > 1 ? 's' : ''}`;
    }
  }

  // 6. Insight frequency across all prior summaries
  const insightFrequency: Record<string, number> = {};
  for (const w of priorWeekHighlights) {
    for (const type of w.insightTypesSurfaced) {
      insightFrequency[type] = (insightFrequency[type] ?? 0) + 1;
    }
  }

  const rollingTrends: TrendContext['rollingTrends'] = {
    completionTrend,
    habitConsistencyTrend,
    captureToSweepTrend,
    staleTrend,
    workLifeBalanceTrend,
    insightFrequency,
  };

  console.log('[WeeklySummary] Trend context built:', {
    priorWeeks: priorWeekHighlights.length,
    trends: rollingTrends,
  });

  return { priorWeekHighlights, rollingTrends };
}
