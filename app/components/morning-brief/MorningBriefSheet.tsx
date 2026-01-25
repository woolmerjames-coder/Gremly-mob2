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

import React, { useState, useCallback, useMemo } from 'react';
import { View, Modal, StyleSheet, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../../design/brand';
import { useGremlyStore, isHabitLockedIn } from '../../../lib/store/useGremlyStore';
import { useMiniSweepGate } from '../../../lib/today/hooks/useMiniSweepGate';
import { getDateService } from '../../../lib/date';
import { useTodayCapacity, useTodayCalendarEvents } from '../../../lib/store/capacitySelectors';
import { getTimeBlockBoundaries } from '../../../lib/capacity';
import type { TimeBlock, TimeBlockPreferences } from '../../../lib/capacity';
import type { CalendarEvent } from '../../../lib/calendar/CalendarClient';
import { MiniSweepGate } from './MiniSweepGate';
import {
  MorningBriefHeader,
  MorningBriefFooter,
  TimeBlockSection,
  TimeBlockPicker,
  OnYourPlateSection,
  TimeEstimatePicker,
  OrganizeButton,
  type TaskItemData,
} from './components';

interface MorningBriefSheetProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: () => void;
  onQuickAdd?: () => void;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  return getDateService().getCurrentDate();
}

/**
 * Filter calendar events that overlap with a specific time block
 */
function getEventsForBlock(
  events: CalendarEvent[],
  block: TimeBlock,
  currentDate: string,
  timeBlockPreferences: TimeBlockPreferences,
): CalendarEvent[] {
  const boundaries = getTimeBlockBoundaries(timeBlockPreferences);
  const boundary = boundaries[block];
  const [year, month, day] = currentDate.split('-').map(Number);
  const blockStart = new Date(year, month - 1, day, boundary.startHour, 0, 0);
  const blockEnd = new Date(year, month - 1, day, boundary.endHour, 0, 0);

  return events.filter((event) => {
    if (event.isAllDay) return false;
    const eventStart = new Date(event.startAt);
    const eventEnd = new Date(event.endAt);
    // Check for overlap
    return eventStart < blockEnd && eventEnd > blockStart;
  });
}

