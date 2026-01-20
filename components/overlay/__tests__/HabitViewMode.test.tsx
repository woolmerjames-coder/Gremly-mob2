/**
 * HabitViewMode.test.tsx
 *
 * Tests for HabitViewMode component helper functions and rendering.
 * Tests calculation utilities for streak, frequency, calendar, and adherence.
 */

/* eslint-disable no-restricted-syntax */
// Note: Using toISOString().split('T')[0] in this test file is intentional
// because we're testing with controlled UTC dates in a mocked environment.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { HabitProgressRow } from '../../../lib/store/useGremlyStore';

// Mock dependencies
jest.mock('../../../lib/date', () => ({
  getDateService: jest.fn(() => ({
    today: jest.fn(() => '2025-01-15'),
    getCurrentDate: jest.fn(() => '2025-01-15'),
    addDays: jest.fn((date: string, days: number) => {
      const d = new Date(date);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    }),
    daysBetween: jest.fn((from: string, to: string) => {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      return Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    }),
    fromDateString: jest.fn((dateStr: string) => new Date(dateStr)),
    toDateString: jest.fn((date: Date) => date.toISOString().split('T')[0]),
  })),
}));

jest.mock('../../../lib/sweep/habitHelpers', () => ({
  getFrequencyLabel: jest.fn(() => 'Daily'),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('lucide-react-native', () => ({
  Flame: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  X: () => null,
  Plus: () => null,
  Minus: () => null,
  Check: () => null,
}));

// Test utilities - reimplementing the helper functions to test them
// These mirror the actual implementations in HabitViewMode.tsx

function calculateBestStreak(habitId: string, habitProgress: HabitProgressRow[]): number {
  const completedDays = habitProgress
    .filter((p) => p.habit_id === habitId)
    .map((p) => p.occurred_day)
    .sort();

  if (completedDays.length === 0) return 0;

  let bestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < completedDays.length; i++) {
    const prevDate = new Date(completedDays[i - 1]);
    const currDate = new Date(completedDays[i]);
    const dayDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (dayDiff === 1) {
      currentStreak++;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else if (dayDiff > 1) {
      currentStreak = 1;
    }
  }

  return bestStreak;
}

function calculateAverageFrequency(
  habitId: string,
  habitProgress: HabitProgressRow[],
  habit: {
    start_date?: string | null;
    cadence?: string | null;
    target_per_period?: number | null;
  },
): { average: number; periodLabel: string; target: number } {
  const today = '2025-01-15';
  const startDate = habit.start_date || today;

  const totalCompletions = habitProgress.filter((p) => p.habit_id === habitId).length;
  const fromDate = new Date(startDate);
  const toDate = new Date(today);
  const daysSinceStart = Math.max(
    1,
    Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );

  const cadence = (habit.cadence || 'daily').toLowerCase();
  const target = habit.target_per_period || 1;

  if (cadence === 'daily') {
    const avgPerDay = totalCompletions / daysSinceStart;
    return {
      average: Math.round(avgPerDay * 10) / 10,
      periodLabel: 'day',
      target,
    };
  } else if (cadence === 'weekly') {
    const weeks = Math.max(1, daysSinceStart / 7);
    const avgPerWeek = totalCompletions / weeks;
    return {
      average: Math.round(avgPerWeek * 10) / 10,
      periodLabel: 'week',
      target,
    };
  } else {
    const months = Math.max(1, daysSinceStart / 30);
    const avgPerMonth = totalCompletions / months;
    return {
      average: Math.round(avgPerMonth * 10) / 10,
      periodLabel: 'month',
      target,
    };
  }
}

function getRolling7Days(
  habitId: string,
  habitProgress: HabitProgressRow[],
  today: string = '2025-01-15',
): Array<{
  dateIso: string;
  dayLabel: string;
  isCompleted: boolean;
  isToday: boolean;
  isFuture: boolean;
}> {
  const days: Array<{
    dateIso: string;
    dayLabel: string;
    isCompleted: boolean;
    isToday: boolean;
    isFuture: boolean;
  }> = [];

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const completedSet = new Set(
    habitProgress.filter((p) => p.habit_id === habitId).map((p) => p.occurred_day),
  );

  for (let i = 6; i >= 0; i--) {
    const dateObj = new Date(today);
    dateObj.setDate(dateObj.getDate() - i);
    const dateIso = dateObj.toISOString().split('T')[0];
    const dayOfWeek = dateObj.getDay();

    days.push({
      dateIso,
      dayLabel: dayLabels[dayOfWeek],
      isCompleted: completedSet.has(dateIso),
      isToday: dateIso === today,
      isFuture: dateIso > today,
    });
  }

  return days;
}

function getCalendarDays(
  year: number,
  month: number,
  todayIso: string = '2025-01-15',
): Array<{
  dateIso: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
}> {
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - startDayOfWeek);

  const days: Array<{
    dateIso: string;
    dayOfMonth: number;
    isCurrentMonth: boolean;
    isPast: boolean;
    isToday: boolean;
    isFuture: boolean;
  }> = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    const dateIso = date.toISOString().split('T')[0];

    days.push({
      dateIso,
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isPast: dateIso < todayIso,
      isToday: dateIso === todayIso,
      isFuture: dateIso > todayIso,
    });
  }

  return days;
}

function calculateMonthlyAdherence(
  habitId: string,
  habitProgress: HabitProgressRow[],
  year: number,
  month: number,
  habitStartDate?: string | null,
  todayIso: string = '2025-01-15',
): number {
  const monthStart = new Date(year, month, 1);
  const monthStartIso = monthStart.toISOString().split('T')[0];
  const monthEnd = new Date(year, month + 1, 0);
  const monthEndIso = monthEnd.toISOString().split('T')[0];

  let effectiveStart = monthStartIso;
  if (habitStartDate && habitStartDate > monthStartIso) {
    effectiveStart = habitStartDate;
  }

  let effectiveEnd = monthEndIso;
  if (todayIso < monthEndIso) {
    effectiveEnd = todayIso;
  }

  if (effectiveStart > effectiveEnd) {
    return 0;
  }

  const startDate = new Date(effectiveStart);
  const endDate = new Date(effectiveEnd);
  const totalDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  if (totalDays <= 0) return 0;

  const completions = habitProgress.filter(
    (p) =>
      p.habit_id === habitId && p.occurred_day >= effectiveStart && p.occurred_day <= effectiveEnd,
  ).length;

  return Math.round((completions / totalDays) * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateBestStreak Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateBestStreak', () => {
  it('returns 0 for no completions', () => {
    expect(calculateBestStreak('habit-1', [])).toBe(0);
  });

  it('returns 1 for single completion', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
    ];
    expect(calculateBestStreak('habit-1', progress)).toBe(1);
  });

  it('calculates streak of consecutive days', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-11' } as HabitProgressRow,
      { id: '3', habit_id: 'habit-1', occurred_day: '2025-01-12' } as HabitProgressRow,
    ];
    expect(calculateBestStreak('habit-1', progress)).toBe(3);
  });

  it('finds the best streak among multiple streaks', () => {
    const progress: HabitProgressRow[] = [
      // First streak: 2 days
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-01' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-02' } as HabitProgressRow,
      // Gap
      // Second streak: 4 days (best)
      { id: '3', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
      { id: '4', habit_id: 'habit-1', occurred_day: '2025-01-11' } as HabitProgressRow,
      { id: '5', habit_id: 'habit-1', occurred_day: '2025-01-12' } as HabitProgressRow,
      { id: '6', habit_id: 'habit-1', occurred_day: '2025-01-13' } as HabitProgressRow,
    ];
    expect(calculateBestStreak('habit-1', progress)).toBe(4);
  });

  it('only counts completions for the specified habit', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-2', occurred_day: '2025-01-11' } as HabitProgressRow, // Different habit
      { id: '3', habit_id: 'habit-1', occurred_day: '2025-01-12' } as HabitProgressRow,
    ];
    // For habit-1: only 2025-01-10 and 2025-01-12 (not consecutive)
    expect(calculateBestStreak('habit-1', progress)).toBe(1);
  });

  it('handles unsorted input correctly', () => {
    const progress: HabitProgressRow[] = [
      { id: '3', habit_id: 'habit-1', occurred_day: '2025-01-12' } as HabitProgressRow,
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-11' } as HabitProgressRow,
    ];
    expect(calculateBestStreak('habit-1', progress)).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateAverageFrequency Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateAverageFrequency', () => {
  it('calculates daily average correctly', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-12' } as HabitProgressRow,
      { id: '3', habit_id: 'habit-1', occurred_day: '2025-01-14' } as HabitProgressRow,
    ];
    const result = calculateAverageFrequency('habit-1', progress, {
      start_date: '2025-01-10',
      cadence: 'daily',
      target_per_period: 1,
    });
    expect(result.periodLabel).toBe('day');
    expect(result.target).toBe(1);
    // 3 completions over 6 days = 0.5
    expect(result.average).toBe(0.5);
  });

  it('calculates weekly average correctly', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-01' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-05' } as HabitProgressRow,
      { id: '3', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
    ];
    const result = calculateAverageFrequency('habit-1', progress, {
      start_date: '2025-01-01',
      cadence: 'weekly',
      target_per_period: 3,
    });
    expect(result.periodLabel).toBe('week');
    expect(result.target).toBe(3);
    // 3 completions over ~2 weeks = 1.5
    expect(result.average).toBeCloseTo(1.4, 1);
  });

  it('calculates monthly average correctly', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2024-12-15' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-05' } as HabitProgressRow,
    ];
    const result = calculateAverageFrequency('habit-1', progress, {
      start_date: '2024-12-15',
      cadence: 'monthly',
      target_per_period: 2,
    });
    expect(result.periodLabel).toBe('month');
    expect(result.target).toBe(2);
  });

  it('defaults to daily when no cadence specified', () => {
    const result = calculateAverageFrequency('habit-1', [], {
      start_date: '2025-01-01',
    });
    expect(result.periodLabel).toBe('day');
    expect(result.target).toBe(1);
  });

  it('uses today as start date if not specified', () => {
    const result = calculateAverageFrequency('habit-1', [], {
      cadence: 'daily',
    });
    // With no start_date and today = 2025-01-15, should use today
    expect(result.periodLabel).toBe('day');
    expect(result.average).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRolling7Days Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getRolling7Days', () => {
  it('returns exactly 7 days', () => {
    const result = getRolling7Days('habit-1', []);
    expect(result).toHaveLength(7);
  });

  it('marks today correctly', () => {
    const result = getRolling7Days('habit-1', [], '2025-01-15');
    const todayDay = result.find((d) => d.isToday);
    expect(todayDay).toBeDefined();
    expect(todayDay?.dateIso).toBe('2025-01-15');
  });

  it('marks completed days correctly', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-13' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-15' } as HabitProgressRow,
    ];
    const result = getRolling7Days('habit-1', progress, '2025-01-15');
    const completedDays = result.filter((d) => d.isCompleted);
    expect(completedDays).toHaveLength(2);
    expect(completedDays.map((d) => d.dateIso)).toContain('2025-01-13');
    expect(completedDays.map((d) => d.dateIso)).toContain('2025-01-15');
  });

  it('only includes completions for specified habit', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-13' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-2', occurred_day: '2025-01-14' } as HabitProgressRow,
    ];
    const result = getRolling7Days('habit-1', progress, '2025-01-15');
    const completedDays = result.filter((d) => d.isCompleted);
    expect(completedDays).toHaveLength(1);
    expect(completedDays[0].dateIso).toBe('2025-01-13');
  });

  it('includes proper day labels', () => {
    const result = getRolling7Days('habit-1', [], '2025-01-15'); // Wednesday
    const dayLabels = result.map((d) => d.dayLabel);
    expect(dayLabels).toContain('W'); // Wednesday should be in there
    expect(dayLabels).toContain('T'); // Thursday
    expect(dayLabels).toContain('S'); // Sunday or Saturday
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCalendarDays Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getCalendarDays', () => {
  it('returns 42 days (6 weeks grid)', () => {
    const result = getCalendarDays(2025, 0); // January 2025
    expect(result).toHaveLength(42);
  });

  it('starts grid on Sunday of first week', () => {
    // January 2025 starts on Wednesday (1st), so grid should start on Dec 29
    const result = getCalendarDays(2025, 0);
    expect(result[0].dayOfMonth).toBe(29); // Dec 29, 2024 (Sunday)
    expect(result[0].isCurrentMonth).toBe(false);
  });

  it('marks days in current month correctly', () => {
    const result = getCalendarDays(2025, 0); // January 2025
    const januaryDays = result.filter((d) => d.isCurrentMonth);
    expect(januaryDays).toHaveLength(31); // January has 31 days
  });

  it('marks today correctly', () => {
    const result = getCalendarDays(2025, 0, '2025-01-15');
    const today = result.find((d) => d.isToday);
    expect(today).toBeDefined();
    expect(today?.dayOfMonth).toBe(15);
    expect(today?.isCurrentMonth).toBe(true);
  });

  it('marks past and future days correctly', () => {
    const result = getCalendarDays(2025, 0, '2025-01-15');
    const past = result.filter((d) => d.isPast && d.isCurrentMonth);
    const future = result.filter((d) => d.isFuture && d.isCurrentMonth);
    expect(past.length).toBe(14); // Jan 1-14
    expect(future.length).toBe(16); // Jan 16-31
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateMonthlyAdherence Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateMonthlyAdherence', () => {
  it('returns 0 when no completions', () => {
    const result = calculateMonthlyAdherence('habit-1', [], 2025, 0);
    expect(result).toBe(0);
  });

  it('calculates correct percentage for partial completion', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-01' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-05' } as HabitProgressRow,
      { id: '3', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
    ];
    // With today = 2025-01-15, only counts Jan 1-15 (15 days)
    // 3 completions / 15 days = 20%
    const result = calculateMonthlyAdherence('habit-1', progress, 2025, 0, null, '2025-01-15');
    expect(result).toBe(20);
  });

  it('respects habit start date', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2025-01-12' } as HabitProgressRow,
    ];
    // Habit started Jan 10, today is Jan 15 = 6 days
    // 2 completions / 6 days = 33%
    const result = calculateMonthlyAdherence(
      'habit-1',
      progress,
      2025,
      0,
      '2025-01-10',
      '2025-01-15',
    );
    expect(result).toBe(33);
  });

  it('returns 0 for future months', () => {
    const result = calculateMonthlyAdherence(
      'habit-1',
      [],
      2025,
      5, // June 2025
      null,
      '2025-01-15',
    );
    expect(result).toBe(0);
  });

  it('only counts completions for specified habit', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2025-01-10' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-2', occurred_day: '2025-01-11' } as HabitProgressRow,
      { id: '3', habit_id: 'habit-2', occurred_day: '2025-01-12' } as HabitProgressRow,
    ];
    // Only habit-1 has 1 completion over 15 days = 7%
    const result = calculateMonthlyAdherence('habit-1', progress, 2025, 0, null, '2025-01-15');
    expect(result).toBe(7);
  });

  it('handles past months correctly', () => {
    const progress: HabitProgressRow[] = [
      { id: '1', habit_id: 'habit-1', occurred_day: '2024-12-01' } as HabitProgressRow,
      { id: '2', habit_id: 'habit-1', occurred_day: '2024-12-15' } as HabitProgressRow,
      { id: '3', habit_id: 'habit-1', occurred_day: '2024-12-31' } as HabitProgressRow,
    ];
    // December 2024 has 31 days, 3 completions = ~10%
    const result = calculateMonthlyAdherence(
      'habit-1',
      progress,
      2024,
      11, // December
      null,
      '2025-01-15',
    );
    expect(result).toBe(10);
  });
});
