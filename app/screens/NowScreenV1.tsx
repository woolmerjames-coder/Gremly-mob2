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
  Modal,
} from 'react-native';
import { getDateService, nowTimestamp } from '../../lib/date';
import { format } from 'date-fns';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui';
import { NowHeader } from '../../components/now/NowHeader';
import { NowFocusRow } from '../../components/now/NowFocusRow';
import { BreakHabitCard } from '../../components/now/BreakHabitCard';
import { NowCalendarEventRow } from '../../components/now/NowCalendarEventRow';
import { NowFutureDivider } from '../../components/now/NowFutureDivider';
import { RolledOverSection, RecentDropsSection, SweepPill } from '../../components/now';
import { NowQuickAddModal } from '../../components/now/NowQuickAddModal';
import { OverwhelmSelectSheet } from '../../components/now/OverwhelmSelectSheet';
import { OverwhelmPlanSheet } from '../../components/now/OverwhelmPlanSheet';
import { OverwhelmFocusOverlay } from '../../components/now/OverwhelmFocusOverlay';
import { NowProgressPopup } from '../../components/now/NowProgressPopup';
import { YourNotesPopup } from '../../components/now/YourNotesPopup';
import { JournalFullScreen } from '../../components/now/JournalFullScreen';

import EventQuickActionSheet from '../../components/now/EventQuickActionSheet';
import TodoLinkSheet from '../../components/now/TodoLinkSheet';
import { scheduleEventReminder } from '../../lib/notifications/scheduleEventReminder';
import { useMorningBrief } from '../../lib/today/hooks/useMorningBrief';
import GremlyHelpCard from '../../components/help/GremlyHelpCard';
import FirstTodayVisitBubble from '../../components/onboarding/FirstTodayVisitBubble';
import WeeklySummaryBanner from '../../components/WeeklySummaryBanner';
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
  useHabitsUpToDateCount,
  useTodayPendingDrops,
  useEventNotesForDate,
} from '../../lib/store/selectors';
import { useNowQuickAdd } from '../../lib/now/useNowQuickAdd';
import { useOverwhelmFlow } from '../../lib/now/useOverwhelmFlow';
import { useActionToast } from '../../src/hooks/useActionToast';
import { getTodayEmptyState, getTodayEmptyStateContent } from '../../lib/today/getTodayEmptyState';
import type { LogItem } from '../../lib/notes/useRecentLogs';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useTodayInteractions } from '../../lib/today/useTodayInteractions';

import type {
  NowLockedItem,
  NowActiveItem,
  NowFutureItem,
  NowCompletedItem,
} from '../../lib/now/nowTypes';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { Habit, Todo, Space, Note } from '../../lib/types';
import { eventBus } from '../../lib/events';
import { TimeBlockSection } from '../../components/now/TimeBlockSection';
import {
  getCurrentTimeBlock,
  getTimeBlockForHour,
  type TimeBlock,
} from '../../lib/now/timeBlockHelpers';

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
    timeWindow:
      (item as any).daily_block ?? (item.time_window as NowActiveItem['timeWindow']) ?? undefined,
    isBreakHabit: isHabit ? (item as Habit).subtype === 'break_habit' : false,
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
      ? ((item as Habit).last_completed_at ?? nowTimestamp())
      : ((item as Todo).completed_at ?? nowTimestamp()),
  };
}

/** Transform raw Todo to SweepCandidate */
function toSweepCandidate(todo: Todo, todayDayString: string): SweepCandidate {
  const dueDay = todo.due_day ?? null;
  const targetDate = (todo as any).target_date ?? null;
  const isOverdue = dueDay !== null && dueDay < todayDayString;
  const hasUnscheduledDeadline = targetDate !== null && dueDay === null;

  // Calculate days until deadline
  let daysUntilDeadline: number | null = null;
  if (targetDate) {
    daysUntilDeadline = getDateService().daysBetween(todayDayString, targetDate);
  }

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
    hasUnscheduledDeadline,
    daysUntilDeadline,
    space_id: todo.space_id ?? null,
  };
}

/**
 * Group key date events by time block based on event_time
 * Events without event_time go to 'anytime'
 */
