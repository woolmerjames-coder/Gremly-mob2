import { useMemo } from 'react';
import { jsonToFrequency, getFrequencyLabel } from '../../../components/overlay/frequencyHelpers';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FrequencyType = 'daily' | 'x_per_week' | 'specific_days';
export type HabitStatus = 'on_track' | 'needs_attention' | 'done_for_week';
// 'pending' = past day that's tappable but not yet done (for x_per_week habits)
export type DayDot = 'done' | 'missed' | 'future' | 'pending';

export interface HabitProgressRecord {
  occurred_day: string; // ISO date string e.g. "2025-11-24"
}

export interface RawHabit {
  id: string;
  name: string;
  frequency: string; // "daily", "x_per_week", "specific_days"
  frequency_value: number | number[]; // number for daily/x_per_week, array for specific_days
  frequency_json?: any; // The structured JSON from overlay: { type: 'simple', value: 'daily' } etc.
  cadence?: 'daily' | 'weekly' | 'monthly'; // From habit.cadence
  target_per_period?: number; // From habit.target_per_period
  labels?: string[];
  type?: string;
  habit_progress?: HabitProgressRecord[];
  schedule_days?: number[]; // optional, weekday numbers (0=Sun, 1=Mon, etc.)
}

export interface WeeklyHabitStats {
  id: string;
  name: string;
  frequencyType: FrequencyType;
  weeklyTarget: number;
  weeklyCompleted: number;
  status: HabitStatus;
  dayDots: DayDot[];
  dayDates: string[]; // ISO dates for rolling 7 days (today is last)
  formattedFrequency: string;
  frequencyLabel: string; // Human-readable label from frequency_json
  dayLabels: string[]; // Day labels for rolling 7 days (e.g., ['T', 'F', 'S', 'S', 'M', 'T', 'W'])
  todayIndex: number; // Index of today in the rolling window (always 6)
}

/** Base stats without rolling window fields (used internally by compute functions) */
type BaseHabitStats = Omit<WeeklyHabitStats, 'dayLabels' | 'todayIndex'>;

export interface WeeklySummary {
  onTrackCount: number;
  totalHabits: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get rolling 7 days ending today (today is the last element)
 * Returns: { days: Date[], labels: string[], todayIndex: number }
 */
function getRolling7Days(today: Date): { days: Date[]; labels: string[]; todayIndex: number } {
  const days: Date[] = [];
  const labels: string[] = [];
  const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun=0, Mon=1, etc.

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
    labels.push(dayLetters[d.getDay()]);
  }

  return { days, labels, todayIndex: 6 }; // Today is always index 6
}

/**
 * Format date to local ISO date string (YYYY-MM-DD)
 * Uses local timezone, not UTC, to match user's day boundaries
 */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the weekday index (0=Sun, 1=Mon, ..., 6=Sat)
 */
function getWeekdayIndex(date: Date): number {
  return date.getDay();
}

/**
 * Calculate days passed since Monday (1 = Monday, 7 = Sunday)
 */
function getDaysPassed(today: Date, weekStart: Date): number {
  const diffMs = today.getTime() - weekStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return Math.min(Math.max(diffDays, 1), 7);
}

/**
 * Parse frequency type from raw habit
 */
function parseFrequencyType(frequency: string): FrequencyType {
  if (frequency === 'daily') return 'daily';
  if (frequency === 'specific_days') return 'specific_days';
  return 'x_per_week';
}

/**
 * Get scheduled weekday indices for specific_days habits
 */
function getScheduledDays(habit: RawHabit): number[] {
  if (habit.schedule_days && Array.isArray(habit.schedule_days)) {
    return habit.schedule_days;
  }
  if (Array.isArray(habit.frequency_value)) {
    return habit.frequency_value;
  }
  return [];
}

/**
 * Format frequency for display
 */
