/**
 * Calendar Selectors
 *
 * Provides data for the Calendar view in Hub.
 * Returns todos, habits, and journals for a given date.
 */

import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date';
import type { Todo, Habit, Note, Space } from '../types';

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type CalendarItemType = 'todo' | 'habit' | 'journal';

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  title: string;
  time: string | null; // HH:mm or null
  isCompleted: boolean;
  isOverdue: boolean;
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
  raw: Todo | Habit | Note; // Original record for overlay
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
  const targetDate = dateService.fromDateString(dateStr);
  if (!targetDate) return false;

  const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];

  // Check days_active if specified
  if (habit.days_active && habit.days_active.length > 0) {
    // days_active contains day names like ['monday', 'wednesday', 'friday']
    const activeDaysLower = habit.days_active.map((d) => d.toLowerCase());
    return activeDaysLower.includes(dayName);
  }

  // Default behavior based on cadence
  switch (cadence) {
    case 'daily':
      return true;
    case 'weekly':
      // Show on the same day of week as start_date, or Monday if no start_date
      if (habit.start_date) {
        const startDate = dateService.fromDateString(habit.start_date);
        if (startDate) {
          return startDate.getDay() === dayOfWeek;
        }
      }
      return dayOfWeek === 1; // Monday
    case 'monthly':
      // Show on the same day of month as start_date, or 1st if no start_date
      if (habit.start_date) {
        const startDate = dateService.fromDateString(habit.start_date);
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

  const items: CalendarItem[] = [];

  // ─────────────────────────────────────────────────────────────────
  // TODOS: due on this date OR completed on this date
  // ─────────────────────────────────────────────────────────────────
  todos.forEach((todo) => {
    if (todo.archived) return;

    const isDueOnDate = todo.due_day === dateStr;
    const isCompletedOnDate =
      todo.completed_at && dateService.toDateString(new Date(todo.completed_at)) === dateStr;

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
      dateService.toDateString(new Date(habit.last_completed_at)) === dateStr;

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
    const noteDate = note.date || dateService.toDateString(new Date(note.created_at));
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
  // SORT: By time (timed items first), then by type
  // ─────────────────────────────────────────────────────────────────
  items.sort((a, b) => {
    // Timed items first
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    if (a.time && b.time) return a.time.localeCompare(b.time);

    // Then by type: todos, habits, journals
    const typeOrder = { todo: 0, habit: 1, journal: 2 };
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
          (t.completed_at && dateService.toDateString(new Date(t.completed_at)) === current)),
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
      const noteDate = n.date || dateService.toDateString(new Date(n.created_at));
      return noteDate === current;
    });

    if (hasTodo || hasHabit || hasJournal) {
      datesWithItems.add(current);
    }

    current = dateService.addDays(current, 1);
  }

  return datesWithItems;
}
