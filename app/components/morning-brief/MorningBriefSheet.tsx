/**
 * MorningBriefSheet - Morning Brief Flow Modal (Phase 2 Redesign)
 *
 * Timeline-based view showing:
 * - Day overview with calendar context
 * - Time blocks (Morning/Afternoon/Evening) with events and tasks
 * - "On Your Plate" section for flexible tasks
 * - Gremly capacity summary
 *
 * Replaces the previous drag-and-drop bucket UI.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  Animated,
  LayoutAnimation,
  Alert,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleEventReminder } from '../../../lib/notifications/scheduleEventReminder';
import {
  ShieldOff,
  Calendar,
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  Plus,
} from 'lucide-react-native';
import { BreakHabitCard } from '../../../components/now/BreakHabitCard';
import { BRAND } from '../../../design/brand';
import { useGremlyStore, isHabitLockedIn } from '../../../lib/store/useGremlyStore';
import { computeHabitStreak } from '../../../lib/habits/streakUtils';
import { useMiniSweepGate } from '../../../lib/today/hooks/useMiniSweepGate';
import { getDateService } from '../../../lib/date';
import { useCapacityForDate } from '../../../lib/store/capacitySelectors';
import {
  useTodayPendingDrops,
  useEventsForDate,
  selectHabitCompletedToday,
  selectHabitLastCompletionDate,
  selectCompletionsInRolling7Days,
  selectCompletionsInRolling30Days,
} from '../../../lib/store/selectors';
import { getTimeBlockForHour } from '../../../lib/now/timeBlockHelpers';
import type { Note, Todo, Habit } from '../../../lib/types';
import type { TimeBlock } from '../../../lib/capacity';
import { MiniSweepGate } from './MiniSweepGate';
import { MorningBriefStepper, type BriefStep } from './MorningBriefStepper';
import { StepGlance } from './StepGlance';
import { StepSweep } from './StepSweep';
import { StepPlan } from './StepPlan';
import { StepPrioritize } from './StepPrioritize';
import { StepOrganize } from './StepOrganize';
import { NowQuickAddModal } from '../../../components/now/NowQuickAddModal';
import { GlobalEventPopup } from '../../../components/calendar/GlobalEventPopup';
import EventQuickActionSheet from '../../../components/now/EventQuickActionSheet';
import { GlobalEventTimePicker } from '../../../components/calendar/GlobalEventTimePicker';
import { useUnifiedOverlayController } from '../../../hooks/useUnifiedOverlayController';
import {
  MorningBriefHeader,
  MorningBriefFooter,
  TimeBlockSection,
  TaskQuickActionSheet,
  OnYourPlateSection,
  TimeEstimatePicker,
  OrganizeButton,
  type TaskItemData,
  ParkedForLaterSection,
} from './components';
import { CapacityRing } from './components/CapacityRing';
import { GapSlotPicker } from './components/GapSlotPicker';
import type { TimeGap, SlottedTask } from '../../../lib/timeGaps';

interface MorningBriefSheetProps {
  onClose: () => void;
  onComplete?: () => void;
  /** Handler for quick add text submission */
  onQuickAddSubmit?: (text: string) => void;
  /** Handler for 'Prefer to add manually' */
  onQuickAddManual?: () => void;
  /** Handler for when a Key Date event is pressed */
  onKeyDatePress?: (event: Note) => void;
  /** Target date in YYYY-MM-DD format. Defaults to today. Pass tomorrow's date for evening planning. */
  targetDate?: string;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  return getDateService().getCurrentDate();
}

/**
 * Group key date events by time block based on event_time
 * Events without event_time go to 'flexible' (On Your Plate section)
 */
type KeyDateTimeBlock = 'allday' | 'morning' | 'day' | 'evening' | 'flexible';

function groupKeyDatesByTimeBlock(keyDates: Note[]): Record<KeyDateTimeBlock, Note[]> {
  const grouped: Record<KeyDateTimeBlock, Note[]> = {
    allday: [],
    morning: [],
    day: [],
    evening: [],
    flexible: [],
  };

  for (const event of keyDates) {
    if (event.is_all_day || !event.event_time) {
      grouped.allday.push(event);
    } else {
      const [hourStr] = event.event_time.split(':');
      const hour = parseInt(hourStr, 10);
      if (!isNaN(hour)) {
        const block = getTimeBlockForHour(hour);
        if (block === 'afternoon') grouped.day.push(event);
        else if (block === 'morning') grouped.morning.push(event);
        else if (block === 'evening') grouped.evening.push(event);
        else grouped.flexible.push(event);
      } else {
        grouped.flexible.push(event);
      }
    }
  }

  return grouped;
}

/**
 * Compute a relative "last done" label from a YYYY-MM-DD date string.
 * Returns null if no date provided.
 */
