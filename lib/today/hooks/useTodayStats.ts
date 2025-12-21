/**
 * useTodayStats Hook
 * Single source of truth for Today/Now page statistics
 *
 * MIGRATED TO ZUSTAND STORE - Uses store selectors instead of useNowData.
 * This hook provides derived stats from the store, ensuring consistency
 * across all components that display Today statistics.
 *
 * Supports optimistic updates via optional completedTodoIds/completedHabitIds
 * sets, which adjust the counts immediately before server sync.
 */

import { useMemo, useEffect } from 'react';
import { useGremlyStore } from '../../store/useGremlyStore';
import {
  selectTodosDueToday,
  selectHabitsDueToday,
  selectTodosCompletedToday,
  selectHabitsCompletedToday,
  selectOverdueTodos,
  selectLockedTodos,
  selectTodayLockedItems,
  selectTodayActiveItems,
  selectTodayCompletedItems,
  selectTodayProgress,
  selectSweepCandidatesUnified,
  selectRecentDrops,
  selectUndatedTodos,
} from '../../store/selectors';
import type { SweepCandidate } from '../sweepSelectors';
import { getTodayDayString, computeDueDay } from '../../date/computeDueDay';
import { probeMembership } from '../../config/surfaceProbe';
import type { Todo, Habit } from '../../types';

// ───────────────────────────────────────────────────────────────────────────────
// TodayCompletionSummary - Drives progress bar + completion dots
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Summary of today's completion status for the progress header.
 * Includes only active habits and todos in Today's Focus.
 * Excludes logs and archived items.
 */
export type TodayCompletionSummary = {
  /** Individual items with completion status */
  items: { id: string; isDone: boolean; type: 'habit' | 'todo' }[];
  /** Number of completed items */
  completedCount: number;
  /** Total number of items (habits + todos, no logs) */
  totalCount: number;
};

// Types for store items (same shape as NowLockedItem/NowActiveItem/etc)
export type NowLockedItem = (Todo | Habit) & { type: 'todo' | 'habit'; name: string };
export type NowActiveItem = (Todo | Habit) & { type: 'todo' | 'habit'; name: string };
export type NowFutureItem = (Todo | Habit) & { type: 'todo' | 'habit'; name: string };
export type NowCompletedItem = {
  id: string;
  type: 'todo' | 'habit';
  name: string;
  completedAt: string;
};

/**
 * Options for useTodayStats hook
 */
export interface UseTodayStatsOptions {
  /** Optional date for testing, defaults to now */
  today?: Date;
  /** Set of todo IDs that are optimistically completed (not yet persisted) */
  completedTodoIds?: Set<string>;
  /** Set of habit IDs that are optimistically completed (not yet persisted) */
  completedHabitIds?: Set<string>;
  /** Set of item IDs that are optimistically deleted */
  deletedItemIds?: Set<string>;
}

/**
 * Stats interface for Today/Now page
 */
export interface TodayStats {
  /** All todos scheduled for today (locked + active), excluding deleted */
  todosToday: Array<NowLockedItem | NowActiveItem>;
  /** Completed todos for today (including optimistic) */
  completedTodosToday: NowCompletedItem[];
  /** All habits due today (locked + active), excluding deleted */
  habitsToday: Array<NowLockedItem | NowActiveItem>;
  /** Completed habits for today (including optimistic) */
  completedHabitsToday: NowCompletedItem[];
  /** All completed items for today (including optimistic) */
  completedToday: NowCompletedItem[];
  /** Today's log count (from captures) */
  logsToday: number;
  /** Total tasks (habits + todos) for today */
  totalTasksToday: number;
  /** Total completed tasks for today (including optimistic) */
  totalCompletedToday: number;
  /** Progress fraction (0-1), safe from NaN, includes optimistic */
  progressFraction: number;
  /** Progress as percent (0-100), includes optimistic */
  progressPercent: number;
  /** Whether there's any work scheduled for today */
  hasAnyTodayWork: boolean;
  /** Whether any logs were captured today */
  hasAnyLogsToday: boolean;
  /** Locked items (highest priority), excluding deleted */
  lockedItems: NowLockedItem[];
  /** Active items for today, excluding deleted */
  activeItems: NowActiveItem[];
  /** Future items (tomorrow or later), excluding deleted */
  futureItems: NowFutureItem[];
  /** Sweep-eligible todos (incomplete todos due today/overdue/carry-forward) */
  sweepCandidates: SweepCandidate[];
  /** Count of sweep-eligible todos */
  sweepCandidateCount: number;
  /** Overdue todos from sweepCandidates (due_day < today) */
  overdueTodos: SweepCandidate[];
  /** Recent drops: items created today, not in Today's Focus, and unscheduled (need triage) */
  recentDrops: SweepCandidate[];
  /** Today's date in YYYY-MM-DD format (local timezone) - use this for due_day assignments */
  todayDayString: string;
  /** Loading state */
  loading: boolean;
  /** Reload the underlying data - No-op for store (auto-syncs) */
  reload: () => Promise<void>;
  /** Raw nowData for components that need additional fields - deprecated, use store directly */
  nowData: null;
  /** Completion summary for progress header (items, completedCount, totalCount) */
  completionSummary: TodayCompletionSummary;
}

