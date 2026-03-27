/**
 * Capacity Selectors
 *
 * React hooks for accessing calendar-aware capacity data.
 * Connects pure capacity calculations to Zustand store.
 *
 * IMPORTANT: All date/time values are computed once per hook call and memoized
 * to prevent infinite re-render loops.
 */

import { useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date';
import {
  calculateDayCapacity,
  calculateBlockCapacity,
  getCapacitySummary,
  getMiniSweepGremlyMessage,
} from '../capacity';
import type {
  TimeBlock,
  DayCapacity,
  TimeBlockCapacity,
  CapacitySummary,
  EventTimeOverride,
} from '../capacity';
import type { CalendarEvent } from '../calendar/CalendarClient';

// Stable empty array to prevent unnecessary re-renders
const EMPTY_EVENTS: CalendarEvent[] = [];
const EMPTY_HIDDEN: string[] = [];
const EMPTY_TIME_OVERRIDES: Record<string, EventTimeOverride> = {};

/**
 * Internal helper: Get stable today string.
 * This is computed once per component mount cycle.
 */
function useToday(): string {
  // useMemo with empty deps = computed once per mount
  return useMemo(() => getDateService().today(), []);
}

/**
 * Internal helper: Get stable current hour.
 * This is computed once per component mount cycle.
 */
function useCurrentHour(): number {
  return useMemo(() => getDateService().getHour(), []);
}

/**
 * Hook: Get hidden event IDs for today
 */
export function useTodayHiddenEventIds(): string[] {
  const today = useToday();
  return useGremlyStore((s) => s.hiddenCalendarEventsByDate[today] ?? EMPTY_HIDDEN);
}

/**
 * Hook: Get today's calendar events from store (excluding hidden)
 */
export function useTodayCalendarEvents(): CalendarEvent[] {
  const today = useToday();
  const events = useGremlyStore((s) => s.calendarEvents[today] ?? EMPTY_EVENTS);
  const hiddenIds = useTodayHiddenEventIds();

  return useMemo(() => {
    if (hiddenIds.length === 0) return events;
    const hiddenSet = new Set(hiddenIds);
    return events.filter((e) => !hiddenSet.has(`${e.provider}-${e.providerEventId}`));
  }, [events, hiddenIds]);
}

/**
 * Hook: Get count of hidden events for today
 */
export function useHiddenEventCount(): number {
  const today = useToday();
  const events = useGremlyStore((s) => s.calendarEvents[today] ?? EMPTY_EVENTS);
  const hiddenIds = useTodayHiddenEventIds();

  return useMemo(() => {
    if (hiddenIds.length === 0) return 0;
    const hiddenSet = new Set(hiddenIds);
    return events.filter((e) => hiddenSet.has(`${e.provider}-${e.providerEventId}`)).length;
  }, [events, hiddenIds]);
}

/**
 * Hook: Get full day capacity breakdown
 * Recalculates when calendar events, time overrides, or tasks change
 */
export function useTodayCapacity(): DayCapacity {
  const events = useTodayCalendarEvents();
  const eventTimeOverrides = useGremlyStore((s) => s.eventTimeOverrides) ?? EMPTY_TIME_OVERRIDES;
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);
  const today = useToday();
  const currentHour = useCurrentHour();

  return useMemo(() => {
    // Capacity = calendar-free time only. Tasks are NOT subtracted here.
    // MorningBriefSheet uses gap-based free time (TimeBlockSection callbacks)
    // which already accounts for positioned tasks. Subtracting tasks here too
    // would cause double-counting.
    const taskMinutesByBlock = { morning: 0, day: 0, evening: 0 };

    return calculateDayCapacity(
      events,
      currentHour,
      today,
      eventTimeOverrides,
      taskMinutesByBlock,
      timeBlockPreferences,
    );
  }, [events, currentHour, today, eventTimeOverrides, timeBlockPreferences]);
}

/**
 * Hook: Get capacity for a specific time block
 */