export function MorningBriefSheet({ visible, onClose, onComplete, onQuickAdd }: MorningBriefSheetProps) {
  const insets = useSafeAreaInsets();
  const today = getTodayDateString();

  // ─────────────────────────────────────────────────────────────────
  // ZUSTAND STATE & ACTIONS
  // ─────────────────────────────────────────────────────────────────
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);
  const updateTodo = useGremlyStore((s) => s.updateTodo);
  const updateHabit = useGremlyStore((s) => s.updateHabit);
  const addCommitment = useGremlyStore((s) => s.addCommitment);
  const removeCommitment = useGremlyStore((s) => s.removeCommitment);
  const saveBrief = useGremlyStore((s) => s.saveBrief);

  // ─────────────────────────────────────────────────────────────────
  // CAPACITY & CALENDAR DATA
  // ─────────────────────────────────────────────────────────────────
  const capacity = useTodayCapacity();
  const calendarEvents = useTodayCalendarEvents();

  // ─────────────────────────────────────────────────────────────────
  // MINI SWEEP GATE
  // ─────────────────────────────────────────────────────────────────
  const { shouldShowMiniSweep, rolledOverTodos, unscheduledTodos, markMiniSweepCompleted } =
    useMiniSweepGate();

  const [miniSweepDismissed, setMiniSweepDismissed] = useState(false);
  const showMiniSweep = shouldShowMiniSweep && !miniSweepDismissed;

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
  const hideCalendarEvent = useGremlyStore((s) => s.hideCalendarEvent);

  const handleHideEvent = useCallback(
    (eventId: string) => {
      hideCalendarEvent(today, eventId);
    },
    [hideCalendarEvent, today],
  );

  // ─────────────────────────────────────────────────────────────────
  // TASK DATA TRANSFORMATION
  // ─────────────────────────────────────────────────────────────────

  // Get todos due today
  const todayTodos = useMemo(() => {
    return todos.filter((t) => !t.archived && !t.completed_at && t.due_day === today);
  }, [todos, today]);

  // Get habits due today (simplified - daily habits with start_date <= today)
  const todayHabits = useMemo(() => {
    return habits.filter((h) => {
      if (h.archived) return false;
      if (!h.start_date || h.start_date > today) return false;
      if (h.end_date && h.end_date < today) return false;
      // For now, include all active habits
      return true;
    });
  }, [habits, today]);

  // Transform to TaskItemData
  const transformTodo = useCallback(
    (todo: (typeof todos)[0]): TaskItemData => ({
      id: todo.id,
      type: 'todo',
      title: todo.name || 'Untitled',
      estimatedMinutes: todo.time_estimate_minutes ?? undefined,
      isLockedIn: todo.commitment === true,
      timeWindow: (todo.time_window as TaskItemData['timeWindow']) ?? null,
    }),
    [],
  );

  const transformHabit = useCallback(
    (habit: (typeof habits)[0]): TaskItemData => ({
      id: habit.id,
      type: 'habit',
      title: habit.name || 'Untitled',
      estimatedMinutes: habit.time_estimate_minutes ?? undefined,
      isLockedIn: isHabitLockedIn(habit),
      timeWindow: (habit.time_window as TaskItemData['timeWindow']) ?? null,
    }),
    [],
  );

  // Group tasks by time block
  const tasksByBlock = useMemo(() => {
    const morning: TaskItemData[] = [];
    const afternoon: TaskItemData[] = [];
    const evening: TaskItemData[] = [];
    const flexible: TaskItemData[] = [];

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
    });

    return { morning, afternoon, evening, flexible };
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

  // ─────────────────────────────────────────────────────────────────
  // TIME BLOCK PICKER STATE
  // ─────────────────────────────────────────────────────────────────
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItemData | null>(null);
  // Organize feedback message
  const [organizeMessage, setOrganizeMessage] = useState<string | null>(null);
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
  // ADD TASK
  // ─────────────────────────────────────────────────────────────────
  const handleAddPress = useCallback(() => {
    onQuickAdd?.();
  }, [onQuickAdd]);

  // ─────────────────────────────────────────────────────────────────
  // COMPLETION
  // ─────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  const handleComplete = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      await saveBrief({
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
  }, [isSaving, saveBrief, tasksByBlock, onComplete, onClose]);

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
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
            <MorningBriefHeader />

            {/* Organize Button */}
            <OrganizeButton
              onComplete={(summary) => {
                setOrganizeMessage(summary);
                // Clear after 4 seconds
                setTimeout(() => setOrganizeMessage(null), 4000);
              }}
              onError={(error) => {
                setOrganizeMessage(error);
                setTimeout(() => setOrganizeMessage(null), 4000);
              }}
            />

            {organizeMessage && (
              <Text style={styles.organizeMessage}>{organizeMessage}</Text>
            )}

            {/* Scrollable Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Time Blocks */}
              <TimeBlockSection
                capacity={capacity.blocks.morning}
                events={getEventsForBlock(calendarEvents, 'morning', today, timeBlockPreferences)}
                tasks={tasksByBlock.morning}
                onTaskPress={handleTaskPress}
                onTimePress={handleTimePress}
                onHideEvent={handleHideEvent}
                hiddenEventIds={hiddenEventIds}
              />

              <View style={styles.blockDivider} />

              <TimeBlockSection
                capacity={capacity.blocks.day}
                events={getEventsForBlock(calendarEvents, 'day', today, timeBlockPreferences)}
                tasks={tasksByBlock.afternoon}
                onTaskPress={handleTaskPress}
                onTimePress={handleTimePress}
                onHideEvent={handleHideEvent}
                hiddenEventIds={hiddenEventIds}
              />

              <View style={styles.blockDivider} />

              <TimeBlockSection
                capacity={capacity.blocks.evening}
                events={getEventsForBlock(calendarEvents, 'evening', today, timeBlockPreferences)}
                tasks={tasksByBlock.evening}
                onTaskPress={handleTaskPress}
                onTimePress={handleTimePress}
                onHideEvent={handleHideEvent}
                hiddenEventIds={hiddenEventIds}
              />

              <View style={styles.blockDivider} />

              {/* On Your Plate */}
              <OnYourPlateSection
                tasks={tasksByBlock.flexible}
                onTaskPress={handleTaskPress}
                onTimePress={handleTimePress}
                onAddPress={handleAddPress}
              />
            </ScrollView>

            {/* Footer */}
            <MorningBriefFooter onComplete={handleComplete} isLoading={isSaving} />

            {/* Time Block Picker */}
            <TimeBlockPicker
              visible={pickerVisible}
              task={selectedTask}
              onClose={handlePickerClose}
              onAssign={handleAssign}
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
          </>
        )}
      </View>
    </Modal>
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
  organizeMessage: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    fontStyle: 'italic',
  },
});

export default MorningBriefSheet;
