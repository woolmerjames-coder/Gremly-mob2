/**
 * useNowData hook - Phase 3: Real data for NOW page
 * Fetches and transforms data using NOW selectors
 */

import { useState, useEffect, useCallback } from 'react';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import type { Habit, Todo, Note } from '../types';
import type {
  NowLockedItem,
  NowActiveItem,
  NowFutureItem,
  NowCompletedItem,
  NowProgressState,
  MindVaultSummary,
  HabitWeeklyStatus,
  NowWeeklyHabitSummary,
} from './nowTypes';
import {
  getHabitWeeklyStatus,
  getLockedItems,
  getActiveTodayItems,
  getFutureItems,
  getProgressEligibleItems,
  getProgressState,
  getCompletedTodayItems,
  getMindVaultSummary,
  getWeeklyHabitSummaries,
} from './nowSelectors';
import { getGreeting } from '../today/copy';
import type { TimeWindow } from '../env';

export type WeekStatus = 'ahead' | 'on_track' | 'needs_attention';

export interface NowData {
  greeting: string;
  dateTimeLabel: string;
  progressState: NowProgressState;
  weekStatus: WeekStatus;
  lockedItems: NowLockedItem[];
  activeItems: NowActiveItem[];
  futureItems: NowFutureItem[];
  vaultSummary: MindVaultSummary;
  completedToday: NowCompletedItem[];
  hasYesterdayCarryOver: boolean;
  weeklySummaries: NowWeeklyHabitSummary[];
  loading: boolean;
}

export interface UseNowDataReturn extends NowData {
  reload: () => Promise<void>;
}

/**
 * Determines time window based on current hour
 */
function getTimeWindow(date: Date = new Date()): TimeWindow {
  const hour = date.getHours();

  if (hour >= 6 && hour < 11) {
    return 'morning';
  } else if (hour >= 11 && hour < 17) {
    return 'midday';
  } else if (hour >= 17 && hour < 24) {
    return 'evening';
  }

  return 'morning';
}

/**
 * Format date and time for header
 */
function formatDateTime(date: Date): string {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${dateStr} • ${timeStr}`;
}

/**
 * Calculate week status based on habit statuses
 */
function calculateWeekStatus(
  habits: Habit[],
  completionHistory: Map<string, number>,
  date: Date,
): WeekStatus {
  if (habits.length === 0) {
    return 'on_track';
  }

  const statuses: HabitWeeklyStatus[] = habits.map((habit) => {
    const completions = completionHistory.get(habit.id) || 0;
    return getHabitWeeklyStatus(habit, completions, date);
  });

  const weekCompleteCount = statuses.filter((s) => s === 'week_complete').length;
  const flexibleCount = statuses.filter((s) => s === 'flexible').length;
  const lastChanceCount = statuses.filter((s) => s === 'last_chance').length;

  // Ahead: majority are week_complete or flexible
  const aheadCount = weekCompleteCount + flexibleCount;
  if (aheadCount > habits.length / 2) {
    return 'ahead';
  }

  // Needs attention: any last_chance
  if (lastChanceCount > 0) {
    return 'needs_attention';
  }

  // Otherwise on_track
  return 'on_track';
}

/**
 * Main hook for NOW page data
 */
export function useNowData(today: Date = new Date()): UseNowDataReturn {
  const repo = useRepo();
  const { user } = useAuth();

  const [data, setData] = useState<NowData>({
    greeting: getGreeting(getTimeWindow(today)),
    dateTimeLabel: formatDateTime(today),
    progressState: {
      mode: 'dots',
      percent: 0,
      completedCount: 0,
      totalEligibleCount: 0,
      dots: [],
    },
    weekStatus: 'on_track',
    lockedItems: [],
    activeItems: [],
    futureItems: [],
    vaultSummary: {
      topThree: [],
      overflowCount: 0,
      thisWeekStats: {
        journalCount: 0,
        ideaCount: 0,
        personCount: 0,
      },
    },
    completedToday: [],
    hasYesterdayCarryOver: false,
    weeklySummaries: [],
    loading: true,
  });

  const load = useCallback(async () => {
    if (!user) {
      const timeWindow = getTimeWindow(today);
      setData((prev) => ({
        ...prev,
        greeting: getGreeting(timeWindow, 'there'),
        dateTimeLabel: formatDateTime(today),
        loading: false,
      }));
      return;
    }

    try {
      // Fetch all data in parallel
      const [allRecords, allNotes] = await Promise.all([repo.getAll(), repo.listByType('note')]);

      // Filter by type
      const habits = allRecords.filter((r): r is Habit => r.type === 'habit');
      const todos = allRecords.filter((r): r is Todo => r.type === 'todo');
      const notes = allNotes.filter((r): r is Note => r.type === 'note');

      // Build completion history for habits from habit_progress table
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekStartIso = weekStart.toISOString().split('T')[0];
      const weekEndIso = weekEnd.toISOString().split('T')[0];

      const completionHistory = new Map<string, number>();
      await Promise.all(
        habits.map(async (habit) => {
          const count = await repo.getHabitProgressForWeek(habit.id, weekStartIso, weekEndIso);
          if (count > 0) {
            completionHistory.set(habit.id, count);
          }
        }),
      );

      // Combine all entities for selectors
      const allEntities = [...habits, ...todos];

      // Run selectors
      const lockedItems = getLockedItems(allEntities, completionHistory, today);
      const activeItems = getActiveTodayItems(allEntities, completionHistory, today);
      const futureItems = getFutureItems(allEntities, completionHistory, today);
      const completedToday = getCompletedTodayItems(allEntities, today);
      const vaultSummary = getMindVaultSummary(notes, today);

      // Calculate progress
      const eligibleItems = getProgressEligibleItems(allEntities, completionHistory, today);
      const completedIds = new Set(completedToday.map((item) => item.id));
      const progressState = getProgressState(eligibleItems, completedIds);

      // Calculate week status
      const weekStatus = calculateWeekStatus(habits, completionHistory, today);

      // Get weekly habit summaries for progress popup
      const weeklySummaries = getWeeklyHabitSummaries(habits, completionHistory, today);

      // Check for yesterday carry-over
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDateStr = yesterday.toISOString().split('T')[0];

      const hasYesterdayCarryOver = todos.some((todo) => {
        if ((todo as any).status === 'completed' || !todo.due_date) return false;
        return todo.due_date === yesterdayDateStr;
      });

      const timeWindow = getTimeWindow(today);

      setData({
        greeting: getGreeting(timeWindow, user.email?.split('@')[0] || 'there'),
        dateTimeLabel: formatDateTime(today),
        progressState,
        weekStatus,
        lockedItems,
        activeItems,
        futureItems,
        vaultSummary,
        completedToday,
        hasYesterdayCarryOver,
        weeklySummaries,
        loading: false,
      });
    } catch (error) {
      console.error('[useNowData] Error loading data:', error);
      setData((prev) => ({ ...prev, loading: false }));
    }
  }, [repo, user, today]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ...data,
    reload: load,
  };
}
