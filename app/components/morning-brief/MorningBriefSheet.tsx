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
import { View, Modal, StyleSheet, ScrollView, Text, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldOff, Calendar, MoreHorizontal } from 'lucide-react-native';
import { BreakHabitCard } from '../../../components/now/BreakHabitCard';
import { BRAND } from '../../../design/brand';
import { useGremlyStore, isHabitLockedIn } from '../../../lib/store/useGremlyStore';
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
import { NowQuickAddModal } from '../../../components/now/NowQuickAddModal';
import { GlobalEventPopup } from '../../../components/calendar/GlobalEventPopup';
import EventQuickActionSheet from '../../../components/now/EventQuickActionSheet';
import { GlobalEventTimePicker } from '../../../components/calendar/GlobalEventTimePicker';
import {
  MorningBriefHeader,
  MorningBriefFooter,
  TimeBlockSection,
  TimeBlockPicker,
  OnYourPlateSection,
  TimeEstimatePicker,
  OrganizeButton,
  TaskItem,
  type TaskItemData,
} from './components';
import { LockInPicker } from './components/LockInPicker';
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

export function MorningBriefSheet({
  onClose,
  onComplete,
  onQuickAddSubmit,
  onQuickAddManual,
  onKeyDatePress,
  targetDate,
}: MorningBriefSheetProps) {
  const insets = useSafeAreaInsets();
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

      return {
        id: todo.id,
        type: 'todo',
        title: todo.name || 'Untitled',
        estimatedMinutes: todo.time_estimate_minutes ?? undefined,
        isLockedIn: todo.commitment === true,
        timeWindow: (todo.time_window as TaskItemData['timeWindow']) ?? null,
        metadata,
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

      return {
        id: habit.id,
        type: 'habit',
        title: habit.name || 'Untitled',
        estimatedMinutes: habit.time_estimate_minutes ?? undefined,
        isLockedIn: isHabitLockedIn(habit),
        timeWindow: (habit.time_window as TaskItemData['timeWindow']) ?? null,
        metadata,
      };
    },
    [habitCompletedToday, habitLastCompletion, habitRolling7, habitRolling30, today],
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
          flexible.push(task);
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
            flexible.push(task);
        }
      }
    });

    return {
      tasksByBlock: { morning, afternoon, evening, flexible },
      breakHabitsByBlock: breakNames,
    };
  }, [todayTodos, todayHabits, transformTodo, transformHabit]);

  // Calculate total task minutes for Gremly summary
  const totalTaskMinutes = useMemo(() => {
    const allTasks = [
      ...tasksByBlock.morning,
      ...tasksByBlock.afternoon,
      ...tasksByBlock.evening,
      ...tasksByBlock.flexible,
    ];
    return allTasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0);
  }, [tasksByBlock]);

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
    return map;
  }, [tasksByBlock]);

  // ─────────────────────────────────────────────────────────────────
  // TIME BLOCK PICKER STATE
  // ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────
  // EVENT QUICK ACTION STATE
  // ─────────────────────────────────────────────────────────────────
  const [quickActionEvent, setQuickActionEvent] = useState<Note | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItemData | null>(null);
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
  // LOCK-IN PICKER STATE
  // ─────────────────────────────────────────────────────────────────
  const [lockInPickerVisible, setLockInPickerVisible] = useState(false);
  const [hasLockedThisSession, setHasLockedThisSession] = useState(false);

  // Items eligible for lock-in: all non-locked items across all blocks
  const lockInEligibleItems = useMemo(() => {
    const allItems = [
      ...tasksByBlock.morning,
      ...tasksByBlock.afternoon,
      ...tasksByBlock.evening,
      ...tasksByBlock.flexible,
    ];
    return allItems.filter((item) => !item.isLockedIn);
  }, [tasksByBlock]);

  // Show lock-in button if: not already locked this session AND at least 2 eligible items
  const showLockInButton = !hasLockedThisSession && lockInEligibleItems.length >= 2;

  const handleLockInPress = useCallback(() => {
    setLockInPickerVisible(true);
  }, []);

  const handleLockInConfirm = useCallback(
    async (selected: Array<{ id: string; type: 'todo' | 'habit' }>) => {
      for (const item of selected) {
        await addCommitment(item.id, item.type);
      }
      setHasLockedThisSession(true);
    },
    [addCommitment],
  );

  const handleLockInPickerClose = useCallback(() => {
    setLockInPickerVisible(false);
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
      // Unslot the task when tapped
      unslotTask(task.id, task.type);
    },
    [unslotTask],
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

  const handleEventRemind = useCallback(async (eventId: string, minutesBefore: number) => {
    // Uses the same scheduleEventReminder as NowScreenV1
    setQuickActionEvent(null);
  }, []);

  const handleOpenFullEvent = useCallback(
    (event: Note) => {
      setQuickActionEvent(null);
      onKeyDatePress?.(event);
    },
    [onKeyDatePress],
  );

  const handleTaskPress = useCallback((task: TaskItemData) => {
    setSelectedTask(task);
    setPickerVisible(true);
  }, []);

  const handlePickerClose = useCallback(() => {
    setPickerVisible(false);
    setSelectedTask(null);
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
    },
    [todayTodos, todayHabits, updateTodo, updateHabit, addCommitment, removeCommitment],
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
      await saveBrief({
        ...(isTomorrow && { date: today }),
        morning_sequence: tasksByBlock.morning.map((t) => ({ id: t.id, type: t.type })),
        day_sequence: tasksByBlock.afternoon.map((t) => ({ id: t.id, type: t.type })),
        evening_sequence: tasksByBlock.evening.map((t) => ({ id: t.id, type: t.type })),
      });

      onComplete?.();
      onClose();
    } catch (error) {
      console.error('[MorningBrief] Error saving brief:', error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, saveBrief, tasksByBlock, onComplete, onClose, isTomorrow, today]);

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {showMiniSweep ? (
        <MiniSweepGate
          rolledOverTodos={rolledOverTodos}
          unscheduledTodos={unscheduledTodos}
          onComplete={handleMiniSweepComplete}
          onSkip={handleMiniSweepSkip}
        />
      ) : (
        <>
          {/* Header */}
          <MorningBriefHeader targetDate={isTomorrow ? today : undefined} />

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* On Your Plate - Flexible/Unassigned Tasks */}
            <OnYourPlateSection
              tasks={tasksByBlock.flexible}
              animatingAssignments={animatingAssignments}
              onTaskPress={handleTaskPress}
              onTimePress={handleTimePress}
              onAddPress={handleAddPress}
              pendingDrops={todayPendingDrops}
            />

            {/* Help Me Organize Button */}
            <OrganizeButton
              targetDate={isTomorrow ? today : undefined}
              onComplete={(summary, reasoning) => {
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
              onError={(error) => {
                setOrganizeMessage(error);
                setOrganizeReasoning(null);
                setTimeout(() => setOrganizeMessage(null), 30000);
              }}
              onAnimationStart={handleAnimationStart}
              onAnimationComplete={handleAnimationComplete}
            />

            {organizeMessage && (
              <Animated.View style={[styles.organizeFeedback, { opacity: summaryOpacity }]}>
                <Text style={styles.organizeMessage}>{organizeMessage}</Text>
                {organizeReasoning && organizeReasoning.length > 0 && (
                  <Pressable onPress={() => setShowReasoningModal(true)}>
                    <Text style={styles.reasoningLink}>Why this plan?</Text>
                  </Pressable>
                )}
              </Animated.View>
            )}

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

            {/* Thick divider between On Your Plate and Time Blocks */}
            <View style={styles.sectionDivider} />

            {/* All Day - key date events + break habit awareness card */}
            {(breakHabitsByBlock.allday.length > 0 || keyDatesByBlock.allday.length > 0) && (
              <>
                <View style={styles.alldaySection}>
                  <View style={styles.alldayHeader}>
                    <View style={[styles.alldayBar, { backgroundColor: '#8B7E74' }]} />
                    <ShieldOff size={16} color="#8B7E74" />
                    <Text style={styles.alldayLabel}>ALL DAY</Text>
                  </View>

                  {/* All-day key date events */}
                  {keyDatesByBlock.allday.map((keyDate) => (
                    <Pressable
                      key={keyDate.id}
                      style={styles.alldayEventRow}
                      onPress={() => onKeyDatePress?.(keyDate)}
                    >
                      <Calendar size={14} color="#999999" style={{ marginRight: 10 }} />
                      <Text style={styles.alldayEventTitle} numberOfLines={1}>
                        {keyDate.title || 'Untitled Event'}
                      </Text>
                      <Pressable
                        style={styles.quickActionButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleEventQuickAction(keyDate);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MoreHorizontal size={16} color="#CCCCCC" />
                      </Pressable>
                    </Pressable>
                  ))}

                  {breakHabitsByBlock.allday.length > 0 && (
                    <BreakHabitCard names={breakHabitsByBlock.allday} />
                  )}
                </View>
                <View style={styles.blockDivider} />
              </>
            )}

            {/* Time Blocks */}
            <TimeBlockSection
              capacity={capacity.blocks.morning}
              events={[]}
              keyDateEvents={keyDatesByBlock.morning}
              getSpaceName={getSpaceName}
              onKeyDatePress={onKeyDatePress}
              onKeyDateQuickAction={handleEventQuickAction}
              tasks={tasksByBlock.morning}
              onTaskPress={handleTaskPress}
              onTimePress={handleTimePress}
              hiddenEventIds={hiddenEventIds}
              dateContext={today}
              slottedItems={slottedItemsByBlock.morning}
              onGapSlotPress={(gap) => handleGapSlotPress(gap, 'morning')}
              onSlottedTaskPress={handleSlottedTaskPress}
              taskDataById={taskDataById}
            />
            {breakHabitsByBlock.morning.length > 0 && (
              <BreakHabitCard names={breakHabitsByBlock.morning} />
            )}

            <View style={styles.blockDivider} />

            <TimeBlockSection
              capacity={capacity.blocks.day}
              events={[]}
              keyDateEvents={keyDatesByBlock.day}
              getSpaceName={getSpaceName}
              onKeyDatePress={onKeyDatePress}
              onKeyDateQuickAction={handleEventQuickAction}
              tasks={tasksByBlock.afternoon}
              onTaskPress={handleTaskPress}
              onTimePress={handleTimePress}
              hiddenEventIds={hiddenEventIds}
              dateContext={today}
              slottedItems={slottedItemsByBlock.afternoon}
              onGapSlotPress={(gap) => handleGapSlotPress(gap, 'afternoon')}
              onSlottedTaskPress={handleSlottedTaskPress}
              taskDataById={taskDataById}
            />
            {breakHabitsByBlock.afternoon.length > 0 && (
              <BreakHabitCard names={breakHabitsByBlock.afternoon} />
            )}

            <View style={styles.blockDivider} />

            <TimeBlockSection
              capacity={capacity.blocks.evening}
              events={[]}
              keyDateEvents={keyDatesByBlock.evening}
              getSpaceName={getSpaceName}
              onKeyDatePress={onKeyDatePress}
              onKeyDateQuickAction={handleEventQuickAction}
              tasks={tasksByBlock.evening}
              onTaskPress={handleTaskPress}
              onTimePress={handleTimePress}
              hiddenEventIds={hiddenEventIds}
              dateContext={today}
              slottedItems={slottedItemsByBlock.evening}
              onGapSlotPress={(gap) => handleGapSlotPress(gap, 'evening')}
              onSlottedTaskPress={handleSlottedTaskPress}
              taskDataById={taskDataById}
            />
            {breakHabitsByBlock.evening.length > 0 && (
              <BreakHabitCard names={breakHabitsByBlock.evening} />
            )}
          </ScrollView>

          {/* Footer */}
          <MorningBriefFooter
            onComplete={handleComplete}
            isLoading={isSaving}
            showLockIn={showLockInButton}
            onLockInPress={handleLockInPress}
          />

          {/* Time Block Picker */}
          <TimeBlockPicker
            visible={pickerVisible}
            task={selectedTask}
            onClose={handlePickerClose}
            onAssign={handleAssign}
            targetDate={isTomorrow ? today : undefined}
          />

          {/* Lock-In Picker */}
          <LockInPicker
            visible={lockInPickerVisible}
            items={lockInEligibleItems}
            onClose={handleLockInPickerClose}
            onConfirm={handleLockInConfirm}
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

          {/* Quick Add Modal - renders on top of Morning Brief */}
          {/* Quick-add items use dueDayOverride via useNowQuickAdd → useMindDropSubmit pipeline */}
          <NowQuickAddModal
            visible={isQuickAddVisible}
            onClose={handleQuickAddClose}
            onSubmit={handleQuickAddSubmit}
            onPressManualAdd={handleQuickAddManual}
          />

          {/* Global Event Popup - must be inside MorningBriefSheet Modal to appear on top */}
          <GlobalEventPopup />

          {/* Global Event Time Picker - must be inside MorningBriefSheet Modal to appear on top */}
          <GlobalEventTimePicker />

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
            }}
            onRemind={handleEventRemind}
            onOpenFull={handleOpenFullEvent}
          />
        </>
      )}
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