function groupKeyDatesByTimeBlock(keyDates: Note[]): Record<TimeBlock, Note[]> {
  const grouped: Record<TimeBlock, Note[]> = {
    allday: [],
    morning: [],
    afternoon: [],
    evening: [],
    anytime: [],
  };

  for (const event of keyDates) {
    if (event.is_all_day || !event.event_time) {
      // Match Morning Brief behavior: all-day events AND events
      // without a specific time both show under ALL DAY
      grouped.allday.push(event);
    } else {
      const [hourStr] = event.event_time.split(':');
      const hour = parseInt(hourStr, 10);
      if (!isNaN(hour)) {
        const block = getTimeBlockForHour(hour);
        grouped[block].push(event);
      } else {
        grouped.allday.push(event);
      }
    }
  }

  return grouped;
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

  // Calendar integration
  const todayStr = useGremlyStore((s) => s.currentDate);
  const fetchCalendarEvents = useGremlyStore((s) => s.fetchCalendarEventsForRange);

  // Unified event notes for today (external + native, from Phase 1 normalization)
  const todayEventNotes = useEventNotesForDate(todayStr);

  // Morning Brief - sequences and brief state
  const { hasCompletedBriefToday, brief } = useMorningBrief();
  const [briefTargetDate, setBriefTargetDate] = useState<string | undefined>(undefined);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();

  // Daily app open detection
  const { isFirstOpenToday, isChecking, markTodayOpened } = useDailyAppOpen();

  // Sweep completion detection for day picker
  const lastSweepCompletedAt = useGremlyStore((s) => s.lastSweepCompletedAt);
  const hasSweepedToday = useMemo(() => {
    if (!lastSweepCompletedAt) return false;
    const sweepDay = getDateService().extractLocalDate(lastSweepCompletedAt);
    return sweepDay === todayStr;
  }, [lastSweepCompletedAt, todayStr]);

  const [showDayPicker, setShowDayPicker] = useState(false);

  // Fetch calendar events on mount (today + 7 days)
  useEffect(() => {
    console.log('[NowScreen] Calendar useEffect, isInitialized:', isInitialized);
    if (!isInitialized) return;
    const dateService = getDateService();
    const weekFromNow = dateService.addDays(todayStr, 7);
    console.log('[NowScreen] Fetching calendar:', todayStr, 'to', weekFromNow);
    fetchCalendarEvents(todayStr, weekFromNow);
  }, [isInitialized, fetchCalendarEvents, todayStr]);

  // Listen for "Plan your tomorrow" from sweep completion
  useEffect(() => {
    const unsub = eventBus.on('openTomorrowBrief', () => {
      const td = getDateService().addDays(todayStr, 1);
      setBriefTargetDate(td);
      navigation.navigate('MorningBrief', { targetDate: td });
    });
    return () => unsub();
  }, [todayStr, navigation]);

  // Auto-open Morning Brief on first open of the day (skip for brand new users)
  const hasAutoOpenedBriefRef = useRef(false);
  useEffect(() => {
    if (gremlyAge < 1) return; // Don't show for brand new users
    if (hasAutoOpenedBriefRef.current) return; // Already auto-opened this mount
    if (!isFocused) return; // Don't fire if user is on another screen (e.g. mid-Sweep)
    if (!isChecking && isFirstOpenToday && !hasCompletedBriefToday && isInitialized && !loading) {
      hasAutoOpenedBriefRef.current = true;
      markTodayOpened(); // Flip isFirstOpenToday to false so this won't retrigger
      const timer = setTimeout(() => {
        navigation.navigate('MorningBrief');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    gremlyAge,
    isChecking,
    isFirstOpenToday,
    hasCompletedBriefToday,
    isInitialized,
    loading,
    isFocused,
    markTodayOpened,
    navigation,
  ]);

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

  // Hidden today items (Not Today feature)
  const hiddenTodayIds = useGremlyStore((s) => s.hiddenTodayIds);

  // Filter out hidden items from locked and active lists
  const lockedItems = useMemo(
    () => rawLockedItems.filter((item) => !hiddenTodayIds.includes(item.id)),
    [rawLockedItems, hiddenTodayIds],
  );
  const visibleActiveItems = useMemo(
    () => activeItems.filter((item) => !hiddenTodayIds.includes(item.id)),
    [activeItems, hiddenTodayIds],
  );

  // Derive lockedItemIds from filtered result
  const lockedItemIds = useMemo(() => new Set(lockedItems.map((item) => item.id)), [lockedItems]);

  // Habits
  const habitsToday = useTodayHabits();
  const completedHabitsToday = useHabitsCompletedToday();
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
    const lockedTodoCount = lockedItems.filter((item) => !('cadence' in item)).length;
    const activeTodoCount = visibleActiveItems.filter((item) => !('cadence' in item)).length;
    return lockedTodoCount + activeTodoCount;
  }, [lockedItems, visibleActiveItems]);

  // Calculate remaining time estimate for incomplete todos
  const remainingMinutes = useMemo(() => {
    const allItems = [...lockedItems, ...visibleActiveItems];
    return allItems
      .filter((item) => !('cadence' in item)) // Only todos
      .reduce((sum, item) => {
        const todo = item as Todo;
        return sum + (todo.time_estimate_minutes ?? 0);
      }, 0);
  }, [lockedItems, visibleActiveItems]);

  // Sweep count (unified includes todos, notes, and unconfirmed habits)
  const sweepCandidateCount = useSweepCountUnified();

  // Logs count for header
  const logsToday = useTodayLogsCount();

  // Recent logs for Your Notes popup
  const recentLogs = useYourNotes();
  const recentLogsCount = recentLogs.length;

  // Today date string (for addToToday)
  const todayDayString = todayStr;

  // NowData for header (computed locally)
  const nowData = useMemo(() => {
    const now = getDateService().now();

    // Just the date, no greeting (NowHeader adds its own greeting)
    const dateTimeLabel = format(now, 'EEEE, MMMM d');

    return {
      dateTimeLabel,
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // STORE MUTATIONS - Direct store actions
  // ═══════════════════════════════════════════════════════════════════

  const completeTodo = useGremlyStore((state) => state.completeTodo);
  const uncompleteTodo = useGremlyStore((state) => state.uncompleteTodo);
  const completeHabit = useGremlyStore((state) => state.completeHabit);
  const uncompleteHabit = useGremlyStore((state) => state.uncompleteHabit);
  const updateTodo = useGremlyStore((state) => state.updateTodo);

  // Locked items - transform lockedItems to Now types
  // lockedItems comes from useLockedItems selector, filtered to exclude hidden items
  const displayLockedItems = useMemo((): NowLockedItem[] => {
    return lockedItems.map((item) => {
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
  }, [lockedItems, spacesMap]);

  // Derived: has any work today
  const hasAnyTodayWork =
    displayLockedItems.length > 0 || visibleActiveItems.length > 0 || completedToday.length > 0;

  // Active items - transform to Now types and apply time window sorting
  const displayActiveItems = useMemo(() => {
    const transformed = visibleActiveItems.map((item) => toActiveItem(item, spacesMap));
    return sortActiveItems(transformed);
  }, [visibleActiveItems, spacesMap]);

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
  const { openEntityOverlay } = useTodayInteractions();

  // Handle notification tap to open Morning Brief, Evening Sweep, or Weekly Summary
  useEffect(() => {
    const handleNotificationOpen = (payload: {
      type: 'morning' | 'evening' | 'weekly_summary' | 'afternoon_checkin';
    }) => {
      if (payload.type === 'morning') {
        console.log('[NowScreenV1] Opening Morning Brief from notification');
        navigation.navigate('MorningBrief');
      }
      // Evening notifications navigate to Sweep screen
      if (payload.type === 'evening') {
        console.log('[NowScreenV1] Opening Evening Sweep from notification');
        navigation.navigate('Sweep');
      }
      // Weekly summary notifications navigate to WeeklySummary screen
      if (payload.type === 'weekly_summary') {
        console.log('[NowScreenV1] Opening Weekly Summary from notification');
        navigation.navigate('WeeklySummary');
      }
      // Afternoon check-in — already on NowScreen, no navigation needed
      if (payload.type === 'afternoon_checkin') {
        console.log('[NowScreenV1] Opening Now screen from afternoon check-in');
        // Could optionally scroll to lock-ins section in the future
      }
    };

    const unsubscribe = eventBus.on('notification:open_flow', handleNotificationOpen);
    return () => unsubscribe();
  }, [navigation]);

  // Handle item-reminder notification taps — open the overlay for the reminded item
  useEffect(() => {
    const unsubscribe = eventBus.on(
      'notification:open_item',
      (payload: { itemId: string; itemType: string }) => {
        console.log('[NowScreenV1] Opening item from reminder notification', payload);
        openEntityOverlay({ id: payload.itemId, type: payload.itemType });
      },
    );
    return () => unsubscribe();
  }, [openEntityOverlay]);

  const [isProgressVisible, setProgressVisible] = useState(false);
  const [isQuickAddVisible, setQuickAddVisible] = useState(false);
  const [isNotesVisible, setNotesVisible] = useState(false);
  const [isJournalVisible, setJournalVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFirstVisitBubble, setShowFirstVisitBubble] = useState(false);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const [quickActionEvent, setQuickActionEvent] = useState<Note | null>(null);
  const [linkTodoForEventId, setLinkTodoForEventId] = useState<string | null>(null);

  // Pending drops from store - shows loading cards while pipeline runs
  // These persist until promotePendingDropToEntity removes them
  const todayPendingDrops = useTodayPendingDrops();

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
      openEntityOverlay({ id: item.id, type: item.type });
    },
    [openEntityOverlay],
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

  // Handle event quick action sheet
  const handleEventQuickAction = useCallback((event: Note) => {
    setQuickActionEvent(event);
  }, []);

  const handleDismissEvent = useCallback((eventId: string) => {
    const now = nowTimestamp();
    useGremlyStore.getState().updateNote(eventId, {
      archived: true,
      archived_reason: 'dismissed_by_user',
      archived_at: now,
    });
    setQuickActionEvent(null);
  }, []);

  const handleEditEventTime = useCallback(
    (eventId: string, startTime: string, endTime: string | null) => {
      useGremlyStore.getState().updateNote(eventId, {
        event_time: startTime,
        end_time: endTime,
        user_edited_fields: [...(quickActionEvent?.user_edited_fields ?? []), 'event_time'],
      });
      setQuickActionEvent(null);
    },
    [quickActionEvent],
  );

  const handleAddPrepNote = useCallback((eventId: string, body: string) => {
    useGremlyStore.getState().updateNote(eventId, { body });
    setQuickActionEvent(null);
  }, []);

  const handleEventRemind = useCallback(
    async (eventId: string, minutesBefore: number) => {
      const event = quickActionEvent;
      if (!event) return;

      // Schedule the actual notification
      const notificationId = await scheduleEventReminder(
        eventId,
        event.title || 'Event',
        event.target_date || '',
        event.event_time || null,
        minutesBefore,
      );

      // Store reminder preferences + notification ID on the note
      const existingIds = event.notification_ids ?? [];
      useGremlyStore.getState().updateNote(eventId, {
        reminder_preferences: { dayBefore: minutesBefore >= 1440, morningOf: false, minutesBefore },
        ...(notificationId ? { notification_ids: [...existingIds, notificationId] } : {}),
      });

      setQuickActionEvent(null);
    },
    [quickActionEvent],
  );

  const handleOpenFullEvent = useCallback(
    (eventId: string) => {
      setQuickActionEvent(null);
      openEntityOverlay({ id: eventId, type: 'note' });
    },
    [openEntityOverlay],
  );

  const handleLinkTodo = useCallback((eventId: string, todoId: string) => {
    useGremlyStore.getState().updateTodo(todoId, { linked_event_id: eventId } as any);
    useGremlyStore.getState().updateNote(eventId, { linked_event_id: todoId });
    setLinkTodoForEventId(null);
  }, []);

  // Handle key date press - close brief first, then open overlay for event note
  const handleKeyDatePress = useCallback(
    (event: Note) => {
      console.log('[NowScreenV1] handleKeyDatePress called:', event.id, event.title);
      // Navigate back from Morning Brief screen first (if applicable)
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
      // Open the overlay after a short delay to allow screen to close
      setTimeout(() => {
        overlayController.openEdit({
          record: event,
        });
      }, 100);
    },
    [overlayController, navigation],
  );

  // Handle overwhelm plan submission
  const handleOverwhelmSubmit = useCallback(() => {
    const selectedItems = [...displayLockedItems, ...visibleActiveItems]
      .filter((item) => overwhelm.selectedIds.includes(item.id))
      .map((item) => ({ id: item.id, title: item.name }));

    void overwhelm.requestPlan(selectedItems);
  }, [overwhelm, displayLockedItems, visibleActiveItems]);

  // Handle add press - opens quick-add MindDrop modal
  const handleAddPress = useCallback(() => {
    setQuickAddVisible(true);
  }, []);

  // Handle opening Morning Brief sheet
  const handleOpenBrief = useCallback(() => {
    if (hasSweepedToday) {
      setShowDayPicker(true);
    } else {
      setBriefTargetDate(undefined);
      navigation.navigate('MorningBrief');
    }
  }, [hasSweepedToday, navigation]);

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

  // Quick add hook - passes briefTargetDate so tomorrow-mode items land on the right day
  const quickAdd = useNowQuickAdd({ targetDate: briefTargetDate });

  // Handle quick add submission - fire-and-forget, modal closes immediately
  const handleQuickAddSubmit = useCallback(
    (text: string) => {
      console.log(
        '[NowScreenV1] Quick add submitted:',
        text,
        briefTargetDate ? `(target: ${briefTargetDate})` : '',
      );
      quickAdd.onQuickAdd(text);
    },
    [quickAdd, briefTargetDate],
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
    navigation.navigate('HubScreen');
  }, [navigation]);

  // Handle selecting a log from YourNotesPopup
  const handleSelectLog = useCallback(
    (log: LogItem) => {
      setNotesVisible(false);
      openEntityOverlay({ id: log.id, type: 'note' });
    },
    [openEntityOverlay],
  );

  // Handle selecting a journal from YourNotesPopup
  const handleSelectJournal = useCallback((log: LogItem) => {
    setNotesVisible(false);
    setSelectedJournalId(log.id);
    setJournalVisible(true);
  }, []);

  if (!isInitialized) {
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
        eventNotes={todayEventNotes}
        onPressProgress={() => setProgressVisible(true)}
        onPressWeek={() => navigation.navigate('Habits')}
        onCalendarPress={handleCalendarHintPress}
        onNotesPress={handleNotesPress}
        onMascotPress={() => setShowHelp(true)}
      />
      <FirstTodayVisitBubble
        visible={showFirstVisitBubble}
        onDismiss={handleDismissFirstVisitBubble}
      />
      <WeeklySummaryBanner />
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
          pendingDrops={todayPendingDrops}
          overdueTodos={displayOverdueTodos}
          recentDrops={displayRecentDrops}
          onAddToToday={handleAddToToday}
          bottomInset={insets.bottom}
          brief={brief}
          lockedItemIds={lockedItemIds}
          eventNotes={todayEventNotes}
          onEventPress={handleKeyDatePress}
          onEventQuickAction={handleEventQuickAction}
        />
      </View>

      {/* Sweep Pill - fixed above tab bar */}
      <View
        style={[styles.sweepPillContainer, { bottom: insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        <SweepPill
          count={sweepCandidateCount}
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
          const overlayType = item.type === 'journal' ? 'note' : item.type;
          openEntityOverlay({ id: item.id, type: overlayType });
        }}
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

      {/* Day Picker - shown when Organize is pressed after sweep */}
      <Modal
        visible={showDayPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDayPicker(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
          onPress={() => setShowDayPicker(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 20,
              width: '100%',
              maxWidth: 300,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
                color: '#0E1116',
                marginBottom: 16,
                textAlign: 'center',
              }}
            >
              Which day?
            </Text>
            <Pressable
              style={{
                backgroundColor: '#E8F0EB',
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
                marginBottom: 10,
              }}
              onPress={() => {
                setShowDayPicker(false);
                setBriefTargetDate(undefined);
                navigation.navigate('MorningBrief');
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#2E5540' }}>Plan today</Text>
            </Pressable>
            <Pressable
              style={{
                backgroundColor: '#2E5540',
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: 'center',
              }}
              onPress={() => {
                setShowDayPicker(false);
                const td = getDateService().addDays(todayStr, 1);
                setBriefTargetDate(td);
                navigation.navigate('MorningBrief', { targetDate: td });
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
                Plan tomorrow
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Event Quick Action Sheet */}
      <EventQuickActionSheet
        visible={!!quickActionEvent}
        event={quickActionEvent}
        onClose={() => setQuickActionEvent(null)}
        onDismiss={handleDismissEvent}
        onEditTime={handleEditEventTime}
        onAddPrepNote={handleAddPrepNote}
        onLinkTodo={(eventId) => {
          setQuickActionEvent(null);
          setTimeout(() => setLinkTodoForEventId(eventId), 300);
        }}
        onRemind={handleEventRemind}
        onOpenFull={handleOpenFullEvent}
      />

      <TodoLinkSheet
        visible={!!linkTodoForEventId}
        eventId={linkTodoForEventId}
        onClose={() => setLinkTodoForEventId(null)}
        onSelect={handleLinkTodo}
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
    >
      <View style={styles.optimisticContent}>
        <View style={styles.optimisticTextContainer}>
          <Text numberOfLines={1} style={styles.optimisticTitle}>
            {title}
          </Text>
          <Animated.Text style={[styles.optimisticSubtitle, { opacity: textOpacityRef.current }]}>
            Working on it{dots}
          </Animated.Text>
        </View>
        <ActivityIndicator size="small" color="#2E5540" />
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
  pendingDrops?: Array<{ localId: string; text: string; smartTitle?: string; status: string }>;
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
  /** All event notes for today (external + native, from useEventNotesForDate) */
  eventNotes?: Note[];
  onEventPress?: (event: Note) => void;
  onEventQuickAction?: (event: Note) => void;
};

function TodayFocusList({
  lockedItems,
  activeItems,
  futureItems,
  progressPercent,
  hasAnyTodayWork,
  onPressItem,
  onToggleComplete,
  pendingDrops = [],
  overdueTodos,
  recentDrops,
  onAddToToday,
  bottomInset,
  brief,
  lockedItemIds,
  eventNotes = [],
  onEventPress,
  onEventQuickAction,
}: TodayFocusListProps) {
  // Get current time block for highlighting
  const currentTimeBlock = getCurrentTimeBlock();

  // Raw store data for scheduled time lookups
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);

  // Group all event notes by time block
  const eventNotesByBlock = useMemo(() => groupKeyDatesByTimeBlock(eventNotes ?? []), [eventNotes]);

  // Build flat sorted list: locked + active items merged, sorted by sequence
  const sortedItems = useMemo(() => {
    // Convert locked items to NowActiveItem format so they flow through block grouping
    const lockedAsActive: NowActiveItem[] = lockedItems.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      locked: false as const, // Type compat — tracked via lockedItemIds
      dueDay: item.dueDay ?? null,
      cadence: item.cadence,
      targetPerPeriod: item.targetPerPeriod,
      frequency: item.frequency,
      spaceId: item.spaceId ?? null,
      spaceName: item.spaceName ?? null,
    }));

    // Merge locked + active, dedup by id
    const seen = new Set<string>();
    const allItems = [...lockedAsActive, ...activeItems].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // Sort by sequence priority: morning -> day -> evening -> whenever
    const morningIds = new Set(brief?.morning_sequence?.map((i) => i.id) || []);
    const dayIds = new Set(brief?.day_sequence?.map((i) => i.id) || []);
    const eveningIds = new Set(brief?.evening_sequence?.map((i) => i.id) || []);

    const getSequencePriority = (id: string): number => {
      if (morningIds.has(id)) return 0;
      if (dayIds.has(id)) return 1;
      if (eveningIds.has(id)) return 2;
      return 3; // whenever
    };

    return allItems.sort((a, b) => getSequencePriority(a.id) - getSequencePriority(b.id));
  }, [activeItems, brief, lockedItems]);

  // Group items by time block using multiple signals (brief sequences, store time_window, scheduled time)
  const { itemsByBlock, breakHabitsByBlock } = useMemo(() => {
    const morningIds = new Set(brief?.morning_sequence?.map((i) => i.id) || []);
    const dayIds = new Set(brief?.day_sequence?.map((i) => i.id) || []);
    const eveningIds = new Set(brief?.evening_sequence?.map((i) => i.id) || []);

    // Build a map of effective block values from the store (daily_block overrides time_window)
    const storeTimeWindow = new Map<string, string | null>();
    for (const t of todos) storeTimeWindow.set(t.id, t.daily_block ?? t.time_window ?? null);
    for (const h of habits) storeTimeWindow.set(h.id, h.daily_block ?? h.time_window ?? null);

    // Resolve which block an item belongs to using layered signals:
    // 1. Brief sequences (authoritative if present)
    // 2. Effective block: daily_block ?? time_window (set by organize, most reliable)
    // 3. scheduled_start_iso hour → derive block via getTimeBlockForHour
    // 4. inferTimeWindow (NowActiveItem.timeWindow + name keywords)
    const resolveBlock = (item: NowActiveItem): TimeBlock => {
      // 1. Brief sequences
      if (morningIds.has(item.id)) return 'morning';
      if (dayIds.has(item.id)) return 'afternoon';
      if (eveningIds.has(item.id)) return 'evening';

      // 2. Raw store time_window (handles 'morning', 'day', 'evening')
      const rawTw = storeTimeWindow.get(item.id);
      if (rawTw === 'morning') return 'morning';
      if (rawTw === 'day') return 'afternoon';
      if (rawTw === 'evening') return 'evening';

      // 3. Derive from scheduled_start_iso
      const todo = todos.find((t) => t.id === item.id);
      const habit = habits.find((h) => h.id === item.id);
      const iso = todo?.scheduled_start_iso || habit?.scheduled_start_iso;
      if (iso) {
        const d = new Date(iso);
        if (!isNaN(d.getTime())) {
          return getTimeBlockForHour(d.getHours());
        }
      }

      // 4. inferTimeWindow fallback (NowActiveItem.timeWindow + name keywords)
      const tw = inferTimeWindow(item);
      if (tw === 'morning') return 'morning';
      if (tw === 'afternoon' || tw === 'midday' || tw === 'day') return 'afternoon';
      if (tw === 'evening') return 'evening';
      return 'anytime';
    };

    const grouped: Record<TimeBlock, NowActiveItem[]> = {
      allday: [],
      morning: [],
      afternoon: [],
      evening: [],
      anytime: [],
    };

    const breakNames: Record<TimeBlock, string[]> = {
      allday: [],
      morning: [],
      afternoon: [],
      evening: [],
      anytime: [],
    };

    for (const item of sortedItems) {
      // Break habits → awareness card (names only, no rows)
      if (item.isBreakHabit) {
        const block = resolveBlock(item);
        if (block === 'morning') breakNames.morning.push(item.name);
        else if (block === 'afternoon') breakNames.afternoon.push(item.name);
        else if (block === 'evening') breakNames.evening.push(item.name);
        else breakNames.allday.push(item.name);
        continue;
      }

      // Regular items → rows
      grouped[resolveBlock(item)].push(item);
    }

    return { itemsByBlock: grouped, breakHabitsByBlock: breakNames };
  }, [sortedItems, brief, todos, habits]);

  // Merge events and tasks into chronological lists per block
  const unifiedByBlock = useMemo(() => {
    const blocks = ['morning', 'afternoon', 'evening', 'anytime', 'allday'] as const;
    const now = getDateService().now();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const result: Record<
      string,
      Array<{
        kind: 'event' | 'task';
        id: string;
        startMinutes: number | null;
        event?: Note;
        item?: NowActiveItem;
      }>
    > = {};

    // Helper: get start minutes from a Note's event_time
    const eventStartMins = (note: Note): number | null => {
      if (!note.event_time) return null;
      const [h, m] = note.event_time.split(':').map(Number);
      return !isNaN(h) ? h * 60 + (m || 0) : null;
    };

    // Helper: get start minutes from an active item's scheduled time
    const itemStartMins = (item: NowActiveItem): number | null => {
      const todo = todos.find((t) => t.id === item.id);
      const habit = habits.find((h) => h.id === item.id);
      const iso = todo?.scheduled_start_iso || habit?.scheduled_start_iso;
      if (!iso) return null;
      const d = new Date(iso);
      return d.getHours() * 60 + d.getMinutes();
    };

    for (const block of blocks) {
      const entries: (typeof result)[string] = [];

      for (const event of eventNotesByBlock[block]) {
        entries.push({
          kind: 'event',
          id: event.id,
          startMinutes: eventStartMins(event),
          event,
        });
      }

      for (const item of itemsByBlock[block]) {
        entries.push({
          kind: 'task',
          id: item.id,
          startMinutes: itemStartMins(item),
          item,
        });
      }

      // Sort: timed items first (chronologically), then untimed
      entries.sort((a, b) => {
        if (a.startMinutes != null && b.startMinutes != null) {
          return a.startMinutes - b.startMinutes;
        }
        if (a.startMinutes != null) return -1;
        if (b.startMinutes != null) return 1;
        return 0;
      });

      result[block] = entries.filter((entry) => {
        // Only filter calendar events — tasks always stay
        if (entry.kind !== 'event' || !entry.event) return true;
        const event = entry.event;

        // All-day events stay visible all day
        if (event.is_all_day) return true;

        // If event has an end_time, check if it has already passed
        if (event.end_time) {
          const [eh, em] = event.end_time.split(':').map(Number);
          if (!isNaN(eh)) {
            const endMinutes = eh * 60 + (em || 0);
            return endMinutes > nowMinutes;
          }
        }

        // No end_time available — keep it visible (can't determine when it ends)
        return true;
      });
    }

    return result;
  }, [eventNotesByBlock, itemsByBlock, todos, habits]);

  // Helper to check if a block should render
  const shouldRenderBlock = (block: TimeBlock) => {
    const hasItems = (unifiedByBlock[block]?.length ?? 0) > 0;
    const hasBreakHabits = breakHabitsByBlock[block].length > 0;
    return hasItems || hasBreakHabits;
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
    lockedItems.length === 0 && activeItems.length === 0 && pendingDrops.length === 0;
  const isAllComplete = progressPercent === 100 && hasAnyTodayWork && pendingDrops.length === 0;

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

      {/* All Day section */}
      {shouldRenderBlock('allday') && (
        <TimeBlockSection block="allday" isFirst={getIsFirst()}>
          {unifiedByBlock.allday.map((entry, index) =>
            entry.kind === 'event' ? (
              <NowCalendarEventRow
                key={entry.id}
                eventNote={entry.event}
                isFirst={index === 0}
                onPress={() => onEventPress?.(entry.event!)}
                onQuickAction={() => onEventQuickAction?.(entry.event!)}
              />
            ) : (
              <NowFocusRow
                key={entry.id}
                item={entry.item!}
                isCompleted={false}
                isLocked={false}
                isLockedIn={lockedItemIds?.has(entry.id)}
                isFirst={index === 0}
                onPress={() => onPressItem?.(entry.item!)}
                onToggleComplete={() => onToggleComplete?.(entry.item!)}
              />
            ),
          )}
        </TimeBlockSection>
      )}

      {/* Morning section */}
      {shouldRenderBlock('morning') && (
        <TimeBlockSection block="morning" isFirst={getIsFirst()}>
          {unifiedByBlock.morning.map((entry, index) =>
            entry.kind === 'event' ? (
              <NowCalendarEventRow
                key={entry.id}
                eventNote={entry.event}
                isFirst={index === 0}
                onPress={() => onEventPress?.(entry.event!)}
                onQuickAction={() => onEventQuickAction?.(entry.event!)}
              />
            ) : (
              <NowFocusRow
                key={entry.id}
                item={entry.item!}
                isCompleted={false}
                isLocked={false}
                isLockedIn={lockedItemIds?.has(entry.id)}
                isFirst={index === 0}
                onPress={() => onPressItem?.(entry.item!)}
                onToggleComplete={() => onToggleComplete?.(entry.item!)}
              />
            ),
          )}
          {breakHabitsByBlock.morning.length > 0 && (
            <BreakHabitCard names={breakHabitsByBlock.morning} />
          )}
        </TimeBlockSection>
      )}

      {/* Afternoon section */}
      {shouldRenderBlock('afternoon') && (
        <TimeBlockSection block="afternoon" isFirst={getIsFirst()}>
          {unifiedByBlock.afternoon.map((entry, index) =>
            entry.kind === 'event' ? (
              <NowCalendarEventRow
                key={entry.id}
                eventNote={entry.event}
                isFirst={index === 0}
                onPress={() => onEventPress?.(entry.event!)}
                onQuickAction={() => onEventQuickAction?.(entry.event!)}
              />
            ) : (
              <NowFocusRow
                key={entry.id}
                item={entry.item!}
                isCompleted={false}
                isLocked={false}
                isLockedIn={lockedItemIds?.has(entry.id)}
                isFirst={index === 0}
                onPress={() => onPressItem?.(entry.item!)}
                onToggleComplete={() => onToggleComplete?.(entry.item!)}
              />
            ),
          )}
          {breakHabitsByBlock.afternoon.length > 0 && (
            <BreakHabitCard names={breakHabitsByBlock.afternoon} />
          )}
        </TimeBlockSection>
      )}

      {/* Evening section */}
      {shouldRenderBlock('evening') && (
        <TimeBlockSection block="evening" isFirst={getIsFirst()}>
          {unifiedByBlock.evening.map((entry, index) =>
            entry.kind === 'event' ? (
              <NowCalendarEventRow
                key={entry.id}
                eventNote={entry.event}
                isFirst={index === 0}
                onPress={() => onEventPress?.(entry.event!)}
                onQuickAction={() => onEventQuickAction?.(entry.event!)}
              />
            ) : (
              <NowFocusRow
                key={entry.id}
                item={entry.item!}
                isCompleted={false}
                isLocked={false}
                isLockedIn={lockedItemIds?.has(entry.id)}
                isFirst={index === 0}
                onPress={() => onPressItem?.(entry.item!)}
                onToggleComplete={() => onToggleComplete?.(entry.item!)}
              />
            ),
          )}
          {breakHabitsByBlock.evening.length > 0 && (
            <BreakHabitCard names={breakHabitsByBlock.evening} />
          )}
        </TimeBlockSection>
      )}

      {/* Any time section */}
      {shouldRenderBlock('anytime') && (
        <TimeBlockSection block="anytime" isFirst={getIsFirst()}>
          {unifiedByBlock.anytime.map((entry, index) =>
            entry.kind === 'event' ? (
              <NowCalendarEventRow
                key={entry.id}
                eventNote={entry.event}
                isFirst={index === 0}
                onPress={() => onEventPress?.(entry.event!)}
                onQuickAction={() => onEventQuickAction?.(entry.event!)}
              />
            ) : (
              <NowFocusRow
                key={entry.id}
                item={entry.item!}
                isCompleted={false}
                isLocked={false}
                isLockedIn={lockedItemIds?.has(entry.id)}
                isFirst={index === 0}
                onPress={() => onPressItem?.(entry.item!)}
                onToggleComplete={() => onToggleComplete?.(entry.item!)}
              />
            ),
          )}
        </TimeBlockSection>
      )}

      {/* Pending drops - processing cards from store */}
      {/* These persist until the entity is created and promoted */}
      {pendingDrops.map((drop) => (
        <OptimisticQuickAddCard
          key={drop.localId}
          id={drop.localId}
          title={drop.smartTitle || drop.text}
        />
      ))}

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
  // Optimistic quick-add card - matches Today's Focus row styling
  optimisticCard: {
    backgroundColor: '#FDFCFA',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(46,85,64,0.12)',
  },
  optimisticContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optimisticTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  optimisticTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0E1116',
    lineHeight: 18,
  },
  optimisticSubtitle: {
    fontSize: 12,
    color: '#2E5540',
    marginTop: 2,
    fontStyle: 'italic',
  },
  // Spacing for Overdue and Recent Drops sections
  sectionSpacing: {
    marginTop: 16,
  },
});
