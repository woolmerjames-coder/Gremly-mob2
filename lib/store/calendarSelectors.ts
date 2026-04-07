/**
 * Calendar Selectors
 *
 * Provides data for the Calendar view in Hub.
 * Returns todos, habits, and journals for a given date.
 */

import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date';
import type { Todo, Habit, Note, Space } from '../types';
import type { CalendarEvent } from '../calendar/CalendarClient';
import {
  getEventsForDate,
  type CalendarItem as ServiceCalendarItem,
} from '../calendar/CalendarService';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type CalendarItemType = 'todo' | 'habit' | 'journal' | 'calendar_event';

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  title: string;
  time: string | null; // HH:mm or null
  endTime?: string | null; // For calendar events with duration
  isCompleted: boolean;
  isOverdue: boolean;
  isExternal?: boolean; // True for calendar events
  provider?: 'outlook' | 'google' | 'ics';
  location?: string | null;
  space: {
    id: string;
    name: string;
    theme: string | null;
  } | null;
  milestone: {
    id: string;
    name: string;
    progress: { done: number; total: number };
  } | null;
  tags: string[];
  raw: Todo | Habit | Note | CalendarEvent; // Original record for overlay (Note for synced event notes)
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Check if habit occurs on a given date
// ═══════════════════════════════════════════════════════════════════

