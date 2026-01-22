/**
 * Now Screen V1 - Main NOW page
 * Feature flag: EXPO_PUBLIC_NOW_V1
 * Phase 3: Real data wiring
 * Phase 4: Wire interactions
 *
 * TODO: Remove legacy SweepDrawer component once Sweep v2 has shipped to prod.
 *       SweepDrawer.tsx still exists at components/today/v3/SweepDrawer.tsx but is no longer used.
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Text,
  Animated,
  Easing,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { getDateService } from '../../lib/date';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowFocusRow } from '../../components/now/NowFocusRow';
import { NowCalendarEventRow } from '../../components/now/NowCalendarEventRow';
import { NowFutureDivider } from '../../components/now/NowFutureDivider';
import { RolledOverSection, RecentDropsSection, SweepPill } from '../../components/now';
import { NowQuickAddModal } from '../../components/now/NowQuickAddModal';
import { OverwhelmSelectSheet } from '../../components/now/OverwhelmSelectSheet';
import { OverwhelmPlanSheet } from '../../components/now/OverwhelmPlanSheet';
import { OverwhelmFocusOverlay } from '../../components/now/OverwhelmFocusOverlay';
import { NowProgressPopup } from '../../components/now/NowProgressPopup';
import { NowWeekPopup } from '../../components/now/NowWeekPopup';
import { YourNotesPopup } from '../../components/now/YourNotesPopup';
import { JournalFullScreen } from '../../components/now/JournalFullScreen';
import { MorningBriefSheet } from '../components/morning-brief/MorningBriefSheet';
import { useMorningBrief } from '../../lib/today/hooks/useMorningBrief';
import GremlyHelpCard from '../../components/help/GremlyHelpCard';
import FirstTodayVisitBubble from '../../components/onboarding/FirstTodayVisitBubble';
import { useDailyAppOpen } from '../../lib/today/hooks/useDailyAppOpen';
// Store and selectors
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import {
  useLockedItems,
  useActiveItems,
  useTodayProgress,
  useOverdueTodos,
  useRecentDrops,
  useSweepCountUnified,
  useCompletedToday,
  useTodayHabits,
  useYourNotes,
  useTodayLogsCount,
  useIsLoading,
  useHabitsCompletedToday,
  useHubHabits,
  useWeeklyHabitSummaries,
  useHabitsUpToDateCount,
} from '../../lib/store/selectors';
import { useNowQuickAdd } from '../../lib/now/useNowQuickAdd';
import { useOverwhelmFlow } from '../../lib/now/useOverwhelmFlow';
import { useActionToast } from '../../src/hooks/useActionToast';
import { getTodayEmptyState, getTodayEmptyStateContent } from '../../lib/today/getTodayEmptyState';
import type { LogItem } from '../../lib/notes/useRecentLogs';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import type {
  NowLockedItem,
  NowActiveItem,
  NowFutureItem,
  NowCompletedItem,
} from '../../lib/now/nowTypes';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';
import type { CalendarEvent } from '../../lib/calendar/CalendarClient';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { Habit, Todo, Space } from '../../lib/types';
import { eventBus } from '../../lib/events';
import { TimeBlockSection } from '../../components/now/TimeBlockSection';
import { CalendarHint } from '../../components/now/CalendarHint';
import {
  getCurrentTimeBlock,
  groupEventsByTimeBlock,
  formatEventTimeForHint,
  type TimeBlock,
} from '../../lib/now/timeBlockHelpers';

// Stable empty array to avoid creating new references in selectors
const EMPTY_CALENDAR_EVENTS: CalendarEvent[] = [];

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE TRANSFORMERS - Convert raw store types to Now screen types
// ═══════════════════════════════════════════════════════════════════════════════

/** Transform raw Todo/Habit to NowLockedItem */
function toLockedItem(item: Todo | Habit, spacesMap: Map<string, Space>): NowLockedItem {
  const isHabit = 'cadence' in item;
  const spaceId = item.space_id ?? null;
  const space = spaceId ? spacesMap.get(spaceId) : null;
  return {
    id: item.id,
    type: isHabit ? 'habit' : 'todo',
    name: item.name,
    locked: true as const,
    dueDay: isHabit ? null : ((item as Todo).due_day ?? null),
    cadence: isHabit ? (item as Habit).cadence : undefined,
    targetPerPeriod: isHabit ? (item as Habit).target_per_period : undefined,
    frequency: isHabit ? (item as Habit).frequency : undefined,
    spaceId,
    spaceName: space?.name ?? null,
  };
}

/** Transform raw Todo/Habit to NowActiveItem */
function toActiveItem(item: Todo | Habit, spacesMap: Map<string, Space>): NowActiveItem {
  const isHabit = 'cadence' in item;
  const spaceId = item.space_id ?? null;
  const space = spaceId ? spacesMap.get(spaceId) : null;
  return {
    id: item.id,
    type: isHabit ? 'habit' : 'todo',
    name: item.name,
    locked: false as const,
    dueDay: isHabit ? null : ((item as Todo).due_day ?? null),
    dueTime: isHabit ? null : ((item as Todo).due_time ?? null),
    cadence: isHabit ? (item as Habit).cadence : undefined,
    spaceId,
    spaceName: space?.name ?? null,
    targetPerPeriod: isHabit ? (item as Habit).target_per_period : undefined,
    frequency: isHabit ? (item as Habit).frequency : undefined,
  };
}

/** Transform raw Todo/Habit to NowCompletedItem */
function toCompletedItem(item: Todo | Habit): NowCompletedItem {
  const isHabit = 'cadence' in item;
  return {
    id: item.id,
    type: isHabit ? 'habit' : 'todo',
    name: item.name,
    completedAt: isHabit
      ? ((item as Habit).last_completed_at ?? new Date().toISOString())
      : ((item as Todo).completed_at ?? new Date().toISOString()),
  };
}