/**
 * Internal hook providing centralized statistics for Today/Now page
 *
 * MIGRATED TO ZUSTAND - Uses store selectors instead of useNowData.
 * Supports optimistic updates: pass completedTodoIds/completedHabitIds
 * to adjust counts immediately before server sync.
 *
 * @param options - Configuration options including optimistic state
 * @returns TodayStats object with all derived statistics
 */
function useTodayStatsInternal(options: UseTodayStatsOptions = {}): TodayStats {
  const {
    completedTodoIds = new Set<string>(),
    completedHabitIds = new Set<string>(),
    deletedItemIds = new Set<string>(),
  } = options;

  // Get store state via selectors
  const isLoading = useGremlyStore((s) => s.isLoading);
  const notes = useGremlyStore((s) => s.notes);

  // Use memoized selectors for derived data
  const lockedItemsRaw = useGremlyStore(selectTodayLockedItems);
  const activeItemsRaw = useGremlyStore(selectTodayActiveItems);
  const completedItemsRaw = useGremlyStore(selectTodayCompletedItems);
  const sweepCandidatesWithMeta = useGremlyStore(selectSweepCandidatesUnified);
  const overdueTodosRaw = useGremlyStore(selectOverdueTodos);
  const recentDropsRaw = useGremlyStore(selectRecentDrops);
  const progressState = useGremlyStore(selectTodayProgress);

  return useMemo(() => {
    const todayDayString = getTodayDayString();

    // Filter out deleted items for optimistic UI
    const lockedItems = lockedItemsRaw
      .filter((item) => !deletedItemIds.has(item.id))
      .map((item) => ({
        ...item,
        type: 'id' in item && 'target_count' in item ? ('habit' as const) : ('todo' as const),
        name: (item as any).name || (item as any).title || '',
      })) as NowLockedItem[];

    const activeItems = activeItemsRaw
      .filter((item) => !deletedItemIds.has(item.id))
      .map((item) => ({
        ...item,
        type: 'id' in item && 'target_count' in item ? ('habit' as const) : ('todo' as const),
        name: (item as any).name || (item as any).title || '',
      })) as NowActiveItem[];

    // Combine locked + active for "today's focus" items
    const todayFocusItems = [...lockedItems, ...activeItems];

    // Filter by type
    const todosToday = todayFocusItems.filter((item) => item.type === 'todo');
    const habitsToday = todayFocusItems.filter((item) => item.type === 'habit');

    // Build completed list from store
    const serverCompletedIds = new Set(completedItemsRaw.map((item) => item.id));
    const completedToday: NowCompletedItem[] = completedItemsRaw.map((item) => ({
      id: item.id,
      type: 'target_count' in item ? ('habit' as const) : ('todo' as const),
      name: (item as any).name || (item as any).title || '',
      completedAt: (item as any).completed_at || new Date().toISOString(),
    }));

    // Count new optimistic completions (not yet persisted)
    let optimisticCount = 0;

    // Add optimistically completed todos not yet on server
    for (const id of completedTodoIds) {
      if (!serverCompletedIds.has(id)) {
        const item = [...lockedItems, ...activeItems].find((i) => i.id === id && i.type === 'todo');
        if (item) {
          completedToday.push({
            id: item.id,
            type: 'todo',
            name: item.name,
            completedAt: new Date().toISOString(),
          });
          optimisticCount++;
        }
      }
    }

    // Add optimistically completed habits not yet on server
    for (const id of completedHabitIds) {
      if (!serverCompletedIds.has(id)) {
        const item = [...lockedItems, ...activeItems].find(
          (i) => i.id === id && i.type === 'habit',
        );
        if (item) {
          completedToday.push({
            id: item.id,
            type: 'habit',
            name: item.name,
            completedAt: new Date().toISOString(),
          });
          optimisticCount++;
        }
      }
    }

    // Completed items by type (including optimistic)
    const completedTodosToday = completedToday.filter((item) => item.type === 'todo');
    const completedHabitsToday = completedToday.filter((item) => item.type === 'habit');

    // Count captures/logs for today
    const capturesCount = notes.filter(
      (n) => n.subtype === 'catchall' && n.created_at?.startsWith(todayDayString),
    ).length;

    // Total counts (adjusted for optimistic completions)
    const totalTasksToday = progressState.totalEligible;
    const totalCompletedToday = progressState.completedCount + optimisticCount;

    // Progress fraction (0-1), safe from division by zero
    const progressFraction =
      totalTasksToday > 0 ? Math.min(1, totalCompletedToday / totalTasksToday) : 0;

    // Progress percent (0-100)
    const progressPercent = Math.round(progressFraction * 100);

    // Boolean flags
    const hasAnyTodayWork = todayFocusItems.length > 0 || completedToday.length > 0;
    const hasAnyLogsToday = capturesCount > 0;

    // Transform sweep candidates to legacy format (only todos)
    // sweepCandidatesWithMeta is Array<{ candidate, meta }>, extract candidate
    const sweepCandidates: SweepCandidate[] = sweepCandidatesWithMeta
      .map(({ candidate: c }) => c)
      .filter((c) => c.kind === 'todo')
      .map((c) => ({
        id: c.id,
        type: 'todo' as const,
        name: (c.raw as any)?.name || (c.raw as any)?.title || '',
        due_day: (c.raw as any)?.due_day,
        due_date: (c.raw as any)?.due_date,
        status: 'active' as const,
        carry_forward: (c.raw as any)?.carry_forward ?? false,
        completed_at: null,
        archived: false,
        created_at: c.createdAt,
        isOverdue: c.isOverdue,
      }));
    const sweepCandidateCount = sweepCandidates.length;

    // Derive overdueTodos from store selector
    const overdueTodos: SweepCandidate[] = overdueTodosRaw.map((todo) => ({
      id: todo.id,
      type: 'todo' as const,
      name: todo.name || '',
      due_day: todo.due_day,
      due_date: todo.due_date,
      status: 'active' as const,
      carry_forward: (todo as any).carry_forward ?? false,
      completed_at: null,
      archived: false,
      created_at: todo.created_at,
      isOverdue: true,
    }));

    // Recent drops from store
    const recentDrops: SweepCandidate[] = recentDropsRaw.map((todo) => ({
      id: todo.id,
      type: 'todo' as const,
      name: todo.name || '',
      due_day: todo.due_day,
      due_date: todo.due_date,
      status: 'active' as const,
      carry_forward: (todo as any).carry_forward ?? false,
      completed_at: null,
      archived: false,
      created_at: todo.created_at,
      isOverdue: false,
    }));

    // Build completion summary for progress header
    const completionSummaryItems: { id: string; isDone: boolean; type: 'habit' | 'todo' }[] = [];

    // Add all todos with their completion status
    for (const item of todosToday) {
      const isDone = completedTodoIds.has(item.id) || serverCompletedIds.has(item.id);
      completionSummaryItems.push({ id: item.id, isDone, type: 'todo' });
    }

    // Add all habits with their completion status
    for (const item of habitsToday) {
      const isDone = completedHabitIds.has(item.id) || serverCompletedIds.has(item.id);
      completionSummaryItems.push({ id: item.id, isDone, type: 'habit' });
    }

    // Add server-completed items that aren't already in focus lists
    for (const item of completedToday) {
      const alreadyIncluded = completionSummaryItems.some((i) => i.id === item.id);
      if (!alreadyIncluded && (item.type === 'todo' || item.type === 'habit')) {
        completionSummaryItems.push({ id: item.id, isDone: true, type: item.type });
      }
    }

    const completionSummary: TodayCompletionSummary = {
      items: completionSummaryItems,
      completedCount: totalCompletedToday,
      totalCount: totalTasksToday,
    };

    // No-op reload - store auto-syncs via realtime
    const reload = async () => {
      // Store auto-updates, no manual reload needed
    };

    return {
      todosToday,
      completedTodosToday,
      habitsToday,
      completedHabitsToday,
      completedToday,
      logsToday: capturesCount,
      totalTasksToday,
      totalCompletedToday,
      progressFraction,
      progressPercent,
      hasAnyTodayWork,
      hasAnyLogsToday,
      lockedItems,
      activeItems,
      futureItems: [], // Future items not currently tracked in store selectors
      sweepCandidates,
      sweepCandidateCount,
      overdueTodos,
      recentDrops,
      todayDayString,
      loading: isLoading,
      reload,
      nowData: null, // Deprecated - use store directly
      completionSummary,
    };
  }, [
    lockedItemsRaw,
    activeItemsRaw,
    completedItemsRaw,
    sweepCandidatesWithMeta,
    overdueTodosRaw,
    recentDropsRaw,
    progressState,
    notes,
    isLoading,
    completedTodoIds,
    completedHabitIds,
    deletedItemIds,
  ]);
}

/**
 * Hook providing centralized statistics for Today/Now page with surface probing
 *
 * Wrapper around internal computation that adds surface membership probes
 * for TEST_MODE.
 */
export function useTodayStats(options: UseTodayStatsOptions = {}): TodayStats {
  const stats = useTodayStatsInternal(options);

  // Surface membership probes - only fires when data changes
  useEffect(() => {
    probeMembership('SweepCandidates', stats.sweepCandidates);
    probeMembership('RecentDrops', stats.recentDrops);
    probeMembership('OverdueTodos', stats.overdueTodos);
  }, [stats.sweepCandidates, stats.recentDrops, stats.overdueTodos]);

  return stats;
}