function habitOccursOnDate(habit: Habit, dateStr: string): boolean {
  const dateService = getDateService();

  // Must have started
  if (habit.start_date && habit.start_date > dateStr) {
    return false;
  }

  // Must not have ended
  if (habit.end_date && habit.end_date < dateStr) {
    return false;
  }

  // Must not be archived
  if (habit.archived) {
    return false;
  }

  const cadence = habit.cadence || 'daily';
  const targetDate = dateService.fromLocalDate(dateStr);
  if (!targetDate) return false;

  const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Check days_active if specified (integer array: 0=Sunday, 1=Monday, etc.)
  if (habit.days_active && habit.days_active.length > 0) {
    return habit.days_active.includes(dayOfWeek);
  }

  // Default behavior based on cadence
  switch (cadence) {
    case 'daily':
      return true;
    case 'weekly':
      // Show on the same day of week as start_date, or Monday if no start_date
      if (habit.start_date) {
        const startDate = dateService.fromLocalDate(habit.start_date);
        if (startDate) {
          return startDate.getDay() === dayOfWeek;
        }
      }
      return dayOfWeek === 1; // Monday
    case 'monthly':
      // Show on the same day of month as start_date, or 1st if no start_date
      if (habit.start_date) {
        const startDate = dateService.fromLocalDate(habit.start_date);
        if (startDate) {
          return startDate.getDate() === targetDate.getDate();
        }
      }
      return targetDate.getDate() === 1;
    default:
      return true;
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Get space info for an item
// ═══════════════════════════════════════════════════════════════════

function getSpaceInfo(spaceId: string | null | undefined, spaces: Space[]): CalendarItem['space'] {
  if (!spaceId) return null;
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return null;
  return {
    id: space.id,
    name: space.name,
    theme: space.theme || null,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SELECTOR: Get all items for a date
// ═══════════════════════════════════════════════════════════════════

export function useCalendarItemsForDate(dateStr: string): CalendarItem[] {
  const dateService = getDateService();
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const notes = useGremlyStore((s) => s.notes);
  const spaces = useGremlyStore((s) => s.spaces);
  // Subscribe to calendarEvents and userCalendarEvents for reactivity —
  // CalendarService reads imperatively, but these subscriptions ensure the
  // hook re-runs when the underlying data changes.
  useGremlyStore((s) => s.calendarEvents[dateStr]);
  useGremlyStore((s) => s.userCalendarEvents);

  const items: CalendarItem[] = [];

  // ─────────────────────────────────────────────────────────────────
  // TODOS: due on this date OR completed on this date
  // ─────────────────────────────────────────────────────────────────
  todos.forEach((todo) => {
    if (todo.archived) return;

    const isDueOnDate = todo.due_day === dateStr;
    const isCompletedOnDate =
      todo.completed_at && dateService.toLocalDate(new Date(todo.completed_at)) === dateStr;

    if (!isDueOnDate && !isCompletedOnDate) return;

    const isCompleted = !!todo.completed_at;
    const isOverdue = !isCompleted && todo.due_day ? dateService.isPast(todo.due_day) : false;

    items.push({
      id: todo.id,
      type: 'todo',
      title: todo.name || todo.title || 'Untitled',
      time: todo.due_time || null,
      isCompleted,
      isOverdue,
      space: getSpaceInfo(todo.space_id, spaces),
      milestone: null, // TODO: Add milestone lookup if needed
      tags: todo.tags || [],
      raw: todo,
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // HABITS: scheduled for this date based on frequency
  // ─────────────────────────────────────────────────────────────────
  habits.forEach((habit) => {
    if (!habitOccursOnDate(habit, dateStr)) return;

    // Check if completed on this date
    const isCompleted =
      habit.last_completed_at &&
      dateService.toLocalDate(new Date(habit.last_completed_at)) === dateStr;

    items.push({
      id: habit.id,
      type: 'habit',
      title: habit.name || 'Untitled Habit',
      time: null, // Habits don't have specific times (yet)
      isCompleted: !!isCompleted,
      isOverdue: false, // Habits don't have "overdue" concept
      space: getSpaceInfo(habit.space_id, spaces),
      milestone: null,
      tags: habit.tags || [],
      raw: habit,
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // JOURNALS: created on this date
  // ─────────────────────────────────────────────────────────────────
  notes.forEach((note) => {
    if (note.archived) return;

    // Only show journals (subtype='journal' or canonicalType='log' with journal subtype)
    // Cast to string to handle type mismatch - journal may come from canonicalType='log'
    const isJournal =
      (note.subtype as string) === 'journal' ||
      (note.canonicalType === 'log' && (note.subtype as string) === 'journal');
    if (!isJournal) return;

    // Use note.date if available, otherwise created_at
    const noteDate = note.date || dateService.toLocalDate(new Date(note.created_at));
    if (noteDate !== dateStr) return;

    items.push({
      id: note.id,
      type: 'journal',
      title: note.title || 'Journal Entry',
      time: null,
      isCompleted: false,
      isOverdue: false,
      space: getSpaceInfo(note.space_id, spaces),
      milestone: null,
      tags: note.tags || [],
      raw: note,
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // EVENTS: merged via CalendarService (synced calendar, event notes,
  // user calendar events — deduplicated and sorted)
  // ─────────────────────────────────────────────────────────────────
  const serviceEvents = getEventsForDate(dateStr);
  serviceEvents.forEach((svcItem) => {
    // Map CalendarService's CalendarItem to this selector's CalendarItem shape
    const isExternal =
      svcItem.source === 'synced' ||
      (svcItem.source === 'gremly_event' && svcItem.provider !== 'gremly');

    // Try to find the original Note/CalendarEvent for the raw field
    let raw: Todo | Habit | Note | CalendarEvent;
    if (svcItem.source === 'gremly_event') {
      raw = notes.find((n) => n.id === svcItem.originalId) as Note;
    } else if (svcItem.source === 'synced') {
      const syncedEvents = useGremlyStore.getState().calendarEvents[dateStr] ?? [];
      raw = syncedEvents.find((e) => e.providerEventId === svcItem.originalId) as CalendarEvent;
    } else if (svcItem.source === 'user_calendar') {
      raw = useGremlyStore
        .getState()
        .userCalendarEvents.find((e) => e.id === svcItem.originalId) as any;
    } else {
      raw = {} as any;
    }

    items.push({
      id: svcItem.id,
      type: 'calendar_event',
      title: svcItem.title,
      time: svcItem.startTime || null,
      endTime: svcItem.endTime || null,
      isCompleted: false,
      isOverdue: false,
      isExternal,
      provider: svcItem.provider as 'outlook' | 'google' | 'ics' | undefined,
      location: svcItem.location || null,
      space:
        svcItem.source === 'gremly_event' ? getSpaceInfo((raw as Note)?.space_id, spaces) : null,
      milestone: null,
      tags: svcItem.source === 'gremly_event' ? (raw as Note)?.tags || [] : [],
      raw,
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // SORT: By time (timed items first), then by type
  // ─────────────────────────────────────────────────────────────────
  items.sort((a, b) => {
    // All-day calendar events at the very top
    const aIsAllDayEvent = a.type === 'calendar_event' && !a.time;
    const bIsAllDayEvent = b.type === 'calendar_event' && !b.time;
    if (aIsAllDayEvent && !bIsAllDayEvent) return -1;
    if (!aIsAllDayEvent && bIsAllDayEvent) return 1;

    // Timed items next, sorted by time
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    if (a.time && b.time) return a.time.localeCompare(b.time);

    // Then by type: calendar_event, todo, habit, journal
    const typeOrder = { calendar_event: 0, todo: 1, habit: 2, journal: 3 };
    return typeOrder[a.type] - typeOrder[b.type];
  });

  return items;
}

// ═══════════════════════════════════════════════════════════════════
// SELECTOR: Get dates with items in a range (for WeekStrip dots)
// ═══════════════════════════════════════════════════════════════════

export function useDatesWithItems(startDate: string, endDate: string): Set<string> {
  const dateService = getDateService();
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  const notes = useGremlyStore((s) => s.notes);

  const datesWithItems = new Set<string>();

  // Check each date in range
  let current = startDate;
  while (current <= endDate) {
    // Check todos
    const hasTodo = todos.some(
      (t) =>
        !t.archived &&
        (t.due_day === current ||
          (t.completed_at && dateService.toLocalDate(new Date(t.completed_at)) === current)),
    );

    // Check habits (simplified - just check if any active habit exists)
    const hasHabit = habits.some((h) => habitOccursOnDate(h, current));

    // Check journals
    const hasJournal = notes.some((n) => {
      if (n.archived) return false;
      // Check for journal subtype (note.subtype may be 'journal' or canonicalType='log')
      const isJournal =
        (n.subtype as string) === 'journal' ||
        (n.canonicalType === 'log' && (n.subtype as string) === 'journal');
      if (!isJournal) return false;
      const noteDate = n.date || dateService.toLocalDate(new Date(n.created_at));
      return noteDate === current;
    });

    // Check event notes
    const hasEvent = notes.some((n) => {
      if (n.archived) return false;
      if ((n.subtype as string) !== 'event') return false;
      return n.target_date === current;
    });

    if (hasTodo || hasHabit || hasJournal || hasEvent) {
      datesWithItems.add(current);
    }

    current = dateService.addDays(current, 1);
  }

  return datesWithItems;
}