function getRelativeLastDone(lastDate: string | undefined, today: string): string | null {
  if (!lastDate) return null;
  if (lastDate === today) return null; // Will show "done today" instead

  const todayDate = new Date(today + 'T12:00:00');
  const lastDateObj = new Date(lastDate + 'T12:00:00');
  const diffDays = Math.round(
    (todayDate.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 1) return 'last: yesterday';
  if (diffDays <= 7) return `last: ${diffDays} days ago`;
  return `last: ${diffDays}d ago`;
}

/**
 * Compute a relative due date label for a todo.
 * Returns null if no relevant label needed.
 */
function getDueDateLabel(
  dueDay: string | null | undefined,
  today: string,
): { label: string; tone: 'neutral' | 'gentle' | 'warm' } | null {
  if (!dueDay) return null;

  const todayDate = new Date(today + 'T12:00:00');
  const dueDate = new Date(dueDay + 'T12:00:00');
  const diffDays = Math.round((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    // Overdue — gentle, not alarming
    const monthDay = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { label: `from ${monthDay}`, tone: 'warm' };
  }
  if (diffDays === 0) return { label: 'due today', tone: 'gentle' };
  if (diffDays === 1) return { label: 'due tmrw', tone: 'gentle' };
  if (diffDays <= 3) return { label: `due in ${diffDays}d`, tone: 'neutral' };
  return null; // More than 3 days out — not urgent enough to show
}

// Helper: does the task name imply a specific time of day?
function getSemanticBlock(name: string): 'morning' | 'day' | 'evening' | null {
  const lower = name.toLowerCase();
  if (/\b(morning|am routine|sunrise|wake|breakfast)\b/.test(lower)) return 'morning';
  if (/\b(afternoon|lunch|midday)\b/.test(lower)) return 'day';
  if (/\b(evening|night|bedtime|dinner|sunset|pm routine)\b/.test(lower)) return 'evening';
  return null;
}

export function MorningBriefSheet({
  onClose,
  onComplete,
  onQuickAddSubmit,
  onQuickAddManual,
  onKeyDatePress,
  targetDate,
}: MorningBriefSheetProps) {
  const insets = useSafeAreaInsets();
  const overlayController = useUnifiedOverlayController();
  const today = targetDate ?? getTodayDateString();
  const isTomorrow = today !== getTodayDateString();

  // ─────────────────────────────────────────────────────────────────
  // ZUSTAND STATE & ACTIONS
  // ─────────────────────────────────────────────────────────────────
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const updateHabit = useGremlyStore((s) => s.updateHabit);
  const addCommitment = useGremlyStore((s) => s.addCommitment);
  const removeCommitment = useGremlyStore((s) => s.removeCommitment);
  const saveBrief = useGremlyStore((s) => s.saveBrief);

  // Brief capacity gate state
  const briefSelectedIds = useGremlyStore((s) => s.briefSelectedIds);
  const briefLockedIds = useGremlyStore((s) => s.briefLockedIds);
  const briefSelectionDate = useGremlyStore((s) => s.briefSelectionDate);
  const setBriefSelections = useGremlyStore((s) => s.setBriefSelections);
  const toggleBriefSelection = useGremlyStore((s) => s.toggleBriefSelection);
  const toggleBriefLock = useGremlyStore((s) => s.toggleBriefLock);
  const setBriefParked = useGremlyStore((s) => s.setBriefParked);
  const briefCompletedToday = useGremlyStore((s) => s.briefCompletedToday);
  const setBriefCompletedToday = useGremlyStore((s) => s.setBriefCompletedToday);
  const habitProgress = useGremlyStore((s) => s.habitProgress);

  // ─────────────────────────────────────────────────────────────────
  // CAPACITY & CALENDAR DATA
  // ─────────────────────────────────────────────────────────────────
  const capacity = useCapacityForDate(today);

  // ─────────────────────────────────────────────────────────────────
  // KEY DATE EVENTS (from Notes with subtype='event')
  // ─────────────────────────────────────────────────────────────────
  const todayKeyDates = useEventsForDate(today);
  const spaces = useGremlyStore((s) => s.spaces);

  // Group key dates by time block
  const keyDatesByBlock = useMemo(() => {
    return groupKeyDatesByTimeBlock(todayKeyDates);
  }, [todayKeyDates]);

  // Helper to get space name for a key date event
  const getSpaceName = useCallback(
    (spaceId: string | null | undefined): string | undefined => {
      if (!spaceId) return undefined;
      const space = spaces.find((s) => s.id === spaceId);
      return space?.name;
    },
    [spaces],
  );

  // ─────────────────────────────────────────────────────────────────
  // MINI SWEEP GATE
  // ─────────────────────────────────────────────────────────────────
  const { shouldShowMiniSweep, rolledOverTodos, unscheduledTodos, markMiniSweepCompleted } =
    useMiniSweepGate();

  const [miniSweepDismissed, setMiniSweepDismissed] = useState(false);
  const showMiniSweep = !isTomorrow && shouldShowMiniSweep && !miniSweepDismissed;

  const handleMiniSweepComplete = useCallback(() => {
    markMiniSweepCompleted();
    setMiniSweepDismissed(true);
  }, [markMiniSweepCompleted]);

  const handleMiniSweepSkip = useCallback(() => {
    setMiniSweepDismissed(true);
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // HIDDEN EVENTS (from Zustand store - date-keyed)
  // ─────────────────────────────────────────────────────────────────
  // IMPORTANT: Access the full object, then derive the array in useMemo
  // to avoid creating new array references that cause infinite re-renders.
  // The ?? [] fallback inside useGremlyStore creates a new array each render.
  const hiddenCalendarEventsByDate = useGremlyStore((s) => s.hiddenCalendarEventsByDate);
  const hiddenEventIds = useMemo(
    () => hiddenCalendarEventsByDate[today] ?? [],
    [hiddenCalendarEventsByDate, today],
  );

  // ─────────────────────────────────────────────────────────────────
  // HIDDEN TODAY (Not Today - todos/habits hidden for the day)
  // ─────────────────────────────────────────────────────────────────
  const hiddenTodayIds = useGremlyStore((s) => s.hiddenTodayIds);
  const hiddenTodayDate = useGremlyStore((s) => s.hiddenTodayDate);
  const slotTaskIntoGap = useGremlyStore((s) => s.slotTaskIntoGap);
  const unslotTask = useGremlyStore((s) => s.unslotTask);
  const hideForToday = useGremlyStore((s) => s.hideForToday);

  // Only apply hidden IDs if they match the date we're planning for
  const effectiveHiddenIds = useMemo(() => {
    return hiddenTodayDate === today ? hiddenTodayIds : [];
  }, [hiddenTodayIds, hiddenTodayDate, today]);

  // ─────────────────────────────────────────────────────────────────
  // TASK DATA TRANSFORMATION
  // ─────────────────────────────────────────────────────────────────

  // Get todos due on target date (excluding hidden ones for that date)
  const todayTodos = useMemo(() => {
    return todos.filter(
      (t) =>
        !t.archived && !t.completed_at && t.due_day === today && !effectiveHiddenIds.includes(t.id),
    );
  }, [todos, today, effectiveHiddenIds]);

  // Get habits due on target date (excluding hidden ones for that date)
  const todayHabits = useMemo(() => {
    return habits.filter((h) => {
      if (h.archived) return false;
      if (!h.start_date || h.start_date > today) return false;
      if (h.end_date && h.end_date < today) return false;
      if (effectiveHiddenIds.includes(h.id)) return false;
      return true;
    });
  }, [habits, today, effectiveHiddenIds]);

  // Transform to TaskItemData
  const transformTodo = useCallback(
    (todo: (typeof todos)[0]): TaskItemData => {
      const dueMeta = getDueDateLabel(todo.due_day, today);
      const metadata: TaskItemData['metadata'] = dueMeta
        ? { label: dueMeta.label, tone: dueMeta.tone }
        : null;

      // Compute dueStatus for prioritization chips
      let dueStatus: TaskItemData['dueStatus'] = null;
      if (dueMeta) {
        if (dueMeta.tone === 'warm') dueStatus = 'overdue';
        else if (dueMeta.label === 'due today') dueStatus = 'today';
        else if (dueMeta.label === 'due tmrw') dueStatus = 'tomorrow';
      }

      return {
        id: todo.id,
        type: 'todo',
        title: todo.name || 'Untitled',
        estimatedMinutes: todo.time_estimate_minutes ?? undefined,
        isLockedIn: todo.commitment === true,
        timeWindow: (todo.time_window as TaskItemData['timeWindow']) ?? null,
        metadata,
        dueStatus,
      };
    },
    [today],
  );

  // ─────────────────────────────────────────────────────────────────
  // HABIT METADATA (for contextual display)
  // ─────────────────────────────────────────────────────────────────
  const habitCompletedToday = useGremlyStore(selectHabitCompletedToday);
  const habitLastCompletion = useGremlyStore(selectHabitLastCompletionDate);
  const habitRolling7 = useGremlyStore(selectCompletionsInRolling7Days);
  const habitRolling30 = useGremlyStore(selectCompletionsInRolling30Days);

  const transformHabit = useCallback(
    (habit: (typeof habits)[0]): TaskItemData => {
      // Compute metadata based on habit type and progress
      let metadata: TaskItemData['metadata'] = null;
      const isDoneToday = habitCompletedToday.has(habit.id);
      const cadence = habit.cadence ?? 'daily';
      const isBreak = habit.subtype === 'break_habit';

      if (isDoneToday) {
        metadata = { label: '✓ done today', tone: 'done' };
      } else if (isBreak) {
        // Break habits show streak from last_checked_in_at
        const lastDate = habit.last_checked_in_at
          ? getDateService().extractDateFromIso(habit.last_checked_in_at)
          : undefined;
        if (lastDate) {
          const todayDate = new Date(today + 'T12:00:00');
          const lastDateObj = new Date(lastDate + 'T12:00:00');
          const streakDays = Math.round(
            (todayDate.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (streakDays > 0) {
            metadata = { label: `${streakDays}d strong`, tone: 'done' };
          }
        }
      } else if (cadence === 'weekly' || cadence === 'monthly') {
        // Frequency habits show progress: "2/3 this week"
        const target = habit.target_per_period ?? 1;
        const completions =
          cadence === 'weekly'
            ? (habitRolling7.get(habit.id) ?? 0)
            : (habitRolling30.get(habit.id) ?? 0);
        const periodLabel = cadence === 'weekly' ? 'this wk' : 'this mo';
        const isAtGoal = completions >= target;
        metadata = {
          label: isAtGoal
            ? `✓ ${completions}/${target} ${periodLabel}`
            : `${completions}/${target} ${periodLabel}`,
          tone: isAtGoal ? 'done' : 'neutral',
        };
      } else {
        // Daily habits show "last: X days ago"
        const lastDate = habitLastCompletion.get(habit.id);
        const relativeLabel = getRelativeLastDone(lastDate, today);
        if (relativeLabel) {
          metadata = { label: relativeLabel, tone: 'neutral' };
        }
      }

      // Compute streak for prioritization chips
      let streakCount: number | undefined;
      if (!isBreak && cadence === 'daily') {
        const progressDates = habitProgress
          .filter((p) => p.habit_id === habit.id)
          .map((p) => p.occurred_day);
        const { count } = computeHabitStreak(progressDates, cadence, habit.target_per_period ?? 1);
        if (count > 0) streakCount = count;
      }

      return {
        id: habit.id,
        type: 'habit',
        title: habit.name || 'Untitled',
        estimatedMinutes: habit.time_estimate_minutes ?? undefined,
        isLockedIn: isHabitLockedIn(habit),
        timeWindow: (habit.time_window as TaskItemData['timeWindow']) ?? null,
        metadata,
        streakCount,
      };
    },
    [habitCompletedToday, habitLastCompletion, habitRolling7, habitRolling30, today, habitProgress],
  );

  // Pending drops from store - shows loading cards while pipeline runs
  const todayPendingDrops = useTodayPendingDrops();

  // Group tasks by time block
  const { tasksByBlock, breakHabitsByBlock } = useMemo(() => {
    const morning: TaskItemData[] = [];
    const afternoon: TaskItemData[] = [];
    const evening: TaskItemData[] = [];
    const flexible: TaskItemData[] = [];

    const breakNames: Record<string, string[]> = {
      allday: [],
      morning: [],
      afternoon: [],
      evening: [],
    };

    // Process todos
    todayTodos.forEach((todo) => {
      const task = transformTodo(todo);
      switch (todo.time_window) {
        case 'morning':
          morning.push(task);
          break;
        case 'day':
          afternoon.push(task);
          break;
        case 'evening':
          evening.push(task);
          break;
        default:
          // Items with scheduled_start_iso but time_window 'any'/null
          // are already visible in the timeline via slottedItemsByBlock.
          // Don't double-show them in priorities.
          if (!todo.scheduled_start_iso) {
            flexible.push(task);
          }
      }
    });

    // Process habits
    todayHabits.forEach((habit) => {
      const isBreak = habit.subtype === 'break_habit';

      if (isBreak) {
        // Break habits → awareness card names only
        switch (habit.time_window) {
          case 'morning':
            breakNames.morning.push(habit.name);
            break;
          case 'day':
            breakNames.afternoon.push(habit.name);
            break;
          case 'evening':
            breakNames.evening.push(habit.name);
            break;
          default:
            breakNames.allday.push(habit.name);
        }
      } else {
        const task = transformHabit(habit);
        switch (habit.time_window) {
          case 'morning':
            morning.push(task);
            break;
          case 'day':
            afternoon.push(task);
            break;
          case 'evening':
            evening.push(task);
            break;
          default:
            if (!habit.scheduled_start_iso) {
              flexible.push(task);
            }
        }
      }
    });

    return {
      tasksByBlock: { morning, afternoon, evening, flexible },
      breakHabitsByBlock: breakNames,
    };
  }, [todayTodos, todayHabits, transformTodo, transformHabit]);

  // ─── Gap-based free minutes from TimeBlockSection callbacks ───
  const [blockFreeMinutes, setBlockFreeMinutes] = useState<Record<string, number>>(() => ({
    morning: capacity.blocks.morning.availableMinutes,
    day: capacity.blocks.day.availableMinutes,
    evening: capacity.blocks.evening.availableMinutes,
  }));

  const handleFreeMinutesCalculated = useCallback((block: string, minutes: number) => {
    setBlockFreeMinutes((prev) => {
      if (prev[block] === minutes) return prev;
      return { ...prev, [block]: minutes };
    });
  }, []);

  const totalActualFreeMinutes =
    blockFreeMinutes.morning + blockFreeMinutes.day + blockFreeMinutes.evening;

  // Tasks assigned to a block but NOT positioned in the timeline.
  // Gap-based free time can't see these, so we subtract them manually.
  const unslottedBlockMinutes = useMemo(() => {
    let total = 0;
    // Check todos assigned to a specific block without a scheduled time
    for (const todo of todayTodos) {
      if (todo.time_window && todo.time_window !== 'any' && !todo.scheduled_start_iso) {
        total += todo.time_estimate_minutes ?? 0;
      }
    }
    // Check habits assigned to a specific block without a scheduled time
    for (const habit of todayHabits) {
      if (
        habit.subtype !== 'break_habit' &&
        habit.time_window &&
        habit.time_window !== 'any' &&
        !habit.scheduled_start_iso
      ) {
        total += habit.time_estimate_minutes ?? 0;
      }
    }
    return total;
  }, [todayTodos, todayHabits]);

  // ─────────────────────────────────────────────────────────────────
  // CAPACITY GATE DETECTION
  // ─────────────────────────────────────────────────────────────────
  const realisticCapacity = useMemo(() => {
    return Math.max(0, totalActualFreeMinutes - unslottedBlockMinutes);
  }, [totalActualFreeMinutes, unslottedBlockMinutes]);

  const flexibleTaskMinutes = useMemo(() => {
    return tasksByBlock.flexible.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  }, [tasksByBlock.flexible]);

  const isPrioritizing =
    tasksByBlock.flexible.length > 0 && flexibleTaskMinutes > realisticCapacity;

  // Combined list of ALL tasks for the day (assigned + unassigned)
  const allDayTasks = useMemo(() => {
    return [
      ...tasksByBlock.morning,
      ...tasksByBlock.afternoon,
      ...tasksByBlock.evening,
      ...tasksByBlock.flexible,
    ];
  }, [tasksByBlock]);

  // ─── Step sequence for MorningBriefStepper ───
  const hasCompletedToday = useMemo(() => {
    return briefCompletedToday === today;
  }, [briefCompletedToday, today]);

  // Lock to initial value so mid-flow state changes (e.g. markMiniSweepCompleted)
  // don't recompute the array and shift step indices while the user is navigating.
  const stepsNeededRef = useRef<BriefStep[] | null>(null);
  if (stepsNeededRef.current === null) {
    // Re-entry: skip straight to plan review
    if (hasCompletedToday) {
      stepsNeededRef.current = ['plan'];
    } else {
      const steps: BriefStep[] = ['glance'];
      if (showMiniSweep) steps.push('sweep');
      // Always show — user reviews tasks whether or not they fit
      steps.push('prioritize');
      steps.push('organize', 'plan');
      stepsNeededRef.current = steps;
    }
  }
  const stepsNeeded = stepsNeededRef.current;

  // Memoized Sets for O(1) lookup
  const briefSelectedSet = useMemo(() => new Set(briefSelectedIds), [briefSelectedIds]);
  const briefLockedSet = useMemo(() => new Set(briefLockedIds), [briefLockedIds]);
  const isSelectionsStale = briefSelectionDate !== today;

  // Reset daily assignments on new day
  useEffect(() => {
    if (!isSelectionsStale) return;

    // Reset time_window for todos — unless name semantically matches the block
    const todosToReset = todayTodos.filter((t) => {
      if (!t.time_window || t.time_window === 'any') return false;
      const semantic = getSemanticBlock(t.name || '');
      return semantic !== t.time_window; // Only reset if name doesn't match block
    });

    const habitsToReset = todayHabits.filter((h) => {
      if (!h.time_window || h.time_window === 'any') return false;
      const semantic = getSemanticBlock(h.name || '');
      return semantic !== h.time_window;
    });

    // Reset lock-ins (always — lock-in is a daily commitment)
    const lockedTodosToReset = todayTodos.filter((t) => t.commitment === true);
    const lockedHabitsToReset = todayHabits.filter((h) => isHabitLockedIn(h));

    if (
      todosToReset.length > 0 ||
      habitsToReset.length > 0 ||
      lockedTodosToReset.length > 0 ||
      lockedHabitsToReset.length > 0
    ) {
      console.log('[MorningBrief] Daily reset', {
        blockResets: todosToReset.length + habitsToReset.length,
        lockResets: lockedTodosToReset.length + lockedHabitsToReset.length,
      });

      // Reset block assignments
      todosToReset.forEach((t) => updateTodo(t.id, { time_window: 'any' }));
      habitsToReset.forEach((h) => updateHabit(h.id, { time_window: 'any' }));

      // Reset lock-ins
      lockedTodosToReset.forEach((t) => removeCommitment(t.id, 'todo'));
      lockedHabitsToReset.forEach((h) => removeCommitment(h.id, 'habit'));
    }
  }, [isSelectionsStale, todayTodos, todayHabits, updateTodo, updateHabit, removeCommitment]);

  // Pre-selection: auto-select tasks up to 72% of realistic capacity when stale
  useEffect(() => {
    if (!isPrioritizing || !isSelectionsStale) return;

    const target = Math.round(realisticCapacity * 0.72);
    const sorted = [...tasksByBlock.flexible].sort((a, b) => {
      // Locked-in first
      if (a.isLockedIn !== b.isLockedIn) return a.isLockedIn ? -1 : 1;
      // Streaks (higher first)
      const sa = a.streakCount ?? 0;
      const sb = b.streakCount ?? 0;
      if (sa !== sb) return sb - sa;
      // Overdue > today > tomorrow > none
      const dueRank = (d: TaskItemData['dueStatus']) =>
        d === 'overdue' ? 0 : d === 'today' ? 1 : d === 'tomorrow' ? 2 : 3;
      const da = dueRank(a.dueStatus);
      const db = dueRank(b.dueStatus);
      if (da !== db) return da - db;
      return 0;
    });

    let budget = 0;
    const autoIds: string[] = [];
    for (const t of sorted) {
      const mins = t.estimatedMinutes || 0;
      if (budget + mins <= target || t.isLockedIn) {
        autoIds.push(t.id);
        budget += mins;
      }
    }
    setBriefSelections(autoIds, [], today);
  }, [
    isPrioritizing,
    isSelectionsStale,
    realisticCapacity,
    tasksByBlock.flexible,
    today,
    setBriefSelections,
  ]);

  // Derived capacity metrics
  const selectedMinutes = useMemo(() => {
    return tasksByBlock.flexible
      .filter((t) => briefSelectedSet.has(t.id))
      .reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
  }, [tasksByBlock.flexible, briefSelectedSet]);

  const remainingMinutes = realisticCapacity - selectedMinutes;

  const missingEstimateCount = useMemo(() => {
    return tasksByBlock.flexible.filter((t) => briefSelectedSet.has(t.id) && !t.estimatedMinutes)
      .length;
  }, [tasksByBlock.flexible, briefSelectedSet]);

  // Parked tasks = flexible items NOT selected (when prioritizing)
  const parkedTasks = useMemo(() => {
    if (!isPrioritizing) return [];
    return tasksByBlock.flexible.filter((t) => !briefSelectedSet.has(t.id));
  }, [isPrioritizing, tasksByBlock.flexible, briefSelectedSet]);

  // Pulse detection: fire when parked count increases
  const prevParkedCount = useRef(0);
  const [shouldPulse, setShouldPulse] = useState(false);

  useEffect(() => {
    if (parkedTasks.length > prevParkedCount.current && prevParkedCount.current > 0) {
      setShouldPulse(true);
      const timer = setTimeout(() => setShouldPulse(false), 600);
      return () => clearTimeout(timer);
    }
    prevParkedCount.current = parkedTasks.length;
  }, [parkedTasks.length]);

  // Day name for schedule section header (e.g., "TUESDAY'S SCHEDULE")
  const scheduleDayName = useMemo(() => {
    const d = new Date(today + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  }, [today]);

  // ─── Capacity helpers for planning card header ───
  const formatMins = useCallback((m: number) => {
    const abs = Math.abs(m);
    if (abs <= 0) return '0m';
    if (abs < 60) return `${abs}m`;
    const h = Math.floor(abs / 60);
    const r = abs % 60;
    return r > 0 ? `${h}h ${r}m` : `${h}h`;
  }, []);

  // Effective free = gap-based free minus selected flexible tasks
  // (selectedMinutes is identical to selectedFlexibleMinutes — both
  //  sum estimatedMinutes for selected flexible tasks)
  const effectiveFreeMinutes = Math.max(0, totalActualFreeMinutes - selectedMinutes);

  // Day-fullness percentage: total committed / total day window
  const totalDayMinutes = useMemo(() => {
    return (
      capacity.blocks.morning.totalMinutes +
      capacity.blocks.day.totalMinutes +
      capacity.blocks.evening.totalMinutes
    );
  }, [capacity]);

  const totalCommittedMinutes = totalDayMinutes - effectiveFreeMinutes;

  const dayPercentage =
    totalDayMinutes > 0 ? Math.round((totalCommittedMinutes / totalDayMinutes) * 100) : 0;

  const isOverCommitted = totalCommittedMinutes > totalDayMinutes;

  const capacityHeadline = useMemo(() => {
    if (effectiveFreeMinutes <= 0 && isOverCommitted) {
      const overMins = totalCommittedMinutes - totalDayMinutes;
      return `${formatMins(overMins)} over capacity`;
    }
    if (effectiveFreeMinutes === 0) return 'Fully planned';
    return `${formatMins(effectiveFreeMinutes)} free today`;
  }, [effectiveFreeMinutes, isOverCommitted, totalCommittedMinutes, totalDayMinutes, formatMins]);

  const hasSelections = briefSelectedSet.size > 0;

  const capacitySubline = useMemo(() => {
    if (isOverCommitted) {
      const overMins = totalCommittedMinutes - totalDayMinutes;
      return `${formatMins(totalCommittedMinutes)} planned · ${formatMins(overMins)} over`;
    }
    return `${formatMins(totalCommittedMinutes)} planned · ${formatMins(effectiveFreeMinutes)} free`;
  }, [isOverCommitted, totalCommittedMinutes, totalDayMinutes, effectiveFreeMinutes, formatMins]);

  // Compact summary for collapsed state
  const capacitySummary = useMemo(() => {
    return `${formatMins(effectiveFreeMinutes)} free · ${briefSelectedSet.size} priorities`;
  }, [effectiveFreeMinutes, formatMins, briefSelectedSet.size]);

  // Auto-collapse past time blocks (only if no tasks in them)
  useEffect(() => {
    const autoCollapsed: Record<string, boolean> = {};
    const blocks: Array<{
      key: string;
      capacity: typeof capacity.blocks.morning;
      tasks: TaskItemData[];
    }> = [
      { key: 'morning', capacity: capacity.blocks.morning, tasks: tasksByBlock.morning },
      { key: 'day', capacity: capacity.blocks.day, tasks: tasksByBlock.afternoon },
      { key: 'evening', capacity: capacity.blocks.evening, tasks: tasksByBlock.evening },
    ];
    for (const b of blocks) {
      if (b.capacity.isPast && b.tasks.length === 0) {
        autoCollapsed[b.key] = true;
      }
    }
    if (Object.keys(autoCollapsed).length > 0) {
      setCollapsedBlocks((prev) => ({ ...autoCollapsed, ...prev }));
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slotted items per block (tasks with scheduled_start_iso in this block's time window)
  const slottedItemsByBlock = useMemo(() => {
    const allSlotted = [
      ...todos.filter((t) => t.scheduled_start_iso && t.due_day === today),
      ...habits.filter((h) => h.scheduled_start_iso),
    ] as Array<(Todo | Habit) & { scheduled_start_iso: string }>;

    const result = {
      morning: [] as Array<(Todo | Habit) & { scheduled_start_iso: string }>,
      afternoon: [] as Array<(Todo | Habit) & { scheduled_start_iso: string }>,
      evening: [] as Array<(Todo | Habit) & { scheduled_start_iso: string }>,
    };

    for (const item of allSlotted) {
      const hour = new Date(item.scheduled_start_iso).getHours();
      if (hour < capacity.blocks.morning.endHour) {
        result.morning.push(item);
      } else if (hour < capacity.blocks.day.endHour) {
        result.afternoon.push(item);
      } else {
        result.evening.push(item);
      }
    }

    return result;
  }, [todos, habits, today, capacity]);

  // Lookup map for rendering slotted tasks with full TaskItemData
  const taskDataById = useMemo(() => {
    const map: Record<string, TaskItemData> = {};
    const allTasks = [
      ...tasksByBlock.morning,
      ...tasksByBlock.afternoon,
      ...tasksByBlock.evening,
      ...tasksByBlock.flexible,
    ];
    for (const task of allTasks) {
      map[task.id] = task;
    }
    // Also include slotted items that were excluded from tasksByBlock
    // (e.g., items with scheduled_start_iso but time_window 'any'/null)
    const allSlotted = [
      ...slottedItemsByBlock.morning,
      ...slottedItemsByBlock.afternoon,
      ...slottedItemsByBlock.evening,
    ];
    for (const item of allSlotted) {
      if (!map[item.id]) {
        const isHabit = 'cadence' in item;
        map[item.id] = isHabit
          ? transformHabit(item as (typeof habits)[0])
          : transformTodo(item as (typeof todos)[0]);
      }
    }
    return map;
  }, [tasksByBlock, slottedItemsByBlock, transformTodo, transformHabit]);

  // ─────────────────────────────────────────────────────────────────
  // GAP COMPUTATION FOR TASK QUICK ACTION SHEET
  // ─────────────────────────────────────────────────────────────────
  // Compute free time gaps per block from key date events + slotted items
  const allGaps = useMemo(() => {
    const MIN_GAP_MINUTES = 10;
    const blockEntries: Array<{
      block: TimeBlock;
      slotted: typeof slottedItemsByBlock.morning;
      keyDates: Note[];
    }> = [
      { block: 'morning', slotted: slottedItemsByBlock.morning, keyDates: keyDatesByBlock.morning },
      { block: 'day', slotted: slottedItemsByBlock.afternoon, keyDates: keyDatesByBlock.day },
      { block: 'evening', slotted: slottedItemsByBlock.evening, keyDates: keyDatesByBlock.evening },
    ];

    const result: Array<{
      block: TimeBlock;
      startIso: string;
      endIso: string;
      durationMinutes: number;
    }> = [];

    for (const { block, slotted, keyDates } of blockEntries) {
      const cap = capacity.blocks[block];
      const blockStartMins = cap.startHour * 60;
      const blockEndMins = cap.endHour * 60;

      // Collect all occupied intervals as [startMin, endMin]
      const occupied: Array<[number, number]> = [];

      for (const kd of keyDates) {
        if (!kd.event_time) continue;
        const [h, m] = kd.event_time.split(':').map(Number);
        const startMin = h * 60 + m;
        let endMin = startMin + 30; // default 30 min
        if (kd.end_time) {
          const [eh, em] = kd.end_time.split(':').map(Number);
          endMin = eh * 60 + em;
        }
        occupied.push([Math.max(startMin, blockStartMins), Math.min(endMin, blockEndMins)]);
      }

      for (const s of slotted) {
        const d = new Date(s.scheduled_start_iso);
        const startMin = d.getHours() * 60 + d.getMinutes();
        const est = (s as any).time_estimate_minutes ?? 15;
        const endMin = startMin + est;
        occupied.push([Math.max(startMin, blockStartMins), Math.min(endMin, blockEndMins)]);
      }

      // Sort by start
      occupied.sort((a, b) => a[0] - b[0]);

      // Walk and find free gaps
      let cursor = blockStartMins;
      for (const [oStart, oEnd] of occupied) {
        if (oStart > cursor) {
          const gapMins = oStart - cursor;
          if (gapMins >= MIN_GAP_MINUTES) {
            const startIso = new Date(`${today}T00:00:00`);
            startIso.setHours(Math.floor(cursor / 60), cursor % 60, 0, 0);
            const endIso = new Date(`${today}T00:00:00`);
            endIso.setHours(Math.floor(oStart / 60), oStart % 60, 0, 0);
            result.push({
              block,
              startIso: startIso.toISOString(),
              endIso: endIso.toISOString(),
              durationMinutes: gapMins,
            });
          }
        }
        cursor = Math.max(cursor, oEnd);
      }
      // Trailing gap
      if (cursor < blockEndMins) {
        const gapMins = blockEndMins - cursor;
        if (gapMins >= MIN_GAP_MINUTES) {
          const startIso = new Date(`${today}T00:00:00`);
          startIso.setHours(Math.floor(cursor / 60), cursor % 60, 0, 0);
          const endIso = new Date(`${today}T00:00:00`);
          endIso.setHours(Math.floor(blockEndMins / 60), blockEndMins % 60, 0, 0);
          result.push({
            block,
            startIso: startIso.toISOString(),
            endIso: endIso.toISOString(),
            durationMinutes: gapMins,
          });
        }
      }
    }

    return result;
  }, [capacity, slottedItemsByBlock, keyDatesByBlock, today]);

  const blockAvailability = useMemo(
    () => ({
      morning: capacity.blocks.morning.availableMinutes,
      day: capacity.blocks.day.availableMinutes,
      evening: capacity.blocks.evening.availableMinutes,
    }),
    [capacity],
  );

  // ─────────────────────────────────────────────────────────────────
  // TIME BLOCK PICKER STATE → TASK QUICK ACTION SHEET
  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  // EVENT QUICK ACTION STATE
  // ─────────────────────────────────────────────────────────────────
  const [quickActionEvent, setQuickActionEvent] = useState<Note | null>(null);

  const [quickActionTask, setQuickActionTask] = useState<TaskItemData | null>(null);
  const [quickActionIsSlotted, setQuickActionIsSlotted] = useState(false);
  // Organize feedback message
  const [organizeMessage, setOrganizeMessage] = useState<string | null>(null);
  const [organizeReasoning, setOrganizeReasoning] = useState<string[] | null>(null);
  const [showReasoningModal, setShowReasoningModal] = useState(false);
  // Animation state for card exit animations
  const [animatingAssignments, setAnimatingAssignments] = useState<Array<{
    taskId: string;
    block: string;
  }> | null>(null);

  // ─────────────────────────────────────────────────────────────────
  // PLANNING CARD COLLAPSE STATE
  // ─────────────────────────────────────────────────────────────────
  const [planningCardCollapsed, setPlanningCardCollapsed] = useState(false);
  const togglePlanningCard = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPlanningCardCollapsed((prev) => !prev);
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // TIME BLOCK COLLAPSE STATE
  // ─────────────────────────────────────────────────────────────────
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});
  const toggleBlockCollapse = useCallback((block: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedBlocks((prev) => ({ ...prev, [block]: !prev[block] }));
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // GAP SLOT PICKER STATE
  // ─────────────────────────────────────────────────────────────────
  const [gapSlotPickerVisible, setGapSlotPickerVisible] = useState(false);
  const [selectedGap, setSelectedGap] = useState<TimeGap | null>(null);
  const [selectedGapBlock, setSelectedGapBlock] = useState<'morning' | 'afternoon' | 'evening'>(
    'morning',
  );

  const handleGapSlotPress = useCallback(
    (gap: TimeGap, block: 'morning' | 'afternoon' | 'evening') => {
      setSelectedGap(gap);
      setSelectedGapBlock(block);
      setGapSlotPickerVisible(true);
    },
    [],
  );

  const handleGapSlotTask = useCallback(
    (taskId: string, taskType: 'todo' | 'habit', gapStartIso: string) => {
      slotTaskIntoGap(taskId, taskType, gapStartIso);
    },
    [slotTaskIntoGap],
  );

  const handleGapSlotPickerClose = useCallback(() => {
    setGapSlotPickerVisible(false);
    setSelectedGap(null);
  }, []);

  const handleSlottedTaskPress = useCallback(
    (task: SlottedTask) => {
      // Open quick action sheet instead of auto-unslotting
      const taskData = taskDataById[task.id];
      if (taskData) {
        setQuickActionTask(taskData);
        setQuickActionIsSlotted(true);
      }
    },
    [taskDataById],
  );

  // Tasks available to slot (unslotted, in the selected block)
  const tasksForGapPicker = useMemo(() => {
    const blockTasks =
      selectedGapBlock === 'morning'
        ? tasksByBlock.morning
        : selectedGapBlock === 'afternoon'
          ? tasksByBlock.afternoon
          : tasksByBlock.evening;
    // Also include flexible items
    return [...blockTasks, ...tasksByBlock.flexible].filter(
      (t) =>
        !slottedItemsByBlock.morning.some((s) => s.id === t.id) &&
        !slottedItemsByBlock.afternoon.some((s) => s.id === t.id) &&
        !slottedItemsByBlock.evening.some((s) => s.id === t.id),
    );
  }, [selectedGapBlock, tasksByBlock, slottedItemsByBlock]);

  // Summary fade-in animation
  const summaryOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (organizeMessage) {
      summaryOpacity.setValue(0);
      Animated.timing(summaryOpacity, {
        toValue: 1,
        duration: 400,
        delay: 200, // Wait for cards to settle
        useNativeDriver: true,
      }).start();
    }
  }, [organizeMessage, summaryOpacity]);

  const handleAnimationStart = useCallback(
    (assignments: Array<{ taskId: string; block: string }>) => {
      setAnimatingAssignments(assignments);
    },
    [],
  );

  const handleAnimationComplete = useCallback(() => {
    setAnimatingAssignments(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // EVENT QUICK ACTION HANDLERS
  // ─────────────────────────────────────────────────────────────────
  const handleEventQuickAction = useCallback((event: Note) => {
    setQuickActionEvent(event);
  }, []);

  const handleDismissEvent = useCallback((eventId: string) => {
    const now = new Date().toISOString();
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

      // Schedule the actual notification via shared helper
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
    (event: Note) => {
      setQuickActionEvent(null);
      overlayController.openEdit({
        record: { id: event.id, type: 'note' } as any,
      });
    },
    [overlayController],
  );

  const handleTaskPress = useCallback((task: TaskItemData) => {
    setQuickActionTask(task);
    setQuickActionIsSlotted(false);
  }, []);

  const handleQuickActionClose = useCallback(() => {
    setQuickActionTask(null);
    setQuickActionIsSlotted(false);
  }, []);

  // Capacity gate handlers
  const handleToggleSelect = useCallback(
    (task: TaskItemData) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      toggleBriefSelection(task.id);
    },
    [toggleBriefSelection],
  );

  const handleToggleLock = useCallback(
    (task: TaskItemData) => {
      toggleBriefLock(task.id);
    },
    [toggleBriefLock],
  );

  const handleAssignPress = useCallback((task: TaskItemData) => {
    setQuickActionTask(task);
    setQuickActionIsSlotted(false);
  }, []);

  const handleAssign = useCallback(
    async (
      taskId: string,
      taskType: 'todo' | 'habit',
      timeWindow: TimeBlock | 'any',
      lockIn: boolean,
    ) => {
      const currentTask =
        taskType === 'todo'
          ? todayTodos.find((t) => t.id === taskId)
          : todayHabits.find((h) => h.id === taskId);

      if (!currentTask) return;

      const wasLockedIn =
        taskType === 'todo'
          ? (currentTask as (typeof todos)[0]).commitment === true
          : isHabitLockedIn(currentTask as (typeof habits)[0]);

      // Update time_window
      if (taskType === 'todo') {
        await updateTodo(taskId, { time_window: timeWindow });
      } else {
        await updateHabit(taskId, { time_window: timeWindow });
      }

      // Handle lock-in changes
      if (lockIn && !wasLockedIn) {
        await addCommitment(taskId, taskType);
      } else if (!lockIn && wasLockedIn) {
        await removeCommitment(taskId, taskType);
      }

      // When prioritizing and assigning to a time block, auto-select
      if (isPrioritizing && timeWindow !== 'any' && !briefSelectedSet.has(taskId)) {
        toggleBriefSelection(taskId);
      }
    },
    [
      todayTodos,
      todayHabits,
      updateTodo,
      updateHabit,
      addCommitment,
      removeCommitment,
      isPrioritizing,
      briefSelectedSet,
      toggleBriefSelection,
    ],
  );

  // ─────────────────────────────────────────────────────────────────
  // TASK QUICK ACTION SHEET HANDLERS
  // ─────────────────────────────────────────────────────────────────

  const handleQuickActionNotToday = useCallback(
    (taskId: string) => {
      hideForToday(taskId, isTomorrow ? today : undefined);
    },
    [hideForToday, isTomorrow, today],
  );

  const handleQuickActionUnschedule = useCallback(
    (taskId: string, taskType: 'todo' | 'habit') => {
      unslotTask(taskId, taskType);
    },
    [unslotTask],
  );

  const handleQuickActionToggleLock = useCallback(
    async (taskId: string, taskType: 'todo' | 'habit', lockIn: boolean) => {
      if (lockIn) {
        await addCommitment(taskId, taskType);
      } else {
        await removeCommitment(taskId, taskType);
      }
    },
    [addCommitment, removeCommitment],
  );

  const handleQuickActionAssignSlot = useCallback(
    (taskId: string, taskType: 'todo' | 'habit', startIso: string, _block: TimeBlock) => {
      slotTaskIntoGap(taskId, taskType, startIso);
    },
    [slotTaskIntoGap],
  );

  const handleQuickActionRemind = useCallback(
    async (taskId: string) => {
      try {
        const taskTitle = quickActionTask?.title ?? 'your task';
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Reminder',
            body: `Don't forget: ${taskTitle}`,
            data: { type: 'task_reminder', taskId },
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 30 * 60, // 30 minutes
          },
        });
        Alert.alert('Reminder set', "You'll be reminded in 30 minutes.");
      } catch {
        Alert.alert('Oops', 'Could not schedule reminder.');
      }
    },
    [quickActionTask],
  );

  const handleQuickActionOpenDetails = useCallback(
    (task: TaskItemData) => {
      setQuickActionTask(null);
      setQuickActionIsSlotted(false);
      overlayController.openEdit({
        record: { id: task.id, type: task.type } as any,
      });
    },
    [overlayController],
  );

  // ─────────────────────────────────────────────────────────────────
  // TIME ESTIMATE PICKER STATE
  // ─────────────────────────────────────────────────────────────────
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTask, setTimePickerTask] = useState<TaskItemData | null>(null);

  const handleTimePress = useCallback((task: TaskItemData) => {
    setTimePickerTask(task);
    setTimePickerVisible(true);
  }, []);

  const handleTimePickerClose = useCallback(() => {
    setTimePickerVisible(false);
    setTimePickerTask(null);
  }, []);

  const handleTimeSave = useCallback(
    async (taskId: string, taskType: 'todo' | 'habit', minutes: number | null) => {
      if (taskType === 'todo') {
        await updateTodo(taskId, { time_estimate_minutes: minutes });
      } else {
        await updateHabit(taskId, { time_estimate_minutes: minutes });
      }
    },
    [updateTodo, updateHabit],
  );

  // ─────────────────────────────────────────────────────────────────
  // QUICK ADD MODAL (layered on top of Morning Brief)
  // ─────────────────────────────────────────────────────────────────
  const [isQuickAddVisible, setQuickAddVisible] = useState(false);

  const handleAddPress = useCallback(() => {
    setQuickAddVisible(true);
  }, []);

  const handleQuickAddClose = useCallback(() => {
    setQuickAddVisible(false);
  }, []);

  const handleQuickAddSubmit = useCallback(
    (text: string) => {
      setQuickAddVisible(false);
      onQuickAddSubmit?.(text);
    },
    [onQuickAddSubmit],
  );

  const handleQuickAddManual = useCallback(() => {
    setQuickAddVisible(false);
    onQuickAddManual?.();
  }, [onQuickAddManual]);

  // ─────────────────────────────────────────────────────────────────
  // COMPLETION
  // ─────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  const handleComplete = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      // Save parked items when capacity gate is active
      if (isPrioritizing) {
        setBriefParked(parkedTasks.map((t) => t.id));
      }

      await saveBrief({
        ...(isTomorrow && { date: today }),
        morning_sequence: tasksByBlock.morning.map((t) => ({ id: t.id, type: t.type })),
        day_sequence: tasksByBlock.afternoon.map((t) => ({ id: t.id, type: t.type })),
        evening_sequence: tasksByBlock.evening.map((t) => ({ id: t.id, type: t.type })),
      });

      setBriefCompletedToday(today);
      onComplete?.();
      onClose();
    } catch (error) {
      console.error('[MorningBrief] Error saving brief:', error);
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    saveBrief,
    tasksByBlock,
    onComplete,
    onClose,
    isTomorrow,
    today,
    isPrioritizing,
    setBriefParked,
    parkedTasks,
    setBriefCompletedToday,
  ]);

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header — always visible above the stepper */}
      <MorningBriefHeader
        targetDate={isTomorrow ? today : undefined}
        overrideAvailableMinutes={effectiveFreeMinutes}
      />

      <MorningBriefStepper
        stepsNeeded={stepsNeeded}
        renderGlance={(onContinue, onSkipToEnd) => (
          <StepGlance
            events={todayKeyDates}
            hiddenEventIds={hiddenEventIds}
            freeMinutes={totalActualFreeMinutes}
            eventCount={todayKeyDates.length}
            totalEventCount={capacity.totalEventCount}
            hasTasks={allDayTasks.length > 0}
            onEventQuickAction={handleEventQuickAction}
            onEventPress={onKeyDatePress}
            onContinue={onContinue}
            onSkipToEnd={onSkipToEnd}
          />
        )}
        renderSweep={(onContinue, onSkip) => (
          <StepSweep
            rolledOverTodos={rolledOverTodos}
            unscheduledTodos={unscheduledTodos}
            onContinue={() => {
              handleMiniSweepComplete();
              onContinue();
            }}
            onSkip={() => {
              handleMiniSweepSkip();
              onSkip();
            }}
          />
        )}
        renderPrioritize={(onContinue, onSkip) => (
          <StepPrioritize
            flexibleTasks={allDayTasks}
            isPrioritizing={isPrioritizing}
            selectedMinutes={selectedMinutes}
            totalAvailableMinutes={realisticCapacity}
            remainingMinutes={remainingMinutes}
            isOverCommitted={isOverCommitted}
            selectedIds={briefSelectedSet}
            lockedIds={briefLockedSet}
            onToggleSelect={handleToggleSelect}
            onToggleLock={handleToggleLock}
            onTaskPress={handleTaskPress}
            onTimePress={handleTimePress}
            onAddPress={handleAddPress}
            onAssignPress={handleAssignPress}
            pendingDrops={todayPendingDrops}
            animatingAssignments={animatingAssignments}
            onContinue={onContinue}
            onSkip={onSkip}
          />
        )}
        renderOrganize={(onContinue, onSkip) => (
          <StepOrganize
            targetDate={isTomorrow ? today : undefined}
            isPrioritizing={isPrioritizing}
            selectedIds={briefSelectedSet}
            lockedIds={briefLockedSet}
            isOverCapacity={remainingMinutes < 0}
            hasTasksToOrganize={
              briefSelectedSet.size > 0 ||
              tasksByBlock.morning.length > 0 ||
              tasksByBlock.afternoon.length > 0 ||
              tasksByBlock.evening.length > 0
            }
            onOrganizeComplete={(summary, reasoning) => {
              setOrganizeMessage(summary);
              if (reasoning && reasoning.length > 0) {
                setOrganizeReasoning(reasoning);
              } else {
                setOrganizeReasoning(null);
              }
              setTimeout(() => {
                setOrganizeMessage(null);
                setOrganizeReasoning(null);
              }, 30000);
            }}
            onOrganizeError={(error) => {
              setOrganizeMessage(error);
              setOrganizeReasoning(null);
              setTimeout(() => setOrganizeMessage(null), 30000);
            }}
            onAnimationStart={handleAnimationStart}
            onAnimationComplete={handleAnimationComplete}
            onSaveParked={() => {
              if (isPrioritizing) {
                setBriefParked(parkedTasks.map((t) => t.id));
              }
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setPlanningCardCollapsed(true);
            }}
            onContinue={onContinue}
            onSkip={onSkip}
          />
        )}
        renderPlan={() => (
          <StepPlan
            capacity={capacity}
            keyDatesByBlock={keyDatesByBlock}
            tasksByBlock={tasksByBlock}
            slottedItemsByBlock={slottedItemsByBlock}
            breakHabitsByBlock={breakHabitsByBlock}
            collapsedBlocks={collapsedBlocks}
            hiddenEventIds={hiddenEventIds}
            taskDataById={taskDataById}
            today={today}
            scheduleDayName={scheduleDayName}
            onToggleCollapse={toggleBlockCollapse}
            onTaskPress={handleTaskPress}
            onTimePress={handleTimePress}
            onSlottedTaskPress={handleSlottedTaskPress}
            onGapSlotPress={handleGapSlotPress}
            onKeyDatePress={onKeyDatePress}
            onEventQuickAction={handleEventQuickAction}
            onFreeMinutesCalculated={handleFreeMinutesCalculated}
            getSpaceName={getSpaceName}
            organizeMessage={organizeMessage}
            organizeReasoning={organizeReasoning}
            onShowReasoning={() => setShowReasoningModal(true)}
            onConfirm={handleComplete}
            isLoading={isSaving}
          />
        )}
      >
        {/* ─── Bottom sheets (rendered outside step animation) ─── */}

        {/* Reasoning Modal */}
        <Modal
          visible={showReasoningModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowReasoningModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowReasoningModal(false)}>
            <View style={styles.reasoningModal}>
              <Text style={styles.reasoningTitle}>Why this plan?</Text>
              <View style={styles.reasoningList}>
                {organizeReasoning?.map((reason, index) => (
                  <Text key={index} style={styles.reasoningItem}>
                    • {reason}
                  </Text>
                ))}
              </View>
              <Pressable
                style={styles.reasoningDismiss}
                onPress={() => setShowReasoningModal(false)}
              >
                <Text style={styles.reasoningDismissText}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        {/* Task Quick Action Sheet */}
        <TaskQuickActionSheet
          visible={!!quickActionTask}
          task={quickActionTask}
          isSlotted={quickActionIsSlotted}
          onClose={handleQuickActionClose}
          onAssignBlock={handleAssign}
          onAssignSlot={handleQuickActionAssignSlot}
          onUnschedule={handleQuickActionUnschedule}
          onNotToday={handleQuickActionNotToday}
          onToggleLock={handleQuickActionToggleLock}
          isLocked={(() => {
            if (!quickActionTask) return false;
            if (quickActionTask.type === 'todo') {
              const todo = todos.find((t) => t.id === quickActionTask.id);
              return todo?.commitment === true;
            }
            if (quickActionTask.type === 'habit') {
              const habit = habits.find((h) => h.id === quickActionTask.id);
              return habit ? isHabitLockedIn(habit) : false;
            }
            return false;
          })()}
          targetDate={isTomorrow ? today : undefined}
          gaps={allGaps}
          blockAvailability={blockAvailability}
          onRemind={handleQuickActionRemind}
          onOpenDetails={handleQuickActionOpenDetails}
        />

        {/* Gap Slot Picker */}
        <GapSlotPicker
          visible={gapSlotPickerVisible}
          gap={selectedGap}
          availableTasks={tasksForGapPicker}
          onClose={handleGapSlotPickerClose}
          onSlotTask={handleGapSlotTask}
        />

        {/* Time Estimate Picker */}
        <TimeEstimatePicker
          visible={timePickerVisible}
          taskId={timePickerTask?.id ?? null}
          taskType={timePickerTask?.type ?? null}
          taskTitle={timePickerTask?.title ?? null}
          currentEstimate={timePickerTask?.estimatedMinutes ?? null}
          onClose={handleTimePickerClose}
          onSave={handleTimeSave}
        />

        {/* Quick Add Modal */}
        <NowQuickAddModal
          visible={isQuickAddVisible}
          onClose={handleQuickAddClose}
          onSubmit={handleQuickAddSubmit}
          onPressManualAdd={handleQuickAddManual}
        />

        {/* Global Event Popup */}
        <GlobalEventPopup />

        {/* Global Event Time Picker */}
        <GlobalEventTimePicker />

        {/* Event Quick Action Sheet */}
        <EventQuickActionSheet
          visible={!!quickActionEvent}
          event={quickActionEvent}
          onClose={() => setQuickActionEvent(null)}
          onDismiss={handleDismissEvent}
          onEditTime={handleEditEventTime}
          onAddPrepNote={handleAddPrepNote}
          onLinkTodo={(_eventId) => {
            setQuickActionEvent(null);
          }}
          onRemind={handleEventRemind}
          onOpenFull={handleOpenFullEvent}
        />
      </MorningBriefStepper>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.linenCream,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  /* ─── Planning Card ─── */
  planningCard: {
    backgroundColor: '#FEFDFB',
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 24,
    paddingTop: 0,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
    overflow: 'hidden',
  },
  planningCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    paddingHorizontal: 16,
    paddingTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planningCardDescription: {
    fontSize: 12,
    color: '#999999',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 10,
  },
  planningCardDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginHorizontal: 16,
    marginBottom: 4,
  },
  planningCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  planningCardTextBlock: {
    flex: 1,
  },
  planningCardHeadline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    lineHeight: 18,
  },
  planningCardHeadlineOver: {
    color: '#C27A6B',
  },
  planningCardSubline: {
    fontSize: 12,
    color: '#888888',
    lineHeight: 16,
    marginTop: 1,
  },
  planningCardSublineOver: {
    color: '#C27A6B',
  },
  planningCardAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F9F6F1',
  },
  planningCardAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2E5540',
    marginLeft: 4,
  },
  planningCardSummary: {
    fontSize: 12,
    color: '#888888',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  missingEstimateHint: {
    fontSize: 11.5,
    color: '#C9956C',
    fontStyle: 'italic',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
    fontFamily: 'Inter-Regular',
  },
  /* ─── Schedule Header ─── */
  scheduleHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginLeft: 36,
    marginBottom: 8,
    marginTop: 4,
  },
  /* ─── Timeline ─── */
  timelineBreakHabit: {
    paddingLeft: 16,
  },
  blockDivider: {
    height: 3,
    backgroundColor: '#E5E5E5',
    marginVertical: 16,
    marginHorizontal: 16,
  },
  alldaySection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  alldayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    gap: 6,
  },
  alldayBar: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    marginRight: 4,
  },
  alldayLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#8B7E74',
  },
  alldayEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  alldayEventTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0E1116',
    flex: 1,
  },
  quickActionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  sectionDivider: {
    height: 2,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  organizeMessage: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  organizeFeedback: {
    marginHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  reasoningLink: {
    fontSize: 13,
    color: '#2E5540',
    textDecorationLine: 'underline',
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  reasoningModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  reasoningTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  reasoningList: {
    marginBottom: 16,
  },
  reasoningItem: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 22,
    marginBottom: 8,
  },
  reasoningDismiss: {
    backgroundColor: '#2E5540',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  reasoningDismissText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MorningBriefSheet;
