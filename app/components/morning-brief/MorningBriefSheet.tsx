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
import { BRAND } from '../../../design/brand';
import { useGremlyStore, isHabitLockedIn } from '../../../lib/store/useGremlyStore';
import { useMiniSweepGate } from '../../../lib/today/hooks/useMiniSweepGate';
import { getDateService } from '../../../lib/date';
import { useTodayCapacity, useTodayCalendarEvents } from '../../../lib/store/capacitySelectors';
import { useTodayPendingDrops, useEventsForDate } from '../../../lib/store/selectors';
import { getTimeBlockBoundaries } from '../../../lib/capacity';
import { getTimeBlockForHour } from '../../../lib/now/timeBlockHelpers';
import type { Note } from '../../../lib/types';
import type { TimeBlock, TimeBlockPreferences } from '../../../lib/capacity';
import type { CalendarEvent } from '../../../lib/calendar/CalendarClient';
import { MiniSweepGate } from './MiniSweepGate';
import { NowQuickAddModal } from '../../../components/now/NowQuickAddModal';
import { GlobalEventPopup } from '../../../components/calendar/GlobalEventPopup';
import { GlobalEventTimePicker } from '../../../components/calendar/GlobalEventTimePicker';
import {
  MorningBriefHeader,
  MorningBriefFooter,
  TimeBlockSection,
  TimeBlockPicker,
  OnYourPlateSection,
  TodaysKeyDatesSection,
  TimeEstimatePicker,
  OrganizeButton,
  type TaskItemData,
} from './components';

interface MorningBriefSheetProps {
  visible: boolean;
  onClose: () => void;
  onComplete?: () => void;
  /** Handler for quick add text submission */
  onQuickAddSubmit?: (text: string) => void;
  /** Handler for 'Prefer to add manually' */
  onQuickAddManual?: () => void;
  /** Handler for when a Key Date event is pressed */
  onKeyDatePress?: (event: Note) => void;
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
type KeyDateTimeBlock = 'morning' | 'day' | 'evening' | 'flexible';

function groupKeyDatesByTimeBlock(keyDates: Note[]): Record<KeyDateTimeBlock, Note[]> {
  const grouped: Record<KeyDateTimeBlock, Note[]> = {
    morning: [],
    day: [],
    evening: [],
    flexible: [],
  };

  for (const event of keyDates) {
    if (event.event_time) {
      // Parse HH:mm time string to get hour
      const [hourStr] = event.event_time.split(':');
      const hour = parseInt(hourStr, 10);
      if (!isNaN(hour)) {
        const block = getTimeBlockForHour(hour);
        // Map 'afternoon' -> 'day' and 'anytime' -> 'flexible'
        if (block === 'afternoon') {
          grouped.day.push(event);
        } else if (block === 'morning') {
          grouped.morning.push(event);
        } else if (block === 'evening') {
          grouped.evening.push(event);
        } else {
          grouped.flexible.push(event);
        }
      } else {
        grouped.flexible.push(event);
      }
    } else {
      // No event_time - goes to flexible (On Your Plate)
      grouped.flexible.push(event);
    }
  }

  return grouped;
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

export function MorningBriefSheet({
  visible,
  onClose,
  onComplete,
  onQuickAddSubmit,
  onQuickAddManual,
  onKeyDatePress,
}: MorningBriefSheetProps) {
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

  // ─────────────────────────────────────────────────────────────────
  // HIDDEN TODAY (Not Today - todos/habits hidden for the day)
  // ─────────────────────────────────────────────────────────────────
  const hiddenTodayIds = useGremlyStore((s) => s.hiddenTodayIds);

  // ─────────────────────────────────────────────────────────────────
  // TASK DATA TRANSFORMATION
  // ─────────────────────────────────────────────────────────────────

  // Get todos due today (excluding hidden ones)
  const todayTodos = useMemo(() => {
    return todos.filter(
      (t) =>
        !t.archived && !t.completed_at && t.due_day === today && !hiddenTodayIds.includes(t.id),
    );
  }, [todos, today, hiddenTodayIds]);

  // Get habits due today (excluding hidden ones)
  const todayHabits = useMemo(() => {
    return habits.filter((h) => {
      if (h.archived) return false;
      if (!h.start_date || h.start_date > today) return false;
      if (h.end_date && h.end_date < today) return false;
      if (hiddenTodayIds.includes(h.id)) return false;
      // For now, include all active habits
      return true;
    });
  }, [habits, today, hiddenTodayIds]);

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

  // Pending drops from store - shows loading cards while pipeline runs
  const todayPendingDrops = useTodayPendingDrops();

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
  const [organizeReasoning, setOrganizeReasoning] = useState<string[] | null>(null);
  const [showReasoningModal, setShowReasoningModal] = useState(false);
  // Animation state for card exit animations
  const [animatingAssignments, setAnimatingAssignments] = useState<Array<{
    taskId: string;
    block: string;
  }> | null>(null);

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

            {/* Scrollable Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Today's Key Dates - informational anchors for the day */}
              <TodaysKeyDatesSection
                keyDates={keyDatesByBlock.flexible}
                getSpaceName={getSpaceName}
                onKeyDatePress={onKeyDatePress}
              />

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

              {/* Time Blocks */}
              <TimeBlockSection
                capacity={capacity.blocks.morning}
                events={getEventsForBlock(calendarEvents, 'morning', today, timeBlockPreferences)}
                keyDateEvents={keyDatesByBlock.morning}
                getSpaceName={getSpaceName}
                onKeyDatePress={onKeyDatePress}
                tasks={tasksByBlock.morning}
                onTaskPress={handleTaskPress}
                onTimePress={handleTimePress}
                hiddenEventIds={hiddenEventIds}
                dateContext={today}
              />

              <View style={styles.blockDivider} />

              <TimeBlockSection
                capacity={capacity.blocks.day}
                events={getEventsForBlock(calendarEvents, 'day', today, timeBlockPreferences)}
                keyDateEvents={keyDatesByBlock.day}
                getSpaceName={getSpaceName}
                onKeyDatePress={onKeyDatePress}
                tasks={tasksByBlock.afternoon}
                onTaskPress={handleTaskPress}
                onTimePress={handleTimePress}
                hiddenEventIds={hiddenEventIds}
                dateContext={today}
              />

              <View style={styles.blockDivider} />

              <TimeBlockSection
                capacity={capacity.blocks.evening}
                events={getEventsForBlock(calendarEvents, 'evening', today, timeBlockPreferences)}
                keyDateEvents={keyDatesByBlock.evening}
                getSpaceName={getSpaceName}
                onKeyDatePress={onKeyDatePress}
                tasks={tasksByBlock.evening}
                onTaskPress={handleTaskPress}
                onTimePress={handleTimePress}
                hiddenEventIds={hiddenEventIds}
                dateContext={today}
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

            {/* Quick Add Modal - renders on top of Morning Brief */}
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
