/**
 * CalendarScreen - Full calendar view with day selection
 * Shows calendar events and tasks grouped by time block
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Circle,
  Repeat,
  Sunrise,
  Sun,
  Sunset,
  Clock,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { CalendarMonthPicker } from '../../components/calendar/CalendarMonthPicker';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useUnifiedOverlayController } from '../../hooks/useUnifiedOverlayController';
import { useMorningBrief } from '../../lib/today/hooks/useMorningBrief';
import { getDateService } from '../../lib/date';
import {
  getTimeBlockForHour,
  inferTimeWindow,
  timeWindowToBlock,
  type TimeBlock,
} from '../../lib/now/timeBlockHelpers';
import { type EventTimeOverride } from '../../lib/capacity';
import type { CalendarEvent } from '../../lib/calendar/CalendarClient';
import type { Todo, Habit } from '../../lib/types';

// Brand colors
const COLORS = {
  linenCream: '#F9F6F1',
  mossGreen: '#2E5540',
  charcoalInk: '#0E1116',
  inkMuted: '#666666',
  divider: '#E8E6E1',
  sectionDivider: '#D5D2CC',
};

// Section config with icons
const SECTION_CONFIG: Record<TimeBlock, { label: string; color: string; Icon: LucideIcon }> = {
  allday: { label: 'ALL DAY', color: '#999999', Icon: Calendar },
  morning: { label: 'MORNING', color: '#D4A574', Icon: Sunrise },
  afternoon: { label: 'AFTERNOON', color: '#C9956C', Icon: Sun },
  evening: { label: 'EVENING', color: '#A89BC9', Icon: Sunset },
  anytime: { label: 'ANY TIME', color: '#999999', Icon: Clock },
};

// Stable empty object to prevent re-renders
const EMPTY_TIME_OVERRIDES: Record<string, EventTimeOverride> = {};

// ═════════════════════════════════════════════════════════════════════════════
// ROW COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

interface CalendarEventRowProps {
  event: CalendarEvent;
  onPress?: () => void;
  isLast?: boolean;
  timeOverride?: { startAt: string; endAt: string };
}

function CalendarEventRow({ event, onPress, isLast, timeOverride }: CalendarEventRowProps) {
  // Format time range
  const timeDisplay = useMemo(() => {
    if (event.isAllDay) return 'All day';

    // Use override times if available
    const start = timeOverride ? new Date(timeOverride.startAt) : new Date(event.startAt);
    const end = timeOverride ? new Date(timeOverride.endAt) : new Date(event.endAt);

    const startStr = start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const endStr = end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${startStr} - ${endStr}`;
  }, [event.isAllDay, event.startAt, event.endAt, timeOverride]);

  // Calculate duration
  const duration = useMemo(() => {
    if (event.isAllDay) return null;

    // Use override times if available
    const start = timeOverride ? new Date(timeOverride.startAt) : new Date(event.startAt);
    const end = timeOverride ? new Date(timeOverride.endAt) : new Date(event.endAt);

    const mins = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hrs} hr ${remainingMins} min` : `${hrs} hr`;
  }, [event.isAllDay, event.startAt, event.endAt, timeOverride]);

  return (
    <Pressable
      style={[sectionStyles.eventRow, !isLast && sectionStyles.rowBorder]}
      onPress={onPress}
    >
      <Calendar size={16} color={COLORS.inkMuted} style={sectionStyles.eventIcon} />
      <View style={sectionStyles.eventContent}>
        <View style={sectionStyles.eventHeader}>
          <Text style={sectionStyles.eventTime}>{timeDisplay}</Text>
          {duration && <Text style={sectionStyles.eventDuration}>({duration})</Text>}
        </View>
        <Text style={sectionStyles.eventTitle} numberOfLines={1}>
          {event.title}
        </Text>
        {event.location && (
          <Text style={sectionStyles.eventLocation} numberOfLines={1}>
            {event.location}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

interface CalendarTodoRowProps {
  todo: Todo;
  onPress: () => void;
  isLast?: boolean;
}

function CalendarTodoRow({ todo, onPress, isLast }: CalendarTodoRowProps) {
  return (
    <Pressable
      style={[sectionStyles.itemRow, !isLast && sectionStyles.rowBorder]}
      onPress={onPress}
    >
      <Circle size={14} color="#999999" style={sectionStyles.itemIcon} />
      <Text style={sectionStyles.itemTitle} numberOfLines={1}>
        {todo.name}
      </Text>
    </Pressable>
  );
}

interface CalendarHabitRowProps {
  habit: Habit;
  onPress: () => void;
  isLast?: boolean;
}

function CalendarHabitRow({ habit, onPress, isLast }: CalendarHabitRowProps) {
  return (
    <Pressable
      style={[sectionStyles.itemRow, !isLast && sectionStyles.rowBorder]}
      onPress={onPress}
    >
      <Repeat size={14} color="#6B8F71" style={sectionStyles.itemIcon} />
      <Text style={sectionStyles.itemTitle} numberOfLines={1}>
        {habit.name}
      </Text>
    </Pressable>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

interface CalendarScreenSectionProps {
  title: string;
  block: TimeBlock;
  events: CalendarEvent[];
  todos: Todo[];
  habits: Habit[];
  onPressTodo: (todo: Todo) => void;
  onPressHabit: (habit: Habit) => void;
  onPressEvent: (event: CalendarEvent) => void;
  eventTimeOverrides: Record<string, EventTimeOverride>;
}

function CalendarScreenSection({
  title,
  block,
  events,
  todos,
  habits,
  onPressTodo,
  onPressHabit,
  onPressEvent,
  eventTimeOverrides,
}: CalendarScreenSectionProps) {
  const isEmpty = events.length === 0 && todos.length === 0 && habits.length === 0;
  if (isEmpty) return null;

  const { label, color, Icon } = SECTION_CONFIG[block];

  return (
    <View style={sectionStyles.section}>
      <View style={sectionStyles.sectionHeaderRow}>
        <View style={[sectionStyles.sectionHeaderAccent, { backgroundColor: color }]} />
        <Icon size={16} color={color} style={sectionStyles.sectionIcon} />
        <Text style={[sectionStyles.sectionHeader, { color }]}>{label}</Text>
      </View>

      {/* Calendar events */}
      {events.map((event, idx) => {
        const eventId = `${event.provider}-${event.providerEventId}`;
        const override = eventTimeOverrides[eventId];

        return (
          <CalendarEventRow
            key={event.id}
            event={event}
            onPress={() => onPressEvent(event)}
            isLast={idx === events.length - 1 && todos.length === 0 && habits.length === 0}
            timeOverride={override}
          />
        );
      })}

      {/* Todos */}
      {todos.map((todo, idx) => (
        <CalendarTodoRow
          key={todo.id}
          todo={todo}
          onPress={() => onPressTodo(todo)}
          isLast={idx === todos.length - 1 && habits.length === 0}
        />
      ))}

      {/* Habits */}
      {habits.map((habit, idx) => (
        <CalendarHabitRow
          key={habit.id}
          habit={habit}
          onPress={() => onPressHabit(habit)}
          isLast={idx === habits.length - 1}
        />
      ))}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  section: {
    paddingTop: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderAccent: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    marginRight: 10,
  },
  sectionIcon: {
    marginRight: 6,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
  },
  rowTitleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  rowSubtitle: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginTop: 2,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9CA6E0',
    marginRight: 12,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  eventIcon: {
    marginTop: 2,
    marginRight: 12,
  },
  eventContent: {
    flex: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  eventTime: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.inkMuted,
  },
  eventDuration: {
    fontSize: 12,
    color: COLORS.inkMuted,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
  },
  eventLocation: {
    fontSize: 13,
    color: COLORS.inkMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: COLORS.mossGreen,
  },
  // Item row styles (todos/habits)
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemIcon: {
    marginRight: 12,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.charcoalInk,
  },
  itemTitleCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.inkMuted,
  },
  checkboxPressable: {
    padding: 4,
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const dateService = getDateService();
  const overlayController = useUnifiedOverlayController();

  // Selected date state - starts with today
  const [selectedDate, setSelectedDate] = useState(() => dateService.getCurrentDate());
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [isCompletedExpanded, setCompletedExpanded] = useState(false);

  const handlePreviousDay = useCallback(() => {
    setSelectedDate((prev) => dateService.addDays(prev, -1));
  }, [dateService]);

  const handleNextDay = useCallback(() => {
    setSelectedDate((prev) => dateService.addDays(prev, 1));
  }, [dateService]);

  // Format date for display: "January 21, 2026"
  const formattedDate = useMemo(() => {
    // Use date service to avoid timezone issues - selectedDate is YYYY-MM-DD
    return dateService.formatDateForDisplay(selectedDate);
  }, [selectedDate, dateService]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING FOR SELECTED DATE
  // ═══════════════════════════════════════════════════════════════════════════

  // Calendar events for selected date
  const calendarEventsMap = useGremlyStore((s) => s.calendarEvents);
  const calendarConnections = useGremlyStore((s) => s.calendarConnections);
  const hasCalendarConnected = calendarConnections.some((c) => c.isConnected);
  const openEventPopup = useGremlyStore((s) => s.openEventPopup);
  const eventTimeOverrides = useGremlyStore((s) => s.eventTimeOverrides) ?? EMPTY_TIME_OVERRIDES;
  const calendarEvents = useMemo(
    () => calendarEventsMap[selectedDate] ?? [],
    [calendarEventsMap, selectedDate],
  );

  // Todos for selected date (due_day matches)
  const todos = useGremlyStore((s) => s.todos);
  const todosForDate = useMemo(() => {
    return todos.filter((t) => !t.archived && t.due_day === selectedDate);
  }, [todos, selectedDate]);

  // Habits that are active on selected date
  const habits = useGremlyStore((s) => s.habits);
  const habitProgress = useGremlyStore((s) => s.habitProgress);

  const habitsForDate = useMemo(() => {
    // Filter habits that should appear on this date based on their cadence
    // For now, include all non-archived habits (refine with cadence logic later)
    return habits.filter((h) => {
      if (h.archived) return false;
      // TODO: Check cadence/frequency to see if habit applies to selectedDate
      return true;
    });
  }, [habits]);

  // Completed items for selected date
  const completedTodos = useMemo(() => {
    return todos.filter((t) => t.completed_at && t.completed_at.startsWith(selectedDate));
  }, [todos, selectedDate]);

  // Summary counts
  const summary = useMemo(
    () => ({
      events: calendarEvents.length,
      todos: todosForDate.filter((t) => !t.completed_at).length,
      habits: habitsForDate.length,
      completed: completedTodos.length,
    }),
    [calendarEvents, todosForDate, habitsForDate, completedTodos],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // MORNING BRIEF DATA (for matching Today's Focus time blocks)
  // ═══════════════════════════════════════════════════════════════════════════

  const { brief } = useMorningBrief();
  const today = dateService.getCurrentDate();
  const isToday = selectedDate === today;

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP ITEMS BY TIME BLOCK
  // ═══════════════════════════════════════════════════════════════════════════

  const groupedData = useMemo(() => {
    const blocks: Record<
      TimeBlock,
      {
        events: CalendarEvent[];
        todos: Todo[];
        habits: Habit[];
      }
    > = {
      allday: { events: [], todos: [], habits: [] },
      morning: { events: [], todos: [], habits: [] },
      afternoon: { events: [], todos: [], habits: [] },
      evening: { events: [], todos: [], habits: [] },
      anytime: { events: [], todos: [], habits: [] },
    };

    // Build sets of IDs from brief sequences (for O(1) lookup)
    const morningIds = new Set(brief?.morning_sequence?.map((s) => s.id) || []);
    const dayIds = new Set(brief?.day_sequence?.map((s) => s.id) || []);
    const eveningIds = new Set(brief?.evening_sequence?.map((s) => s.id) || []);

    // Group calendar events by start time
    for (const event of calendarEvents) {
      const startDate = new Date(event.startAt);
      const hour = startDate.getHours();
      const block = getTimeBlockForHour(hour);
      blocks[block].events.push(event);
    }

    // Group todos - check brief sequences first (today only), then fallback to inferTimeWindow
    for (const todo of todosForDate) {
      if (todo.completed_at) continue; // Skip completed

      let block: TimeBlock;

      // Priority 1: Brief sequences (today only) - matches Today's Focus behavior
      if (selectedDate === today && brief) {
        if (morningIds.has(todo.id)) {
          block = 'morning';
        } else if (dayIds.has(todo.id)) {
          block = 'afternoon';
        } else if (eveningIds.has(todo.id)) {
          block = 'evening';
        } else {
          // Priority 2: Fallback to inferTimeWindow
          const timeWindow = inferTimeWindow({
            name: todo.name,
            timeWindow: todo.time_window,
            dueTime: todo.due_time,
          });
          block = timeWindowToBlock(timeWindow);
        }
      } else {
        // Not today - only use inferTimeWindow
        const timeWindow = inferTimeWindow({
          name: todo.name,
          timeWindow: todo.time_window,
          dueTime: todo.due_time,
        });
        block = timeWindowToBlock(timeWindow);
      }

      blocks[block].todos.push(todo);
    }

    // Group habits - same pattern: brief sequences first, then inferTimeWindow
    for (const habit of habitsForDate) {
      let block: TimeBlock;

      // Priority 1: Brief sequences (today only)
      if (selectedDate === today && brief) {
        if (morningIds.has(habit.id)) {
          block = 'morning';
        } else if (dayIds.has(habit.id)) {
          block = 'afternoon';
        } else if (eveningIds.has(habit.id)) {
          block = 'evening';
        } else {
          // Priority 2: Fallback to inferTimeWindow
          const timeWindow = inferTimeWindow({
            name: habit.name,
            timeWindow: habit.time_window,
          });
          block = timeWindowToBlock(timeWindow);
        }
      } else {
        // Not today - only use inferTimeWindow
        const timeWindow = inferTimeWindow({
          name: habit.name,
          timeWindow: habit.time_window,
        });
        block = timeWindowToBlock(timeWindow);
      }

      blocks[block].habits.push(habit);
    }

    return blocks;
  }, [calendarEvents, todosForDate, habitsForDate, selectedDate, today, brief]);

  // Helper to check if block has any content
  const blockHasContent = useCallback(
    (block: TimeBlock) => {
      const data = groupedData[block];
      return data.events.length > 0 || data.todos.length > 0 || data.habits.length > 0;
    },
    [groupedData],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETED ITEMS WITH UNDO
  // ═══════════════════════════════════════════════════════════════════════════

  const completedItems = useMemo(() => {
    const completed: Array<{
      id: string;
      name: string;
      type: 'todo' | 'habit';
      completedAt: string;
    }> = [];

    // Completed todos
    for (const todo of todos) {
      if (todo.completed_at?.startsWith(selectedDate)) {
        completed.push({
          id: todo.id,
          name: todo.name,
          type: 'todo',
          completedAt: todo.completed_at,
        });
      }
    }

    // Completed habits
    for (const progress of habitProgress) {
      if (progress.occurred_day === selectedDate) {
        const habit = habits.find((h) => h.id === progress.habit_id);
        if (habit) {
          completed.push({
            id: habit.id,
            name: habit.name,
            type: 'habit',
            completedAt: progress.occurred_at || progress.occurred_day,
          });
        }
      }
    }

    // Sort by completion time, most recent first
    return completed.sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
    );
  }, [todos, habits, habitProgress, selectedDate]);

  // Undo handlers
  const uncompleteTodo = useGremlyStore((s) => s.uncompleteTodo);
  const uncompleteHabit = useGremlyStore((s) => s.uncompleteHabit);

  const handleUndo = useCallback(
    (item: (typeof completedItems)[0]) => {
      if (item.type === 'todo') {
        uncompleteTodo(item.id);
      } else {
        uncompleteHabit(item.id);
      }
    },
    [uncompleteTodo, uncompleteHabit],
  );

  // Handle item press - open overlay
  const handlePressTodo = useCallback(
    (todo: Todo) => {
      overlayController.openEdit({
        record: { id: todo.id, type: 'todo' } as any,
      });
    },
    [overlayController],
  );

  const handlePressHabit = useCallback(
    (habit: Habit) => {
      overlayController.openEdit({
        record: { id: habit.id, type: 'habit' } as any,
      });
    },
    [overlayController],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeButton}>
          <X size={24} color={COLORS.charcoalInk} />
        </Pressable>

        <Pressable onPress={handlePreviousDay} style={styles.headerButton}>
          <ChevronLeft size={20} color={COLORS.inkMuted} />
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{formattedDate}</Text>
          {isToday && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>Today</Text>
            </View>
          )}
          <Pressable onPress={() => setDatePickerVisible(true)} style={styles.calendarButton}>
            <Calendar size={18} color={COLORS.mossGreen} />
          </Pressable>
        </View>

        <Pressable onPress={handleNextDay} style={styles.headerButton}>
          <ChevronRight size={20} color={COLORS.inkMuted} />
        </Pressable>
      </View>

      {/* Summary */}
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryText}>
          {summary.events} event{summary.events !== 1 ? 's' : ''}
          {' · '}
          {summary.todos} todo{summary.todos !== 1 ? 's' : ''}
          {' · '}
          {summary.habits} habit{summary.habits !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Time block sections */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Morning */}
        {blockHasContent('morning') && (
          <CalendarScreenSection
            title="MORNING"
            block="morning"
            events={groupedData.morning.events}
            todos={groupedData.morning.todos}
            habits={groupedData.morning.habits}
            onPressTodo={handlePressTodo}
            onPressHabit={handlePressHabit}
            onPressEvent={(event) => openEventPopup(event, selectedDate)}
            eventTimeOverrides={eventTimeOverrides}
          />
        )}

        {/* Afternoon */}
        {blockHasContent('afternoon') && (
          <CalendarScreenSection
            title="AFTERNOON"
            block="afternoon"
            events={groupedData.afternoon.events}
            todos={groupedData.afternoon.todos}
            habits={groupedData.afternoon.habits}
            onPressTodo={handlePressTodo}
            onPressHabit={handlePressHabit}
            onPressEvent={(event) => openEventPopup(event, selectedDate)}
            eventTimeOverrides={eventTimeOverrides}
          />
        )}

        {/* Evening */}
        {blockHasContent('evening') && (
          <CalendarScreenSection
            title="EVENING"
            block="evening"
            events={groupedData.evening.events}
            todos={groupedData.evening.todos}
            habits={groupedData.evening.habits}
            onPressTodo={handlePressTodo}
            onPressHabit={handlePressHabit}
            onPressEvent={(event) => openEventPopup(event, selectedDate)}
            eventTimeOverrides={eventTimeOverrides}
          />
        )}

        {/* Any Time */}
        {blockHasContent('anytime') && (
          <CalendarScreenSection
            title="ANY TIME"
            block="anytime"
            events={groupedData.anytime.events}
            todos={groupedData.anytime.todos}
            habits={groupedData.anytime.habits}
            onPressTodo={handlePressTodo}
            onPressHabit={handlePressHabit}
            onPressEvent={(event) => openEventPopup(event, selectedDate)}
            eventTimeOverrides={eventTimeOverrides}
          />
        )}

        {/* Empty state */}
        {!blockHasContent('morning') &&
          !blockHasContent('afternoon') &&
          !blockHasContent('evening') &&
          !blockHasContent('anytime') &&
          completedItems.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🌿</Text>
              <Text style={styles.emptyTitle}>Nothing scheduled</Text>
              <Text style={styles.emptySubtext}>Enjoy the open day</Text>
              {!hasCalendarConnected && (
                <Pressable
                  style={styles.connectCalendarChip}
                  onPress={() => navigation.navigate('Settings' as never)}
                >
                  <Calendar size={14} color={COLORS.mossGreen} />
                  <Text style={styles.connectCalendarChipText}>Connect Calendar</Text>
                </Pressable>
              )}
            </View>
          )}

        {/* Completed section */}
        {completedItems.length > 0 && (
          <View style={styles.completedSection}>
            <Pressable
              style={styles.completedHeader}
              onPress={() => setCompletedExpanded(!isCompletedExpanded)}
            >
              <Text style={styles.completedHeaderText}>✓ Completed ({completedItems.length})</Text>
              {isCompletedExpanded ? (
                <ChevronUp size={20} color={COLORS.inkMuted} />
              ) : (
                <ChevronDown size={20} color={COLORS.inkMuted} />
              )}
            </Pressable>

            {isCompletedExpanded && (
              <View style={styles.completedList}>
                {completedItems.map((item) => (
                  <View key={`${item.type}-${item.id}`} style={styles.completedRow}>
                    <Text style={styles.completedItemText} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Pressable onPress={() => handleUndo(item)} style={styles.undoButton}>
                      <RotateCcw size={16} color={COLORS.mossGreen} />
                      <Text style={styles.undoText}>Undo</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Bottom padding */}
        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      {/* Date picker modal */}
      <CalendarMonthPicker
        visible={isDatePickerVisible}
        selectedDate={selectedDate}
        onSelectDate={(date) => setSelectedDate(date)}
        onClose={() => setDatePickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F6F1',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  closeButton: {
    padding: 8,
  },
  headerButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.charcoalInk,
  },
  todayBadge: {
    backgroundColor: '#6B8F71',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  todayBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  calendarButton: {
    padding: 4,
  },
  summaryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.sectionDivider,
  },
  summaryText: {
    fontSize: 14,
    color: COLORS.inkMuted,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.charcoalInk,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.inkMuted,
  },
  connectCalendarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#E8F0EB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.mossGreen,
  },
  connectCalendarChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.mossGreen,
  },
  completedSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.sectionDivider,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  completedHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.inkMuted,
  },
  completedList: {
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  completedItemText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.inkMuted,
    textDecorationLine: 'line-through',
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  undoText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.mossGreen,
  },
});