/** Transform raw Todo to SweepCandidate */
function toSweepCandidate(todo: Todo, todayDayString: string): SweepCandidate {
  const dueDay = todo.due_day ?? null;
  const isOverdue = dueDay !== null && dueDay < todayDayString;
  return {
    id: todo.id,
    name: todo.name,
    type: 'todo',
    due_day: dueDay,
    due_date: todo.due_date ?? null,
    status: 'active',
    carry_forward: (todo as any).carry_forward ?? false,
    completed_at: todo.completed_at ?? null,
    archived: todo.archived ?? false,
    created_at: todo.created_at ?? null,
    isOverdue,
    space_id: todo.space_id ?? null,
  };
}

/**
 * Time window priority for sorting
 * Lower number = higher priority (shown first)
 */
const TIME_WINDOW_PRIORITY: Record<string, number> = {
  morning: 1,
  any: 2,
  midday: 3,
  afternoon: 4,
  evening: 5,
};

/**
 * Infer time window from item name if not explicitly set
 * Looks for keywords like "Morning", "Evening", "Daily" in the name
 */
function inferTimeWindow(item: NowActiveItem): string {
  // If explicitly set, use it
  if (item.timeWindow && item.timeWindow !== 'any') {
    return item.timeWindow;
  }

  // Infer from name (case-insensitive)
  const nameLower = item.name.toLowerCase();

  if (nameLower.includes('morning')) {
    return 'morning';
  }
  if (nameLower.includes('evening') || nameLower.includes('night')) {
    return 'evening';
  }
  if (nameLower.includes('afternoon')) {
    return 'afternoon';
  }
  if (nameLower.includes('midday') || nameLower.includes('noon') || nameLower.includes('lunch')) {
    return 'midday';
  }

  // Default to 'any' for daily/anytime items
  return 'any';
}

/**
 * Parse time string (HH:mm) to minutes since midnight for comparison
 */
function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

/**
 * Sort active items by time window priority and due time
 * Order: morning → any → midday → afternoon → evening
 * Within each group: sort by specific due time (earliest first), then by name
 */
function sortActiveItems<T extends NowActiveItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Get time window priority, inferring from name if not set
    const aWindow = inferTimeWindow(a);
    const bWindow = inferTimeWindow(b);
    const aPriority = TIME_WINDOW_PRIORITY[aWindow] ?? 2;
    const bPriority = TIME_WINDOW_PRIORITY[bWindow] ?? 2;

    // Compare by time window first
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Within same time window, sort by specific due time
    const aTime = parseTimeToMinutes(a.dueTime);
    const bTime = parseTimeToMinutes(b.dueTime);

    // Items with specific time come before items without
    if (aTime !== null && bTime === null) return -1;
    if (aTime === null && bTime !== null) return 1;

    // Both have times - sort by time (earliest first)
    if (aTime !== null && bTime !== null) {
      if (aTime !== bTime) return aTime - bTime;
    }

    // Finally, sort alphabetically by name as tiebreaker
    return a.name.localeCompare(b.name);
  });
}

