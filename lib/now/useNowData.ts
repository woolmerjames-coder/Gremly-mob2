/**
 * useNowData hook - Phase 3: Real data for NOW page
 * Fetches and transforms data using NOW selectors
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRepo } from '../../providers/RepoProvider';
import { useAuth } from '../../providers/AuthProvider';
import { eventBus } from '../events';
import { probeMembership } from '../config/surfaceProbe';
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
  NowWeekHealth,
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
  computeWeekHealth,
  getWeeklyCaptureCounts,
  getTodayLogsCount,
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
  weekHealth: NowWeekHealth;
  capturesCount: number;
  unsortedCount: number;
  loading: boolean;
  /** All habits (not just today's) for weekly tracking */
  allHabits: Habit[];
  /** All todos for sweep/recentDrops filtering */
  allTodos: Todo[];
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
 * Format date for header (date only, no time)
 */
function formatDateTime(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
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
 * Uses stale-while-revalidate pattern: keeps existing data visible during reload
 */
export function useNowData(today: Date = new Date()): UseNowDataReturn {
  const repo = useRepo();
  const { user } = useAuth();
  const errorCountRef = useRef(0);
  const lastErrorTimeRef = useRef(0);
  const isLoadingRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

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
        listCount: 0,
        journalCount: 0,
        ideaCount: 0,
        personCount: 0,
      },
    },
    completedToday: [],
    hasYesterdayCarryOver: false,
    weeklySummaries: [],
    weekHealth: 'on_track',
    capturesCount: 0,
    unsortedCount: 0,
    loading: true,
    allHabits: [],
    allTodos: [],
  });

  const load = useCallback(async () => {
    // Prevent duplicate simultaneous calls
    if (isLoadingRef.current) {
      console.log('[useNowData] Skipping load - already loading');
      return;
    }

    if (!user) {
      console.log('[useNowData] No user, showing default greeting');
      const timeWindow = getTimeWindow(today);
      setData((prev) => ({
        ...prev,
        greeting: getGreeting(timeWindow, 'there'),
        dateTimeLabel: formatDateTime(today),
        loading: false,
      }));
      return;
    }

    console.log('[useNowData] Starting load...');
    isLoadingRef.current = true;

    // STALE-WHILE-REVALIDATE: Only show loading state on initial load
    // For subsequent reloads, keep existing data visible while fetching
    if (!hasLoadedOnceRef.current) {
      setData((prev) => ({ ...prev, loading: true }));
    }
    // Note: We do NOT set loading: true for reloads - existing data stays visible

    try {
      // Fetch all data in parallel
      const [allRecords, allNotes, unsortedCount] = await Promise.all([
        repo.getAll(),
        repo.listByType('note'),
        repo.countUnsorted(),
      ]);

      // Reset error counter on success
      errorCountRef.current = 0;
      lastErrorTimeRef.current = 0;

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
      const weeklyCaptureCounts = getWeeklyCaptureCounts(notes, today);

      // Count TODAY's logs for the LOGS label in the header
      // Uses getTodayLogsCount which handles both explicit date and created_at fallback
      const capturesCount = getTodayLogsCount(notes, today);

      const vaultSummary = getMindVaultSummary(notes, today, weeklyCaptureCounts);

      // Calculate progress
      const eligibleItems = getProgressEligibleItems(allEntities, completionHistory, today);
      const completedIds = new Set(completedToday.map((item) => item.id));
      const progressState = getProgressState(eligibleItems, completedIds);

      // Calculate week status
      const weekStatus = calculateWeekStatus(habits, completionHistory, today);

      // Get weekly habit summaries for progress popup
      const weeklySummaries = getWeeklyHabitSummaries(habits, completionHistory, today);
      const weekHealth = computeWeekHealth(weeklySummaries);

      // Check for yesterday carry-over using due_day (canonical)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayYear = yesterday.getFullYear();
      const yesterdayMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yesterdayDay = String(yesterday.getDate()).padStart(2, '0');
      const yesterdayDayStr = `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;

      const hasYesterdayCarryOver = todos.some((todo) => {
        // Skip completed todos
        if ((todo as any).status === 'completed') return false;
        // Use due_day as canonical
        if (!todo.due_day) return false;
        return todo.due_day === yesterdayDayStr;
      });

      const timeWindow = getTimeWindow(today);

      // Mark that we've loaded at least once
      hasLoadedOnceRef.current = true;

      setData({
        greeting: getGreeting(timeWindow, user.email?.split('@')[0] || ''),
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
        weekHealth,
        capturesCount,
        unsortedCount,
        loading: false,
        allHabits: habits,
        allTodos: todos,
      });

      // Surface membership probes for test mode
      probeMembership('TodayLocked', lockedItems);
      probeMembership('TodayActive', activeItems);
      probeMembership('TodayFuture', futureItems);
      probeMembership('TodayCompleted', completedToday);
      probeMembership('AllTodos', todos);
      probeMembership('AllHabits', habits);

      isLoadingRef.current = false;
      console.log('[useNowData] ✅ Load complete');
    } catch (error) {
      // Throttle error logging to prevent spam
      const now = Date.now();
      const timeSinceLastError = now - lastErrorTimeRef.current;

      // Only log error if it's been more than 5 seconds since last error
      if (timeSinceLastError > 5000) {
        console.error('[useNowData] Error loading data:', error);
        errorCountRef.current = 1;
      } else {
        errorCountRef.current += 1;
      }

      lastErrorTimeRef.current = now;

      // If we've had 3+ errors in quick succession, log a summary
      if (errorCountRef.current === 3) {
        console.error(
          '[useNowData] Multiple network errors detected. Check:',
          '\n1. Are you logged in?',
          '\n2. Is your internet connection working?',
          '\n3. Are your Supabase credentials correct?',
        );
      }

      setData((prev) => ({ ...prev, loading: false }));
      isLoadingRef.current = false;
    }
  }, [repo, user]); // Removed 'today' from deps - it causes infinite loops since it's a new Date() each time

  useEffect(() => {
    load();
  }, [load]);

  // Auto-reload when an overlay is saved or an item is updated/deleted
  // This ensures the Today lane updates immediately without waiting for Supabase realtime
  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    unsubscribes.push(
      eventBus.on('OverlaySaved', (event: { id?: string; type?: string }) => {
        console.log('[useNowData] OverlaySaved event, reloading...', event);
        void load();
      }),
    );

    // Listen for ItemUpdated (emitted on delete, update)
    unsubscribes.push(
      eventBus.on('ItemUpdated', (event: { id: string }) => {
        console.log('[useNowData] ItemUpdated event, reloading...', event);
        void load();
      }),
    );

    // Listen for ItemCompleted (emitted on completion)
    unsubscribes.push(
      eventBus.on('ItemCompleted', () => {
        console.log('[useNowData] ItemCompleted event, reloading...');
        void load();
      }),
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [load]);

  return {
    ...data,
    reload: load,
  };
}
