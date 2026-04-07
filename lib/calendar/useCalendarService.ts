/**
 * useCalendarService — Reactive hooks wrapping CalendarService.
 *
 * These hooks subscribe to the relevant Zustand store slices so
 * components re-render when calendar data changes. CalendarService
 * reads imperatively, so these hooks handle the reactivity layer.
 */

import { useMemo } from 'react';
import { useGremlyStore } from '../store/useGremlyStore';
import { getEventsForDate, getEventsForRange, type CalendarItem } from './CalendarService';

interface CalendarOptions {
  includeTodos?: boolean;
  includeHabits?: boolean;
}

/**
 * Get all calendar items for a single date, reactively.
 * Re-renders when any relevant store data changes.
 */
export function useCalendarEvents(date: string, options?: CalendarOptions): CalendarItem[] {
  // Always subscribe to every slice CalendarService reads from.
  // Values aren't used directly — they trigger re-renders when data changes.
  const calendarEvents = useGremlyStore((s) => s.calendarEvents[date]);
  const userCalendarEvents = useGremlyStore((s) => s.userCalendarEvents);
  const notes = useGremlyStore((s) => s.notes);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);

  return useMemo(
    () => getEventsForDate(date, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      date,
      options?.includeTodos,
      options?.includeHabits,
      calendarEvents,
      userCalendarEvents,
      notes,
      todos,
      habits,
    ],
  );
}

/**
 * Get all calendar items for a date range, reactively.
 */
export function useCalendarEventsForRange(
  start: string,
  end: string,
  options?: CalendarOptions,
): CalendarItem[] {
  const calendarEvents = useGremlyStore((s) => s.calendarEvents);
  const userCalendarEvents = useGremlyStore((s) => s.userCalendarEvents);
  const notes = useGremlyStore((s) => s.notes);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);

  return useMemo(
    () => getEventsForRange(start, end, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      start,
      end,
      options?.includeTodos,
      options?.includeHabits,
      calendarEvents,
      userCalendarEvents,
      notes,
      todos,
      habits,
    ],
  );
}