export default function NowScreenV1() {
  // Safe area insets for proper bottom positioning
  const insets = useSafeAreaInsets();

  // ═══════════════════════════════════════════════════════════════════
  // STORE SELECTORS - Data from Zustand store
  // ═══════════════════════════════════════════════════════════════════

  // Loading state
  const loading = useIsLoading();
  const isInitialized = useGremlyStore((state) => state.isInitialized);
  const gremlyAge = useGremlyStore((state) => state.gremlyAge);
  const firstTodayVisitCompletedAt = useGremlyStore((s) => s.firstTodayVisitCompletedAt);
  const onboardingCompletedAt = useGremlyStore((s) => s.onboardingCompletedAt);
  const markFirstTodayVisitComplete = useGremlyStore((s) => s.markFirstTodayVisitComplete);

  // Calendar integration - access today's events from the Record
  const todayStr = useMemo(() => getDateService().getCurrentDate(), []);
  const todayCalendarEvents = useGremlyStore(
    useCallback((s) => s.calendarEvents[todayStr] ?? EMPTY_CALENDAR_EVENTS, [todayStr]),
  );
  const fetchCalendarEvents = useGremlyStore((s) => s.fetchCalendarEventsForRange);

  // Debug: log calendar events selector result
  console.log(
    '[NowScreen] todayCalendarEvents:',
    todayCalendarEvents.length,
    'for date:',
    todayStr,
  );

  // Morning Brief - sequences and brief state
  const { hasCompletedBriefToday, brief } = useMorningBrief();
  const [isBriefSheetVisible, setBriefSheetVisible] = useState(false);

  // Daily app open detection
  const { isFirstOpenToday, isChecking, markTodayOpened } = useDailyAppOpen();

  // Fetch calendar events on mount (today + 7 days)
  useEffect(() => {
    console.log('[NowScreen] Calendar useEffect, isInitialized:', isInitialized);
    if (!isInitialized) return;
    const dateService = getDateService();
    const today = dateService.getCurrentDate();
    const weekFromNow = dateService.addDays(today, 7);
    console.log('[NowScreen] Fetching calendar:', today, 'to', weekFromNow);
    fetchCalendarEvents(today, weekFromNow);
  }, [isInitialized, fetchCalendarEvents]);

  // Auto-open Morning Brief on first open of the day (skip for brand new users)
  useEffect(() => {
    if (gremlyAge < 1) return; // Don't show for brand new users - let them explore first
    if (!isChecking && isFirstOpenToday && !hasCompletedBriefToday && isInitialized && !loading) {
      // Small delay to let the screen render first
      const timer = setTimeout(() => {
        setBriefSheetVisible(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [gremlyAge, isChecking, isFirstOpenToday, hasCompletedBriefToday, isInitialized, loading]);

  // Show first-visit bubble for new users
  useEffect(() => {
    if (onboardingCompletedAt && !firstTodayVisitCompletedAt && isInitialized) {
      const timer = setTimeout(() => setShowFirstVisitBubble(true), 600);
      return () => clearTimeout(timer);
    }
  }, [onboardingCompletedAt, firstTodayVisitCompletedAt, isInitialized]);

  // Today's items - from selectors (single source of truth)
  const rawLockedItems = useLockedItems();
  const activeItems = useActiveItems();
  const completedToday = useCompletedToday();
  const overdueTodos = useOverdueTodos();
  const recentDrops = useRecentDrops();

  // Derive lockedItemIds from selector result
  const lockedItemIds = useMemo(
    () => new Set(rawLockedItems.map((item) => item.id)),
    [rawLockedItems],
  );

  // Habits
  const habitsToday = useTodayHabits();
  const completedHabitsToday = useHabitsCompletedToday();
  const allActiveHabits = useHubHabits(); // All non-archived habits for NowWeekPopup
  const weeklySummaries = useWeeklyHabitSummaries(); // Weekly habit summaries for NowWeekPopup
  const habitsUpToDate = useHabitsUpToDateCount(); // Habits up to date count for header

  // Spaces - for looking up space names
  const spaces = useGremlyStore((state) => state.spaces);
  const spacesMap = useMemo(() => {
    const map = new Map<string, Space>();
    for (const space of spaces) {
      map.set(space.id, space);
    }
    return map;
  }, [spaces]);

  // Progress stats
  const progress = useTodayProgress();
  const {
    completedCount: totalCompletedToday,
    totalEligible: totalTasksToday,
    percent: progressPercent,
  } = progress;

  // Compute today's habit and todo counts for header
  const todayHabitCount = habitsToday.length;
  const todayTodoCount = useMemo(() => {
    // Count todos in locked + active items (not habits)
    const lockedTodoCount = rawLockedItems.filter((item) => !('cadence' in item)).length;
    const activeTodoCount = activeItems.filter((item) => !('cadence' in item)).length;
    return lockedTodoCount + activeTodoCount;
  }, [rawLockedItems, activeItems]);

  // Calculate remaining time estimate for incomplete todos
  const remainingMinutes = useMemo(() => {
    const allItems = [...rawLockedItems, ...activeItems];
    return allItems
      .filter((item) => !('cadence' in item)) // Only todos
      .reduce((sum, item) => {
        const todo = item as Todo;
        return sum + (todo.time_estimate_minutes ?? 0);
      }, 0);
  }, [rawLockedItems, activeItems]);

  // Sweep count (unified includes todos, notes, and unconfirmed habits)
  const sweepCandidateCount = useSweepCountUnified();

  // Logs count for header
  const logsToday = useTodayLogsCount();

  // Recent logs for Your Notes popup
  const recentLogs = useYourNotes();
  const recentLogsCount = recentLogs.length;

  // Today date string (for addToToday)
  const todayDayString = getDateService().getCurrentDate();

  // NowData for header (computed locally)
  const nowData = useMemo(() => {
    const now = new Date();

    // Just the date, no greeting (NowHeader adds its own greeting)
    const dateTimeLabel = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    return {
      dateTimeLabel,
      weeklySummaries, // Weekly habit summaries for header
      allHabits: allActiveHabits, // All non-archived habits for NowWeekPopup
    };
  }, [allActiveHabits, weeklySummaries]);

  // ═══════════════════════════════════════════════════════════════════
  // STORE MUTATIONS - Direct store actions
  // ═══════════════════════════════════════════════════════════════════

  const completeTodo = useGremlyStore((state) => state.completeTodo);
  const uncompleteTodo = useGremlyStore((state) => state.uncompleteTodo);
  const completeHabit = useGremlyStore((state) => state.completeHabit);
  const uncompleteHabit = useGremlyStore((state) => state.uncompleteHabit);
  const updateTodo = useGremlyStore((state) => state.updateTodo);

  // Locked items - transform rawLockedItems to Now types
  // rawLockedItems comes from useLockedItems selector (single source of truth)
  const displayLockedItems = useMemo((): NowLockedItem[] => {
    return rawLockedItems.map((item) => {
      const isTodo = !('cadence' in item);
      const space = spacesMap.get(item.space_id ?? '');

      if (isTodo) {
        const todo = item as any; // Todo type
        return {
          id: item.id,
          type: 'todo' as const,
          name: item.name || todo.title || 'Untitled',
          locked: true as const,
          dueDay: todo.due_day ?? null,
          spaceId: item.space_id ?? null,
          spaceName: space?.name ?? null,
        };
      } else {
        const habit = item as any; // Habit type
        return {
          id: item.id,
          type: 'habit' as const,
          name: item.name || 'Untitled',
          locked: true as const,
          cadence: habit.cadence,
          targetPerPeriod: habit.target_per_period,
          frequency: habit.frequency,
          spaceId: item.space_id ?? null,
          spaceName: space?.name ?? null,
        };
      }
    });
  }, [rawLockedItems, spacesMap]);

  // Derived: has any work today
  const hasAnyTodayWork =
    displayLockedItems.length > 0 || activeItems.length > 0 || completedToday.length > 0;

  // Active items - transform to Now types and apply time window sorting
  const displayActiveItems = useMemo(() => {
    const transformed = activeItems.map((item) => toActiveItem(item, spacesMap));
    return sortActiveItems(transformed);
  }, [activeItems, spacesMap]);

  // Sort active items respecting morning brief sequence
  // NOTE: Locked items are handled separately - they appear at the VERY TOP before any time blocks
  const sortedActiveItems = useMemo(() => {
    // Build priority map from sequences
    const priorityMap = new Map<string, number>();
    let priority = 0;

    if (brief) {
      // Morning items first
      brief.morning_sequence?.forEach((item) => {
        priorityMap.set(item.id, priority++);
      });

      // Day items next
      brief.day_sequence?.forEach((item) => {
        priorityMap.set(item.id, priority++);
      });

      // Evening items next
      brief.evening_sequence?.forEach((item) => {
        priorityMap.set(item.id, priority++);
      });
    }

    // Filter OUT locked items - they're rendered separately at the top
    const nonLockedItems = displayActiveItems.filter((item) => !lockedItemIds.has(item.id));

    // Sort by sequence priority, then unsequenced
    return [...nonLockedItems].sort((a, b) => {
      // Sort by sequence priority
      const aPriority = priorityMap.get(a.id) ?? 999;
      const bPriority = priorityMap.get(b.id) ?? 999;
      return aPriority - bPriority;
    });
  }, [displayActiveItems, brief, lockedItemIds]);

  // Completed items - transform to Now types
  const displayCompletedToday = useMemo(() => {
    return completedToday.map(toCompletedItem);
  }, [completedToday]);

  // Completed habits - transform to Now types
  const displayCompletedHabitsToday = useMemo(() => {
    return completedHabitsToday.map(toCompletedItem);
  }, [completedHabitsToday]);

  // Overdue todos - transform to SweepCandidate
  const displayOverdueTodos = useMemo(() => {
    return overdueTodos.map((t) => toSweepCandidate(t as Todo, todayDayString));
  }, [overdueTodos, todayDayString]);

  // Recent drops - transform to SweepCandidate
  const displayRecentDrops = useMemo(() => {
    return recentDrops.map((t) => toSweepCandidate(t as Todo, todayDayString));
  }, [recentDrops, todayDayString]);

  // Habits for week popup - transform to active items
  const displayHabitsToday = useMemo(() => {
    return habitsToday.map((item) => toActiveItem(item, spacesMap));
  }, [habitsToday, spacesMap]);

  const overwhelm = useOverwhelmFlow();
  const overlayController = useUnifiedOverlayController();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Handle notification tap to open Morning Brief or Evening Sweep
  useEffect(() => {
    const handleNotificationOpen = (payload: { type: 'morning' | 'evening' }) => {
      if (payload.type === 'morning') {
        console.log('[NowScreenV1] Opening Morning Brief from notification');
        setBriefSheetVisible(true);
      }
      // Evening notifications navigate to Sweep screen
      if (payload.type === 'evening') {
        console.log('[NowScreenV1] Opening Evening Sweep from notification');
        navigation.navigate('Sweep');
      }
    };

    const unsubscribe = eventBus.on('notification:open_flow', handleNotificationOpen);
    return () => unsubscribe();
  }, [navigation]);

  const [isProgressVisible, setProgressVisible] = useState(false);
  const [isWeekVisible, setWeekVisible] = useState(false);
  const [isQuickAddVisible, setQuickAddVisible] = useState(false);
  const [isNotesVisible, setNotesVisible] = useState(false);
  const [isJournalVisible, setJournalVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFirstVisitBubble, setShowFirstVisitBubble] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);

  // Track if we should reopen habits modal after overlay closes
  const [shouldReopenWeekModal, setShouldReopenWeekModal] = useState(false);
  const { state: overlayState } = useGlobalOverlay();

  // Reopen habits modal when overlay closes (if we came from there)
  useEffect(() => {
    if (shouldReopenWeekModal && !overlayState.visible) {
      // Small delay to let overlay animation finish
      const timer = setTimeout(() => {
        setWeekVisible(true);
        setShouldReopenWeekModal(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [shouldReopenWeekModal, overlayState.visible]);

  // Optimistic quick-add state - shows 'Processing...' card while pipeline runs
  const [optimisticQuickAdd, setOptimisticQuickAdd] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Toast for quick add feedback
  const { showToast, Toast: QuickAddToast } = useActionToast();

  // Dismiss first visit bubble
  const handleDismissFirstVisitBubble = useCallback(() => {
    setShowFirstVisitBubble(false);
    markFirstTodayVisitComplete();
  }, [markFirstTodayVisitComplete]);

  // Handle item press - open overlay (uses overlayController)
  const handlePressItem = useCallback(
    (item: NowLockedItem | NowActiveItem | NowFutureItem) => {
      overlayController.openEdit({
        record: { id: item.id, type: item.type } as any,
      });
    },
    [overlayController],
  );

  // Handle toggle complete - use store mutations directly
  const handleToggleComplete = useCallback(
    async (item: NowLockedItem | NowActiveItem | NowFutureItem) => {
      try {
        if (item.type === 'todo') {
          // Check if already completed (for undo)
          const isCompleted = completedToday.some((c) => c.id === item.id);
          if (isCompleted) {
            await uncompleteTodo(item.id);
          } else {
            await completeTodo(item.id);
          }
        } else if (item.type === 'habit') {
          // Check if already completed today
          const isCompleted = completedHabitsToday.some((h) => h.id === item.id);
          if (isCompleted) {
            await uncompleteHabit(item.id);
          } else {
            await completeHabit(item.id);
          }
        }
      } catch (error) {
        console.error('[NowScreenV1] Toggle complete failed:', error);
      }
    },
    [
      completeTodo,
      uncompleteTodo,
      completeHabit,
      uncompleteHabit,
      completedToday,
      completedHabitsToday,
    ],
  );

  // Handle overwhelm plan submission
  const handleOverwhelmSubmit = useCallback(() => {
    const selectedItems = [...displayLockedItems, ...activeItems]
      .filter((item) => overwhelm.selectedIds.includes(item.id))
      .map((item) => ({ id: item.id, title: item.name }));

    void overwhelm.requestPlan(selectedItems);
  }, [overwhelm, displayLockedItems, activeItems]);

  // Handle add press - opens quick-add MindDrop modal
  const handleAddPress = useCallback(() => {
    setQuickAddVisible(true);
  }, []);

  // Handle opening Morning Brief sheet
  const handleOpenBrief = useCallback(() => {
    setBriefSheetVisible(true);
  }, []);

  // Add item to Today's Focus by setting due_day to today
  const handleAddToToday = useCallback(
    async (item: SweepCandidate) => {
      try {
        await updateTodo(item.id, { due_day: todayDayString });
        // No need to call reload() - store update triggers re-render automatically
      } catch (error) {
        console.warn('[NowScreenV1] Add to Today failed:', error);
      }
    },
    [updateTodo, todayDayString],
  );

  // Quick add hook - wires to MindDrop pipeline with Today scoping
  // Uses optimistic flow: onStart for immediate feedback, onComplete for final state
  const quickAdd = useNowQuickAdd({
    onStart: (draftTitle) => {
      console.log('[NowScreenV1] Quick add started:', draftTitle);
      // Show optimistic 'Processing...' card
      setOptimisticQuickAdd({
        id: `now-optimistic-${Date.now()}`,
        title: draftTitle,
      });
    },
    onComplete: (result) => {
      console.log('[NowScreenV1] Quick add complete:', result);
      // Clear optimistic card - store auto-updates, no reload needed
      setOptimisticQuickAdd(null);
    },
    onError: (error) => {
      console.error('[NowScreenV1] Quick add error:', error.message);
      // Clear optimistic card - no toast needed, error is logged
      setOptimisticQuickAdd(null);
    },
  });

  // Handle quick add submission - fire-and-forget, modal closes immediately
  const handleQuickAddSubmit = useCallback(
    (text: string) => {
      quickAdd.onQuickAdd(text);
    },
    [quickAdd],
  );

  // Handle "Prefer to add manually" from quick add modal
  const handleQuickAddManual = useCallback(() => {
    overlayController.openCreate({ type: 'todo', defaultDueToday: true });
  }, [overlayController]);

  // Handle undo from progress popup
  const handleUndoCompletedItem = useCallback(
    async (item: { id: string; type: 'habit' | 'todo' }) => {
      try {
        if (item.type === 'todo') {
          await uncompleteTodo(item.id);
        } else {
          await uncompleteHabit(item.id);
        }
      } catch (error) {
        console.error('[NowScreenV1] Undo failed:', error);
      }
    },
    [uncompleteTodo, uncompleteHabit],
  );

  // Handle calendar hint press - navigate to CalendarScreen
  const handleCalendarHintPress = useCallback(() => {
    navigation.navigate('CalendarScreen');
  }, [navigation]);

  // Use today's logs count from store selectors
  const capturesCount = logsToday;

  // Handle Your Notes card press
  const handleNotesPress = useCallback(() => {
    setNotesVisible(true);
  }, []);

  // Handle selecting a log from YourNotesPopup
  const handleSelectLog = useCallback(
    (log: LogItem) => {
      setNotesVisible(false);
      // Open overlay to edit this note
      overlayController.openEdit({
        record: { id: log.id, type: 'note' } as any,
      });
    },
    [overlayController],
  );

  // Handle selecting a journal from YourNotesPopup
  const handleSelectJournal = useCallback((log: LogItem) => {
    setNotesVisible(false);
    setSelectedJournalId(log.id);
    setJournalVisible(true);
  }, []);

  if (loading || !isInitialized) {
    return (
      <Screen style={styles.screen} edges={['top', 'bottom']} padded={false}>
        <View />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen} edges={['top', 'bottom']} padded={false}>
      <NowHeader
        dateTimeLabel={nowData.dateTimeLabel}
        totalTasksToday={totalTasksToday}
        totalCompletedToday={totalCompletedToday}
        todayHabitCount={todayHabitCount}
        todayTodoCount={todayTodoCount}
        capturesCount={recentLogsCount}
        habitsUpToDate={habitsUpToDate.upToDate}
        habitsTotal={habitsUpToDate.total}
        remainingMinutes={remainingMinutes}
        calendarEvents={todayCalendarEvents}
        onPressProgress={() => setProgressVisible(true)}
        onPressWeek={() => setWeekVisible(true)}
        onCalendarPress={handleCalendarHintPress}
        onNotesPress={handleNotesPress}
        onMascotPress={() => setShowHelp(true)}
      />
      <FirstTodayVisitBubble
        visible={showFirstVisitBubble}
        onDismiss={handleDismissFirstVisitBubble}
      />
      <View style={styles.focusSectionHeader}>
        {/* Left: Section title only */}
        <View style={styles.focusSectionHeaderLeft}>
          <Text style={styles.focusSectionTitle}>Today's Focus</Text>
        </View>
        {/* Right: Action buttons */}
        <View style={styles.headerActions}>
          {/* Organize button - periwinkle */}
          <Pressable
            style={({ pressed }) => [
              styles.headerOrganizeButton,
              pressed && styles.headerButtonPressed,
            ]}
            onPress={handleOpenBrief}
            testID="header-organize"
            accessibilityRole="button"
            accessibilityLabel="Organize your day"
          >
            <Text style={styles.headerOrganizeButtonText}>Organize</Text>
          </Pressable>

          {/* Add to Today button - sage */}
          <Pressable
            style={({ pressed }) => [styles.headerAddButton, pressed && styles.headerButtonPressed]}
            onPress={handleAddPress}
            testID="header-add-to-today"
            accessibilityRole="button"
            accessibilityLabel="Add to Today"
          >
            <Text style={styles.headerAddButtonText}>+ Add to Today</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.focusSectionDivider} />

      <View style={styles.focusSectionWrapper}>
        <TodayFocusList
          lockedItems={displayLockedItems}
          activeItems={sortedActiveItems}
          futureItems={[]} // Future items selector not implemented yet
          progressPercent={progressPercent}
          hasAnyTodayWork={hasAnyTodayWork}
          onPressItem={handlePressItem}
          onToggleComplete={handleToggleComplete}
          optimisticQuickAdd={optimisticQuickAdd}
          overdueTodos={displayOverdueTodos}
          recentDrops={displayRecentDrops}
          onAddToToday={handleAddToToday}
          bottomInset={insets.bottom}
          brief={brief}
          lockedItemIds={lockedItemIds}
          calendarEvents={todayCalendarEvents}
          onCalendarHintPress={handleCalendarHintPress}
        />
      </View>

      {/* Sweep Pill - fixed above tab bar */}
      <View
        style={[styles.sweepPillContainer, { bottom: insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        <SweepPill
          count={sweepCandidateCount + displayRecentDrops.length}
          onPress={() => {
            navigation.navigate('Sweep');
          }}
        />
      </View>

      {/* Quick Add toast */}
      {QuickAddToast}

      <NowProgressPopup
        visible={isProgressVisible}
        completed={displayCompletedToday}
        totalTasksToday={totalTasksToday}
        totalCompletedToday={totalCompletedToday}
        onClose={() => setProgressVisible(false)}
        onUndoItem={handleUndoCompletedItem}
        onItemPress={(item) => {
          setProgressVisible(false);
          // Map journal type to note for overlay
          const overlayType = item.type === 'journal' ? 'note' : item.type;
          overlayController.openEdit({
            record: { id: item.id, type: overlayType } as any,
          });
        }}
      />

      <NowWeekPopup
        visible={isWeekVisible}
        habitsToday={displayHabitsToday}
        completedHabitsToday={displayCompletedHabitsToday}
        weeklySummaries={nowData.weeklySummaries}
        allHabits={allActiveHabits}
        onClose={() => setWeekVisible(false)}
        onOpenOverlay={() => setShouldReopenWeekModal(true)}
      />

      <OverwhelmSelectSheet
        visible={overwhelm.step === 'select'}
        items={[...displayLockedItems, ...displayActiveItems]}
        selectedIds={overwhelm.selectedIds}
        onToggleSelect={overwhelm.toggleSelection}
        onSubmit={handleOverwhelmSubmit}
        onClose={overwhelm.close}
      />

      <OverwhelmPlanSheet
        visible={overwhelm.step === 'planning'}
        plan={overwhelm.plan}
        isLoading={overwhelm.isLoading}
        onEnterFocus={overwhelm.enterFocusMode}
        onChangeSelection={overwhelm.open}
        onClose={overwhelm.close}
      />

      <OverwhelmFocusOverlay
        visible={overwhelm.step === 'focus'}
        plan={overwhelm.plan}
        onExit={overwhelm.exitFocusMode}
      />

      {/* Legacy SweepDrawer removed - see TODO at top of file */}

      <NowQuickAddModal
        visible={isQuickAddVisible}
        onClose={() => setQuickAddVisible(false)}
        onSubmit={handleQuickAddSubmit}
        onPressManualAdd={handleQuickAddManual}
      />

      <YourNotesPopup
        visible={isNotesVisible}
        onClose={() => setNotesVisible(false)}
        onSelectLog={handleSelectLog}
        onSelectJournal={handleSelectJournal}
      />

      <JournalFullScreen
        visible={isJournalVisible}
        logId={selectedJournalId ?? undefined}
        onClose={() => {
          setJournalVisible(false);
          setSelectedJournalId(null);
        }}
        onSave={() => {
          setJournalVisible(false);
          setSelectedJournalId(null);
          // Store auto-updates, no reload needed
        }}
      />

      {/* Morning Brief Sheet */}
      <MorningBriefSheet
        visible={isBriefSheetVisible}
        onClose={() => setBriefSheetVisible(false)}
        onComplete={markTodayOpened}
      />

      {/* Help Card */}
      <GremlyHelpCard visible={showHelp} onDismiss={() => setShowHelp(false)} screen="today" />
    </Screen>
  );
}

/**
 * Animated optimistic card that fades in on mount and fades out + slides down on unmount.
 * Uses a "leaving" state pattern since React Native Animated doesn't support exit animations natively.
 * Features calm background processing animation with animated dots.
 */
type OptimisticQuickAddCardProps = {
  id: string;
  title: string;
  onExitComplete?: () => void;
  isLeaving?: boolean;
};

// Brand color for loading indicator
const MOSS_GREEN = '#2E5540';

/* eslint-disable react-hooks/refs -- Animated.Value refs are intentionally accessed in render for RN animations */
function OptimisticQuickAddCard({
  id,
  title,
  onExitComplete,
  isLeaving,
}: OptimisticQuickAddCardProps) {
  // Animation refs for React Native Animated API
  const opacityRef = useRef(new Animated.Value(0));
  const translateYRef = useRef(new Animated.Value(0));
  const textOpacityRef = useRef(new Animated.Value(0.6));

  // Animated dots: add one every 500ms, reset after 3
  const [dots, setDots] = useState('');

  // Animated dots interval
  useEffect(() => {
    if (isLeaving) return; // Don't animate dots when leaving

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [isLeaving]);

  // Gentle text opacity pulse
  useEffect(() => {
    if (isLeaving) return; // Stop pulse animation when leaving

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(textOpacityRef.current, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(textOpacityRef.current, {
          toValue: 0.6,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isLeaving]);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(opacityRef.current, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, []);

  // Fade out + slide down when leaving
  useEffect(() => {
    if (isLeaving) {
      Animated.parallel([
        Animated.timing(opacityRef.current, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateYRef.current, {
          toValue: 4,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onExitComplete?.();
      });
    }
  }, [isLeaving, onExitComplete]);

  return (
    <Animated.View
      key={id}
      style={[
        styles.optimisticCard,
        {
          opacity: opacityRef.current,
          transform: [{ translateY: translateYRef.current }],
        },
      ]}
      accessibilityLabel={`Processing ${title}`}
      accessibilityRole="text"
    >
      <View style={styles.optimisticContent}>
        <View style={styles.optimisticTextContainer}>
          <Text numberOfLines={1} style={styles.optimisticTitle}>
            {title}
          </Text>
          <Animated.Text
            style={[styles.optimisticSubtitle, { opacity: textOpacityRef.current }]}
            accessibilityLabel="Processing"
          >
            Processing{dots}
          </Animated.Text>
        </View>
        <View style={styles.optimisticLoader}>
          <ActivityIndicator size="small" color={MOSS_GREEN} />
        </View>
      </View>
    </Animated.View>
  );
}
/* eslint-enable react-hooks/refs */

type TodayFocusListProps = {
  lockedItems: NowLockedItem[];
  activeItems: NowActiveItem[];
  futureItems: NowFutureItem[];
  progressPercent: number;
  hasAnyTodayWork: boolean;
  onPressItem?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
  onToggleComplete?: (item: NowLockedItem | NowActiveItem | NowFutureItem) => void;
  optimisticQuickAdd?: { id: string; title: string } | null;
  overdueTodos: SweepCandidate[];
  recentDrops: SweepCandidate[];
  onAddToToday: (item: SweepCandidate) => void;
  bottomInset: number;
  brief?: {
    morning_sequence?: { id: string }[];
    day_sequence?: { id: string }[];
    evening_sequence?: { id: string }[];
  } | null;
  lockedItemIds?: Set<string>;
  calendarEvents?: CalendarEvent[];
  onCalendarHintPress?: () => void;
};

function TodayFocusList({
  lockedItems,
  activeItems,
  futureItems,
  progressPercent,
  hasAnyTodayWork,
  onPressItem,
  onToggleComplete,
  optimisticQuickAdd,
  overdueTodos,
  recentDrops,
  onAddToToday,
  bottomInset,
  brief,
  lockedItemIds,
  calendarEvents = [],
  onCalendarHintPress,
}: TodayFocusListProps) {
  // Track leaving card for exit animation
  const [leavingCard, setLeavingCard] = useState<{ id: string; title: string } | null>(null);
  const prevOptimisticRef = useRef<{ id: string; title: string } | null>(null);

  // Detect when optimistic card is being removed and trigger exit animation
  useEffect(() => {
    const prev = prevOptimisticRef.current;
    const curr = optimisticQuickAdd;

    // If we had a card and now we don't, trigger exit animation
    if (prev && !curr) {
      setLeavingCard(prev);
    }

    prevOptimisticRef.current = curr ?? null;
  }, [optimisticQuickAdd]);

  const handleExitComplete = useCallback(() => {
    setLeavingCard(null);
  }, []);

  // Get current time block for highlighting
  const currentTimeBlock = getCurrentTimeBlock();

  // Group calendar events by time block
  const eventsByBlock = useMemo(() => groupEventsByTimeBlock(calendarEvents), [calendarEvents]);

  // Build flat sorted list: locked items first, then active items sorted by sequence
  const sortedItems = useMemo(() => {
    // Create set of locked item IDs
    const lockedIds = new Set(lockedItems.map((i) => i.id));

    // Filter out locked items from activeItems (they're rendered first)
    const nonLockedItems = activeItems.filter((i) => !lockedIds.has(i.id));

    // Sort non-locked items by sequence priority: morning -> day -> evening -> whenever
    const morningIds = new Set(brief?.morning_sequence?.map((i) => i.id) || []);
    const dayIds = new Set(brief?.day_sequence?.map((i) => i.id) || []);
    const eveningIds = new Set(brief?.evening_sequence?.map((i) => i.id) || []);

    const getSequencePriority = (id: string): number => {
      if (morningIds.has(id)) return 0;
      if (dayIds.has(id)) return 1;
      if (eveningIds.has(id)) return 2;
      return 3; // whenever
    };

    return [...nonLockedItems].sort(
      (a, b) => getSequencePriority(a.id) - getSequencePriority(b.id),
    );
  }, [activeItems, brief, lockedItems]);

  // Group items by time block using brief sequences
  const itemsByBlock = useMemo(() => {
    const morningIds = new Set(brief?.morning_sequence?.map((i) => i.id) || []);
    const dayIds = new Set(brief?.day_sequence?.map((i) => i.id) || []);
    const eveningIds = new Set(brief?.evening_sequence?.map((i) => i.id) || []);

    const grouped: Record<TimeBlock, NowActiveItem[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      anytime: [],
    };

    for (const item of sortedItems) {
      if (morningIds.has(item.id)) {
        grouped.morning.push(item);
      } else if (dayIds.has(item.id)) {
        grouped.afternoon.push(item);
      } else if (eveningIds.has(item.id)) {
        grouped.evening.push(item);
      } else {
        // Use inferTimeWindow for items not in a sequence
        const timeWindow = inferTimeWindow(item);
        if (timeWindow === 'morning') grouped.morning.push(item);
        else if (timeWindow === 'afternoon' || timeWindow === 'midday')
          grouped.afternoon.push(item);
        else if (timeWindow === 'evening') grouped.evening.push(item);
        else grouped.anytime.push(item);
      }
    }

    return grouped;
  }, [sortedItems, brief]);

  // Helper to check if a block should render
  const shouldRenderBlock = (block: TimeBlock) => {
    const hasItems = itemsByBlock[block].length > 0;
    const hasEvents = eventsByBlock[block].length > 0;
    const isCurrent = block === currentTimeBlock;
    return hasItems || hasEvents || isCurrent;
  };

  // Helper to get calendar hint data for a block
  const getCalendarHint = (block: TimeBlock) => {
    const events = eventsByBlock[block];
    if (events.length === 0) return null;
    return {
      count: events.length,
      times: events.map(formatEventTimeForHint),
    };
  };

  // Track which section is first for divider logic
  let isFirstSection = true;
  const getIsFirst = () => {
    if (isFirstSection) {
      isFirstSection = false;
      return true;
    }
    return false;
  };

  const hasNoItems =
    lockedItems.length === 0 && activeItems.length === 0 && !optimisticQuickAdd && !leavingCard;
  const isAllComplete =
    progressPercent === 100 && hasAnyTodayWork && !optimisticQuickAdd && !leavingCard;

  const emptyState = getTodayEmptyState();
  const emptyContent = getTodayEmptyStateContent(emptyState);

  return (
    <ScrollView
      style={styles.listContainer}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    >
      {isAllComplete && !hasNoItems && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>🎉 All done for today!</Text>
        </View>
      )}

      {hasNoItems && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{emptyContent.title}</Text>
          <Text style={styles.emptySubtext}>{emptyContent.subtitle}</Text>
        </View>
      )}

      {/* Locked In section */}
      {lockedItems.length > 0 && (
        <TimeBlockSection block="locked" isFirst={getIsFirst()}>
          {lockedItems.map((item, index) => (
            <NowFocusRow
              key={item.id}
              item={item}
              isCompleted={false}
              isLocked
              isFirst={index === 0}
              onPress={() => onPressItem?.(item)}
              onToggleComplete={() => onToggleComplete?.(item)}
            />
          ))}
        </TimeBlockSection>
      )}

      {/* Morning section */}
      {shouldRenderBlock('morning') && (
        <TimeBlockSection
          block="morning"
          isFirst={getIsFirst()}
          calendarHint={
            getCalendarHint('morning') && (
              <CalendarHint
                eventCount={getCalendarHint('morning')!.count}
                times={getCalendarHint('morning')!.times}
                onPress={onCalendarHintPress}
              />
            )
          }
        >
          {itemsByBlock.morning.map((item, index) => (
            <NowFocusRow
              key={item.id}
              item={item}
              isCompleted={false}
              isLocked={false}
              isFirst={index === 0}
              onPress={() => onPressItem?.(item)}
              onToggleComplete={() => onToggleComplete?.(item)}
            />
          ))}
        </TimeBlockSection>
      )}

      {/* Afternoon section */}
      {shouldRenderBlock('afternoon') && (
        <TimeBlockSection
          block="afternoon"
          isFirst={getIsFirst()}
          calendarHint={
            getCalendarHint('afternoon') && (
              <CalendarHint
                eventCount={getCalendarHint('afternoon')!.count}
                times={getCalendarHint('afternoon')!.times}
                onPress={onCalendarHintPress}
              />
            )
          }
        >
          {itemsByBlock.afternoon.map((item, index) => (
            <NowFocusRow
              key={item.id}
              item={item}
              isCompleted={false}
              isLocked={false}
              isFirst={index === 0}
              onPress={() => onPressItem?.(item)}
              onToggleComplete={() => onToggleComplete?.(item)}
            />
          ))}
        </TimeBlockSection>
      )}

      {/* Evening section */}
      {shouldRenderBlock('evening') && (
        <TimeBlockSection
          block="evening"
          isFirst={getIsFirst()}
          calendarHint={
            getCalendarHint('evening') && (
              <CalendarHint
                eventCount={getCalendarHint('evening')!.count}
                times={getCalendarHint('evening')!.times}
                onPress={onCalendarHintPress}
              />
            )
          }
        >
          {itemsByBlock.evening.map((item, index) => (
            <NowFocusRow
              key={item.id}
              item={item}
              isCompleted={false}
              isLocked={false}
              isFirst={index === 0}
              onPress={() => onPressItem?.(item)}
              onToggleComplete={() => onToggleComplete?.(item)}
            />
          ))}
        </TimeBlockSection>
      )}

      {/* Any time section */}
      {itemsByBlock.anytime.length > 0 && (
        <TimeBlockSection block="anytime" isFirst={getIsFirst()}>
          {itemsByBlock.anytime.map((item, index) => (
            <NowFocusRow
              key={item.id}
              item={item}
              isCompleted={false}
              isLocked={false}
              isFirst={index === 0}
              onPress={() => onPressItem?.(item)}
              onToggleComplete={() => onToggleComplete?.(item)}
            />
          ))}
        </TimeBlockSection>
      )}

      {/* Optimistic 'Processing...' card appended after active items */}
      {/* Shows active card while processing, or leaving card during exit animation */}
      {optimisticQuickAdd && (
        <OptimisticQuickAddCard
          key={optimisticQuickAdd.id}
          id={optimisticQuickAdd.id}
          title={optimisticQuickAdd.title}
        />
      )}
      {!optimisticQuickAdd && leavingCard && (
        <OptimisticQuickAddCard
          key={leavingCard.id}
          id={leavingCard.id}
          title={leavingCard.title}
          isLeaving
          onExitComplete={handleExitComplete}
        />
      )}

      {/* Rolled over section */}
      {overdueTodos.length > 0 && (
        <RolledOverSection
          items={overdueTodos}
          onPressItem={(item) => onPressItem?.(item as unknown as NowActiveItem)}
          onToggleComplete={(item) => onToggleComplete?.(item as unknown as NowActiveItem)}
          style={styles.sectionSpacing}
        />
      )}

      {/* Recent Drops section */}
      {recentDrops.length > 0 && (
        <RecentDropsSection
          items={recentDrops}
          onPressItem={(item) => onPressItem?.(item as unknown as NowActiveItem)}
          onAddToToday={onAddToToday}
          style={styles.sectionSpacing}
        />
      )}

      {futureItems.length > 0 && <NowFutureDivider />}

      {futureItems.map((item, index) => (
        <NowFocusRow
          key={item.id}
          item={item}
          isFuture
          isCompleted={false} // Selectors filter out completed items
          isFirst={index === 0}
          isLast={index === futureItems.length - 1}
          onPress={() => onPressItem?.(item)}
          onToggleComplete={() => onToggleComplete?.(item)}
        />
      ))}

      {/* Extra space for fixed SweepPill above tab bar */}
      <View style={{ height: bottomInset + 80 }} />
    </ScrollView>
  );
}

// Official Gremly brand background
const LINEN_CREAM = '#F9F6F1';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: LINEN_CREAM, // Official Gremly background-light
  },
  // Focus section divider - separates header cards from Today's Focus
  focusSectionDivider: {
    height: 1,
    backgroundColor: '#E8E6E1',
    marginHorizontal: 24,
    marginTop: 8,
  },
  // Warm background wrapper for the entire focus section (header + list)
  focusSectionWrapper: {
    flex: 1,
    backgroundColor: LINEN_CREAM, // Match page background
  },
  // Focus section header row
  focusSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 2, // Tight spacing before list
    backgroundColor: LINEN_CREAM, // Match page background
  },
  focusSectionHeaderLeft: {
    flexDirection: 'column',
    flex: 1,
    flexShrink: 1,
    marginRight: 12,
  },
  focusSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0E1116',
  },
  // Header actions container
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Organize button - periwinkle
  headerOrganizeButton: {
    backgroundColor: 'rgba(156, 166, 224, 0.15)', // Light periwinkle tint
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  headerOrganizeButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9CA6E0', // Periwinkle smoke
  },
  headerButtonPressed: {
    opacity: 0.7,
  },
  // Header Add to Today button - sage
  headerAddButton: {
    backgroundColor: '#E8F0EB', // Light sage tint
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  headerAddButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2E5540', // Moss green
  },
  sweepPillContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  listContainer: {
    flex: 1,
    backgroundColor: LINEN_CREAM, // Match page background
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8, // Space between subtitle and first item (8-10px)
    paddingBottom: 24,
  },
  banner: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222222', // charcoalInk
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666666', // inkMuted
    textAlign: 'center',
  },
  // Optimistic quick-add card styles (processing state)
  optimisticCard: {
    backgroundColor: LINEN_CREAM, // Match page background
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 16,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E5E2DA',
    opacity: 0.8, // Slightly reduced opacity for processing state
  },
  optimisticContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optimisticTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  optimisticTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0E1116',
    lineHeight: 18,
  },
  optimisticSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    fontStyle: 'italic',
  },
  optimisticLoader: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Spacing for Overdue and Recent Drops sections
  sectionSpacing: {
    marginTop: 16,
  },
});