export function useBlockCapacity(block: TimeBlock): TimeBlockCapacity {
  const events = useTodayCalendarEvents();
  const eventTimeOverrides = useGremlyStore((s) => s.eventTimeOverrides) ?? EMPTY_TIME_OVERRIDES;
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);
  const today = useToday();
  const currentHour = useCurrentHour();

  return useMemo(
    () =>
      calculateBlockCapacity(
        block,
        events,
        currentHour,
        today,
        eventTimeOverrides,
        0,
        timeBlockPreferences,
      ),
    [block, events, currentHour, today, eventTimeOverrides, timeBlockPreferences],
  );
}

/**
 * Hook: Get Gremly's capacity summary
 * @param taskMinutes - Total estimated minutes of tasks for today
 */
export function useCapacitySummary(taskMinutes: number): CapacitySummary {
  const capacity = useTodayCapacity();

  return useMemo(
    () => getCapacitySummary(taskMinutes, capacity.totalAvailableMinutes),
    [taskMinutes, capacity.totalAvailableMinutes],
  );
}

/**
 * Hook: Get Mini Sweep calendar context
 * Returns data needed for calendar-aware Gremly message in Mini Sweep.
 */
export function useMiniSweepCalendarContext(): {
  blockedHours: number;
  eventCount: number;
  gremlyMessage: string;
} {
  const capacity = useTodayCapacity();

  return useMemo(() => {
    const blockedHours = capacity.totalCalendarMinutes / 60;
    const eventCount = capacity.totalEventCount;
    return {
      blockedHours,
      eventCount,
      gremlyMessage: getMiniSweepGremlyMessage(blockedHours, eventCount),
    };
  }, [capacity.totalCalendarMinutes, capacity.totalEventCount]);
}

// =========================
// === DATE-PARAMETERIZED HOOKS ===
// =========================

/**
 * Hook: Get calendar events for a specific date (excluding hidden)
 */
export function useCalendarEventsForDate(date: string): CalendarEvent[] {
  const events = useGremlyStore((s) => s.calendarEvents[date] ?? EMPTY_EVENTS);
  const hiddenIds = useGremlyStore((s) => s.hiddenCalendarEventsByDate[date] ?? EMPTY_HIDDEN);

  return useMemo(() => {
    if (hiddenIds.length === 0) return events;
    const hiddenSet = new Set(hiddenIds);
    return events.filter((e) => !hiddenSet.has(`${e.provider}-${e.providerEventId}`));
  }, [events, hiddenIds]);
}

/**
 * Hook: Get count of hidden events for a specific date
 */
export function useHiddenEventCountForDate(date: string): number {
  const events = useGremlyStore((s) => s.calendarEvents[date] ?? EMPTY_EVENTS);
  const hiddenIds = useGremlyStore((s) => s.hiddenCalendarEventsByDate[date] ?? EMPTY_HIDDEN);

  return useMemo(() => {
    if (hiddenIds.length === 0) return 0;
    const hiddenSet = new Set(hiddenIds);
    return events.filter((e) => hiddenSet.has(`${e.provider}-${e.providerEventId}`)).length;
  }, [events, hiddenIds]);
}

/**
 * Hook: Get full day capacity breakdown for a specific date
 * For today, currentHour reflects the actual hour (blocks partially elapsed).
 * For future dates, currentHour is 0 so all blocks show as fully available.
 */
export function useCapacityForDate(date: string): DayCapacity {
  const events = useCalendarEventsForDate(date);
  const eventTimeOverrides = useGremlyStore((s) => s.eventTimeOverrides) ?? EMPTY_TIME_OVERRIDES;
  const timeBlockPreferences = useGremlyStore((s) => s.timeBlockPreferences);

  const currentHour = useMemo(() => {
    const today = getDateService().today();
    return date === today ? getDateService().getHour() : 0;
  }, [date]);

  return useMemo(() => {
    // Capacity = calendar-free time only (same rationale as useTodayCapacity).
    const taskMinutesByBlock = { morning: 0, day: 0, evening: 0 };

    return calculateDayCapacity(
      events,
      currentHour,
      date,
      eventTimeOverrides,
      taskMinutesByBlock,
      timeBlockPreferences,
    );
  }, [events, currentHour, date, eventTimeOverrides, timeBlockPreferences]);
}
