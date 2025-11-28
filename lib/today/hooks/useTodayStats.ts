/**
 * useTodayStats Hook
 * Single source of truth for Today/Now page statistics
 *
 * This hook provides derived stats from the same filtered collections
 * that feed the Today cards (via useNowData), ensuring consistency
 * across all components that display Today statistics.
 *
 * Supports optimistic updates via optional completedTodoIds/completedHabitIds
 * sets, which adjust the counts immediately before server sync.
 */

import { useMemo } from 'react';
import { useNowData, type UseNowDataReturn } from '../../now/useNowData';
import type {
  NowLockedItem,
  NowActiveItem,
  NowFutureItem,
  NowCompletedItem,
} from '../../now/nowTypes';

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
  /** Number of unsorted items waiting for sweep */
  unsortedCount: number;
  /** Loading state */
  loading: boolean;
  /** Reload the underlying data */
  reload: () => Promise<void>;
  /** Raw nowData for components that need additional fields */
  nowData: UseNowDataReturn;
}

/**
 * Hook providing centralized statistics for Today/Now page
 *
 * Reuses the same filtered collections from useNowData to ensure
 * consistency across all Today-related UI components.
 *
 * Supports optimistic updates: pass completedTodoIds/completedHabitIds
 * to adjust counts immediately before server sync.
 *
 * @param options - Configuration options including optimistic state
 * @returns TodayStats object with all derived statistics
 */
export function useTodayStats(options: UseTodayStatsOptions = {}): TodayStats {
  const {
    today,
    completedTodoIds = new Set<string>(),
    completedHabitIds = new Set<string>(),
    deletedItemIds = new Set<string>(),
  } = options;

  const nowData = useNowData(today);

  return useMemo(() => {
    const {
      lockedItems: rawLockedItems,
      activeItems: rawActiveItems,
      futureItems: rawFutureItems,
      completedToday: serverCompletedToday,
      capturesCount,
      progressState,
      loading,
      reload,
    } = nowData;

    // Filter out deleted items for optimistic UI
    const lockedItems = rawLockedItems.filter((item) => !deletedItemIds.has(item.id));
    const activeItems = rawActiveItems.filter((item) => !deletedItemIds.has(item.id));
    const futureItems = rawFutureItems.filter((item) => !deletedItemIds.has(item.id));

    // Combine locked + active for "today's focus" items
    const todayFocusItems = [...lockedItems, ...activeItems];

    // Filter by type
    const todosToday = todayFocusItems.filter((item) => item.type === 'todo');
    const habitsToday = todayFocusItems.filter((item) => item.type === 'habit');

    // Build optimistic completed list
    const serverCompletedIds = new Set(serverCompletedToday.map((item) => item.id));
    const allItems = [...lockedItems, ...activeItems, ...futureItems];
    const completedToday: NowCompletedItem[] = [...serverCompletedToday];

    // Count new optimistic completions (not yet persisted)
    let optimisticCount = 0;

    // Add optimistically completed todos not yet on server
    for (const id of completedTodoIds) {
      if (!serverCompletedIds.has(id)) {
        const item = allItems.find((i) => i.id === id && i.type === 'todo');
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
        const item = allItems.find((i) => i.id === id && i.type === 'habit');
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

    // Total counts (adjusted for optimistic completions)
    const totalTasksToday = progressState.totalEligibleCount;
    const totalCompletedToday = progressState.completedCount + optimisticCount;

    // Progress fraction (0-1), safe from division by zero
    const progressFraction =
      totalTasksToday > 0 ? Math.min(1, totalCompletedToday / totalTasksToday) : 0;

    // Progress percent (0-100)
    const progressPercent = Math.round(progressFraction * 100);

    // Boolean flags
    const hasAnyTodayWork = todayFocusItems.length > 0 || completedToday.length > 0;
    const hasAnyLogsToday = capturesCount > 0;

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
      futureItems,
      unsortedCount: nowData.unsortedCount,
      loading,
      reload,
      nowData,
    };
  }, [nowData, completedTodoIds, completedHabitIds, deletedItemIds]);
}
