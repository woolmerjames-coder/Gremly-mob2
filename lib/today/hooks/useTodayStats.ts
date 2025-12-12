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

import { useMemo, useEffect } from 'react';
import { useNowData, type UseNowDataReturn } from '../../now/useNowData';
import { selectSweepCandidates, type SweepCandidate } from '../sweepSelectors';
import { getTodayDayString, computeDueDay } from '../../date/computeDueDay';
import { probeMembership } from '../../config/surfaceProbe';
import type {
  NowLockedItem,
  NowActiveItem,
  NowFutureItem,
  NowCompletedItem,
} from '../../now/nowTypes';

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
  /** Reload the underlying data */
  reload: () => Promise<void>;
  /** Raw nowData for components that need additional fields */
  nowData: UseNowDataReturn;
  /** Completion summary for progress header (items, completedCount, totalCount) */
  completionSummary: TodayCompletionSummary;
}

/**
 * Internal hook providing centralized statistics for Today/Now page
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
function useTodayStatsInternal(options: UseTodayStatsOptions = {}): TodayStats {
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

    // Compute sweep candidates using shared selector
    // Only todos that are incomplete and due today/overdue/carry-forward
    // Use local date (not UTC) to match user's mental model
    const todayDayString = getTodayDayString();

    // Get all todos from nowData for comprehensive sweep/recentDrops filtering
    const { allTodos = [] } = nowData;

    // Build the todos array for sweep selection from ALL todos (not just todosToday)
    // This ensures we include overdue items and items without due dates
    // Filter out optimistically completed items and archived/completed items
    const incompleteTodos = allTodos
      .filter((todo) => {
        // Skip optimistically completed
        if (completedTodoIds.has(todo.id)) return false;
        // Skip completed or archived
        const status = (todo as any).status;
        if (status === 'completed' || status === 'archived') return false;
        if (todo.archived === true) return false;
        return true;
      })
      .map((todo) => ({
        id: todo.id,
        name: todo.name,
        type: 'todo' as const,
        due_day: todo.due_day,
        due_date: todo.due_date,
        status: 'active' as const,
        carry_forward: (todo as any).carry_forward ?? false,
        completed_at: null,
        archived: false,
        created_at: todo.created_at,
      }));

    const sweepCandidates = selectSweepCandidates(incompleteTodos, todayDayString);
    const sweepCandidateCount = sweepCandidates.length;

    // Derive overdueTodos: todos from sweepCandidates where due_day < today
    // Use computeDueDay to handle timezone-aware date extraction from due_date
    const overdueTodos = sweepCandidates.filter((candidate) => {
      const dueDay = candidate.due_day ?? computeDueDay(candidate.due_date);
      return dueDay !== null && dueDay < todayDayString;
    });

    // Derive recentDrops: items captured today that need sorting
    // These are items that:
    // 1. Were created today (created_at converted to LOCAL date === todayDayString)
    // 2. Are NOT already in Today's Focus (locked or active items)
    // 3. Are unscheduled (no due_day) - need triage
    // 4. Are not completed/archived (already filtered in incompleteTodos)
    //
    // NOTE: We filter from incompleteTodos (not sweepCandidates) because
    // sweepCandidates excludes items without due dates, but recentDrops
    // specifically wants items WITHOUT due dates that need triage.
    const todayFocusIds = new Set([
      ...todosToday.map((t) => t.id),
      ...habitsToday.map((h) => h.id),
    ]);

    const recentDrops: SweepCandidate[] = incompleteTodos
      .filter((todo) => {
        // Exclude items already in Today's Focus
        if (todayFocusIds.has(todo.id)) {
          return false;
        }

        // Must be created today (convert UTC created_at to local date)
        const createdLocalDay = computeDueDay(todo.created_at);
        if (createdLocalDay !== todayDayString) {
          return false;
        }

        // Must be unscheduled (no due date) - these need sorting/triage
        const dueDay = todo.due_day ?? computeDueDay(todo.due_date);
        return dueDay === null;
      })
      .map((todo) => ({
        id: todo.id,
        type: 'todo' as const,
        name: todo.name,
        due_day: todo.due_day,
        due_date: todo.due_date,
        status: todo.status,
        carry_forward: todo.carry_forward,
        completed_at: todo.completed_at,
        archived: todo.archived,
        space_id: undefined, // Not available in incompleteTodos map
        tags: undefined, // Not available in incompleteTodos map
        created_at: todo.created_at,
        isOverdue: false, // Items without due date are not overdue
      }));

    // Build completion summary for progress header
    // Includes all items in Today's Focus (locked + active), excluding logs
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
    // (items completed earlier today that are no longer "active")
    for (const item of serverCompletedToday) {
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
      sweepCandidates,
      sweepCandidateCount,
      overdueTodos,
      recentDrops,
      todayDayString,
      loading,
      reload,
      nowData,
      completionSummary,
    };
  }, [nowData, completedTodoIds, completedHabitIds, deletedItemIds]);
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
