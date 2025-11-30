import { useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FrequencyType = 'daily' | 'x_per_week' | 'specific_days';
export type HabitStatus = 'on_track' | 'needs_attention' | 'done_for_week';
export type DayDot = 'done' | 'missed' | 'future';

export interface HabitProgressRecord {
  occurred_day: string; // ISO date string e.g. "2025-11-24"
}

export interface RawHabit {
  id: string;
  name: string;
  frequency: string; // "daily", "x_per_week", "specific_days"
  frequency_value: number | number[]; // number for daily/x_per_week, array for specific_days
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
  dayDates: string[]; // ISO dates for Monday → Sunday
  formattedFrequency: string;
}

export interface WeeklySummary {
  onTrackCount: number;
  totalHabits: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the Monday of the current week (start of week)
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust so Monday = 0
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get all 7 days of the current week (Mon-Sun)
 */
function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }
  return days;
}

/**
 * Format date to ISO date string (YYYY-MM-DD)
 */
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
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
): WeeklyHabitStats {
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
  };
}

function computeXPerWeekStats(
  habit: RawHabit,
  weekDays: Date[],
  today: Date,
  weekStart: Date,
  progressDates: Set<string>,
): WeeklyHabitStats {
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
      // For x_per_week, past days without completion are not "missed"
      // They're just not done yet - show as future to indicate flexibility
      dayDots.push('future');
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
  };
}

function computeSpecificDaysStats(
  habit: RawHabit,
  weekDays: Date[],
  today: Date,
  progressDates: Set<string>,
): WeeklyHabitStats {
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
  };
}

function computeHabitStats(
  habit: RawHabit,
  weekDays: Date[],
  today: Date,
  weekStart: Date,
): WeeklyHabitStats {
  // Build set of progress dates for this week
  const progressDates = new Set<string>();
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(weekDays[6]);

  if (habit.habit_progress) {
    for (const record of habit.habit_progress) {
      const dateStr = record.occurred_day;
      // Only include dates within this week
      if (dateStr >= weekStartStr && dateStr <= weekEndStr) {
        progressDates.add(dateStr);
      }
    }
  }

  const frequencyType = parseFrequencyType(habit.frequency);

  switch (frequencyType) {
    case 'daily':
      return computeDailyStats(habit, weekDays, today, progressDates);
    case 'x_per_week':
      return computeXPerWeekStats(habit, weekDays, today, weekStart, progressDates);
    case 'specific_days':
      return computeSpecificDaysStats(habit, weekDays, today, progressDates);
    default:
      return computeDailyStats(habit, weekDays, today, progressDates);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook that computes weekly statistics for an array of habits
 */
export function useWeeklyHabitStats(habits: RawHabit[]): WeeklyHabitStats[] {
  return useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today for comparison
    const weekStart = getWeekStart(today);
    const weekDays = getWeekDays(weekStart);

    return habits.map((habit) => computeHabitStats(habit, weekDays, today, weekStart));
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
 */
export function computeWeeklyHabitStats(habits: RawHabit[]): WeeklyHabitStats[] {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const weekStart = getWeekStart(today);
  const weekDays = getWeekDays(weekStart);

  return habits.map((habit) => computeHabitStats(habit, weekDays, today, weekStart));
}