function formatFrequency(
  frequencyType: FrequencyType,
  target: number,
  scheduledDays?: number[],
): string {
  switch (frequencyType) {
    case 'daily':
      return 'Daily';
    case 'x_per_week':
      return `${target}x per week`;
    case 'specific_days': {
      if (!scheduledDays || scheduledDays.length === 0) return 'Specific days';
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const sorted = [...scheduledDays].sort((a, b) => a - b);
      return sorted.map((d) => dayNames[d]).join(', ');
    }
    default:
      return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Logic
// ─────────────────────────────────────────────────────────────────────────────

function computeDailyStats(
  habit: RawHabit,
  weekDays: Date[],
  today: Date,
  progressDates: Set<string>,
): BaseHabitStats {
  const weeklyTarget = 7;
  let weeklyCompleted = 0;
  let missedCount = 0;
  const dayDots: DayDot[] = [];
  const dayDates: string[] = weekDays.map(toDateString);

  for (const day of weekDays) {
    const dateStr = toDateString(day);
    const isFuture = day > today;
    const isDone = progressDates.has(dateStr);

    if (isFuture) {
      dayDots.push('future');
    } else if (isDone) {
      dayDots.push('done');
      weeklyCompleted++;
    } else {
      dayDots.push('missed');
      missedCount++;
    }
  }

  let status: HabitStatus;
  if (weeklyCompleted === 7) {
    status = 'done_for_week';
  } else if (missedCount <= 1) {
    status = 'on_track';
  } else {
    status = 'needs_attention';
  }

  return {
    id: habit.id,
    name: habit.name,
    frequencyType: 'daily',
    weeklyTarget,
    weeklyCompleted,
    status,
    dayDots,
    dayDates,
    formattedFrequency: formatFrequency('daily', weeklyTarget),
    frequencyLabel: '', // Will be overwritten in computeHabitStats
  };
}

function computeXPerWeekStats(
  habit: RawHabit,
  weekDays: Date[],
  today: Date,
  weekStart: Date,
  progressDates: Set<string>,
): BaseHabitStats {
  const weeklyTarget = typeof habit.frequency_value === 'number' ? habit.frequency_value : 1;
  let weeklyCompleted = 0;
  const dayDots: DayDot[] = [];
  const dayDates: string[] = weekDays.map(toDateString);

  // Count completions this week
  for (const day of weekDays) {
    const dateStr = toDateString(day);
    const isFuture = day > today;
    const isDone = progressDates.has(dateStr);

    if (isFuture) {
      dayDots.push('future');
    } else if (isDone) {
      dayDots.push('done');
      weeklyCompleted++;
    } else {
      // For x_per_week, past days without completion are 'pending' - still tappable
      // This allows user to mark any past day as done for flexible habits
      dayDots.push('pending');
    }
  }

  // Pace check
  const daysPassed = getDaysPassed(today, weekStart);
  const expected = Math.round((daysPassed / 7) * weeklyTarget);

  let status: HabitStatus;
  if (weeklyCompleted >= weeklyTarget) {
    status = 'done_for_week';
  } else if (weeklyCompleted >= expected) {
    status = 'on_track';
  } else {
    status = 'needs_attention';
  }

  return {
    id: habit.id,
    name: habit.name,
    frequencyType: 'x_per_week',
    weeklyTarget,
    weeklyCompleted,
    status,
    dayDots,
    dayDates,
    formattedFrequency: formatFrequency('x_per_week', weeklyTarget),
    frequencyLabel: '', // Will be overwritten in computeHabitStats
  };
}

function computeSpecificDaysStats(
  habit: RawHabit,
  weekDays: Date[],
  today: Date,
  progressDates: Set<string>,
): BaseHabitStats {
  const scheduledDays = getScheduledDays(habit);
  const scheduledDaysSet = new Set(scheduledDays);
  const weeklyTarget = scheduledDays.length;
  let weeklyCompleted = 0;
  let missedScheduledDays = 0;
  const dayDots: DayDot[] = [];
  const dayDates: string[] = weekDays.map(toDateString);

  for (const day of weekDays) {
    const dateStr = toDateString(day);
    const weekdayIdx = getWeekdayIndex(day);
    const isScheduled = scheduledDaysSet.has(weekdayIdx);
    const isFuture = day > today;
    const isDone = progressDates.has(dateStr);

    if (!isScheduled) {
      // Not a scheduled day - mark as future (grayed out)
      dayDots.push('future');
    } else if (isFuture) {
      dayDots.push('future');
    } else if (isDone) {
      dayDots.push('done');
      weeklyCompleted++;
    } else {
      dayDots.push('missed');
      missedScheduledDays++;
    }
  }

  let status: HabitStatus;
  if (weeklyCompleted >= weeklyTarget) {
    status = 'done_for_week';
  } else if (missedScheduledDays === 0) {
    status = 'on_track';
  } else {
    status = 'needs_attention';
  }

  return {
    id: habit.id,
    name: habit.name,
    frequencyType: 'specific_days',
    weeklyTarget,
    weeklyCompleted,
    status,
    dayDots,
    dayDates,
    formattedFrequency: formatFrequency('specific_days', weeklyTarget, scheduledDays),
    frequencyLabel: '', // Will be overwritten in computeHabitStats
  };
}

/**
 * Derive human-readable frequency label from habit data.
 * Parses various formats:
 * - cadence field: 'daily', 'weekly', 'monthly', 'day', 'week', 'month'
 * - frequency string: "3 times a week", "5 times a week", "2 times a month", "daily"
 * - frequency_json: { type: 'custom', count: 3, unit: 'week' }
 */
function deriveFrequencyLabel(habit: RawHabit, fallback: string): string {
  // Debug: log habit data
  console.log('[deriveFrequencyLabel] input:', {
    habitName: habit.name,
    cadence: habit.cadence,
    target_per_period: habit.target_per_period,
    frequency: habit.frequency,
    frequency_value: habit.frequency_value,
    frequency_json: habit.frequency_json,
  });

  // Primary: parse the human-readable frequency string (most reliable based on logs)
  // e.g., "3 times a week", "5 times a week", "2 times a month", "daily"
  if (habit.frequency) {
    const freq = habit.frequency.toLowerCase();

    // Check for "X times a week" pattern
    const weekMatch = freq.match(/(\d+)\s*(?:times?\s*(?:a|per)\s*)?week/i);
    if (weekMatch) {
      const count = parseInt(weekMatch[1], 10);
      return `${count}x per week`;
    }

    // Check for "X times a month" pattern
    const monthMatch = freq.match(/(\d+)\s*(?:times?\s*(?:a|per)\s*)?month/i);
    if (monthMatch) {
      const count = parseInt(monthMatch[1], 10);
      return `${count}x per month`;
    }

    // Check for "daily" or "every day"
    if (freq === 'daily' || freq.includes('every day')) {
      return 'Daily';
    }
  }

  // Secondary: try cadence + target_per_period (handle both 'daily'/'day' formats)
  if (habit.cadence) {
    const cadence = habit.cadence.toLowerCase();
    const target = habit.target_per_period ?? 1;

    if (cadence === 'daily' || cadence === 'day') {
      return 'Daily';
    }
    if (cadence === 'weekly' || cadence === 'week') {
      return `${target}x per week`;
    }
    if (cadence === 'monthly' || cadence === 'month') {
      return `${target}x per month`;
    }
  }

  // Tertiary: try frequency_json with the actual structure from overlay
  // Structure: { type: 'custom', count: 3, unit: 'week' }
  if (habit.frequency_json && typeof habit.frequency_json === 'object') {
    const json = habit.frequency_json;
    if (json.count && json.unit) {
      const count = json.count;
      const unit = json.unit.toLowerCase();
      if (unit === 'week') {
        return `${count}x per week`;
      }
      if (unit === 'month') {
        return `${count}x per month`;
      }
      if (unit === 'day') {
        return count === 1 ? 'Daily' : `${count}x per day`;
      }
    }
    // Also try the jsonToFrequency helper as last resort
    try {
      const config = jsonToFrequency(json);
      if (config) {
        const label = getFrequencyLabel(config);
        if (label && label !== fallback) {
          return label;
        }
      }
    } catch {
      // Fall through
    }
  }

  console.log('[deriveFrequencyLabel] using fallback:', fallback);
  return fallback;
}

function computeHabitStats(
  habit: RawHabit,
  weekDays: Date[],
  today: Date,
  weekStart: Date,
  dayLabels: string[],
  todayIndex: number,
): WeeklyHabitStats {
  // Build set of progress dates for this week
  const progressDates = new Set<string>();
  const weekStartStr = toDateString(weekDays[0]);
  const weekEndStr = toDateString(weekDays[6]);

  // Debug: log habit_progress data received
  console.log('[useWeeklyHabitStats] computeHabitStats for:', habit.name, {
    habit_progress_count: habit.habit_progress?.length ?? 0,
    habit_progress: habit.habit_progress?.map((p) => p.occurred_day),
    weekRange: `${weekStartStr} to ${weekEndStr}`,
  });

  if (habit.habit_progress) {
    for (const record of habit.habit_progress) {
      const dateStr = record.occurred_day;
      // Only include dates within this week
      if (dateStr >= weekStartStr && dateStr <= weekEndStr) {
        progressDates.add(dateStr);
      }
    }
  }

  console.log(
    '[useWeeklyHabitStats] progressDates for',
    habit.name,
    ':',
    Array.from(progressDates),
  );

  const frequencyType = parseFrequencyType(habit.frequency);

  let baseStats: BaseHabitStats;
  switch (frequencyType) {
    case 'daily':
      baseStats = computeDailyStats(habit, weekDays, today, progressDates);
      break;
    case 'x_per_week':
      baseStats = computeXPerWeekStats(habit, weekDays, today, weekStart, progressDates);
      break;
    case 'specific_days':
      baseStats = computeSpecificDaysStats(habit, weekDays, today, progressDates);
      break;
    default:
      baseStats = computeDailyStats(habit, weekDays, today, progressDates);
  }

  // Derive frequencyLabel from frequency_json (source of truth)
  const frequencyLabel = deriveFrequencyLabel(habit, baseStats.formattedFrequency);

  console.log('[useWeeklyHabitStats] Final dayDots for', habit.name, ':', baseStats.dayDots);

  return {
    ...baseStats,
    frequencyLabel,
    dayLabels,
    todayIndex,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook that computes weekly statistics for an array of habits
 * Uses rolling 7-day window ending today, sorted by status (needs_attention first)
 */
export function useWeeklyHabitStats(habits: RawHabit[]): WeeklyHabitStats[] {
  return useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today for comparison

    // Use rolling 7 days instead of calendar week
    const { days: weekDays, labels: dayLabels, todayIndex } = getRolling7Days(today);
    const weekStart = weekDays[0]; // First day of rolling window

    const stats = habits.map((habit) =>
      computeHabitStats(habit, weekDays, today, weekStart, dayLabels, todayIndex),
    );

    // Sort by status: needs_attention first, then on_track, then done_for_week
    const statusOrder: Record<HabitStatus, number> = {
      needs_attention: 0,
      on_track: 1,
      done_for_week: 2,
    };

    return stats.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [habits]);
}

/**
 * Get a summary of weekly habit progress
 */
export function getWeeklySummary(stats: WeeklyHabitStats[]): WeeklySummary {
  const onTrackCount = stats.filter(
    (s) => s.status === 'on_track' || s.status === 'done_for_week',
  ).length;

  return {
    onTrackCount,
    totalHabits: stats.length,
  };
}

/**
 * Pure function version (no React hook) for use outside components
 * Uses rolling 7-day window ending today
 */
export function computeWeeklyHabitStats(habits: RawHabit[]): WeeklyHabitStats[] {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const { days: weekDays, labels: dayLabels, todayIndex } = getRolling7Days(today);
  const weekStart = weekDays[0];

  return habits.map((habit) =>
    computeHabitStats(habit, weekDays, today, weekStart, dayLabels, todayIndex),
  );
}
