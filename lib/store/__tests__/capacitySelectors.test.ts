/**
 * Capacity Selectors Tests
 *
 * Tests for date-parameterized capacity hooks added for Tomorrow Brief.
 * These are contract/documentary tests since the hooks use Zustand selectors
 * and React memoization that requires renderHook for full testing.
 *
 * Tests the logic of useCalendarEventsForDate, useHiddenEventCountForDate,
 * and useCapacityForDate by verifying the underlying data flow.
 */

import type { CalendarEvent } from '../../calendar/CalendarClient';

// ─────────────────────────────────────────────────────────────────────────────
// Pure function equivalents of hook logic (for testability)
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_EVENTS: CalendarEvent[] = [];
const EMPTY_HIDDEN: string[] = [];

function filterEventsForDate(
  allEvents: Record<string, CalendarEvent[]>,
  hiddenByDate: Record<string, string[]>,
  date: string,
): CalendarEvent[] {
  const events = allEvents[date] ?? EMPTY_EVENTS;
  const hiddenIds = hiddenByDate[date] ?? EMPTY_HIDDEN;

  if (hiddenIds.length === 0) return events;
  const hiddenSet = new Set(hiddenIds);
  return events.filter((e) => !hiddenSet.has(`${e.provider}-${e.providerEventId}`));
}

function countHiddenForDate(
  allEvents: Record<string, CalendarEvent[]>,
  hiddenByDate: Record<string, string[]>,
  date: string,
): number {
  const events = allEvents[date] ?? EMPTY_EVENTS;
  const hiddenIds = hiddenByDate[date] ?? EMPTY_HIDDEN;

  if (hiddenIds.length === 0) return 0;
  const hiddenSet = new Set(hiddenIds);
  return events.filter((e) => hiddenSet.has(`${e.provider}-${e.providerEventId}`)).length;
}

function computeCurrentHourForDate(date: string, today: string, currentHour: number): number {
  return date === today ? currentHour : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test data
// ─────────────────────────────────────────────────────────────────────────────

const TODAY = '2025-12-15';
const TOMORROW = '2025-12-16';

function makeEvent(id: string, provider: string = 'google'): CalendarEvent {
  return {
    id: `cal-${id}`,
    provider: provider as CalendarEvent['provider'],
    providerEventId: id,
    title: `Event ${id}`,
    startAt: `${TODAY}T09:00:00Z`,
    endAt: `${TODAY}T10:00:00Z`,
    isAllDay: false,
    location: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('capacitySelectors - date-parameterized logic', () => {
  describe('filterEventsForDate (useCalendarEventsForDate logic)', () => {
    it('returns events for the requested date', () => {
      const allEvents = {
        [TODAY]: [makeEvent('evt-1'), makeEvent('evt-2')],
        [TOMORROW]: [makeEvent('evt-3')],
      };

      const result = filterEventsForDate(allEvents, {}, TODAY);
      expect(result).toHaveLength(2);
    });

    it('returns empty array for date with no events', () => {
      const result = filterEventsForDate({}, {}, '2025-12-20');
      expect(result).toEqual([]);
    });

    it('excludes hidden events by provider-id key', () => {
      const allEvents = {
        [TODAY]: [makeEvent('evt-1'), makeEvent('evt-2'), makeEvent('evt-3')],
      };
      const hiddenByDate = {
        [TODAY]: ['google-evt-2'],
      };

      const result = filterEventsForDate(allEvents, hiddenByDate, TODAY);
      expect(result).toHaveLength(2);
      expect(result.find((e) => e.providerEventId === 'evt-2')).toBeUndefined();
    });

    it('returns all events when no hidden IDs for that date', () => {
      const allEvents = {
        [TODAY]: [makeEvent('evt-1')],
      };
      const hiddenByDate = {
        [TOMORROW]: ['google-evt-1'], // Hidden on different date
      };

      const result = filterEventsForDate(allEvents, hiddenByDate, TODAY);
      expect(result).toHaveLength(1);
    });
  });

  describe('countHiddenForDate (useHiddenEventCountForDate logic)', () => {
    it('returns 0 when no events are hidden', () => {
      const allEvents = { [TODAY]: [makeEvent('evt-1')] };
      expect(countHiddenForDate(allEvents, {}, TODAY)).toBe(0);
    });

    it('counts hidden events matching the date', () => {
      const allEvents = {
        [TODAY]: [makeEvent('evt-1'), makeEvent('evt-2'), makeEvent('evt-3')],
      };
      const hiddenByDate = {
        [TODAY]: ['google-evt-1', 'google-evt-3'],
      };

      expect(countHiddenForDate(allEvents, hiddenByDate, TODAY)).toBe(2);
    });

    it('returns 0 for date with no events', () => {
      expect(countHiddenForDate({}, {}, '2025-12-20')).toBe(0);
    });

    it('does not count hidden IDs that do not match actual events', () => {
      const allEvents = { [TODAY]: [makeEvent('evt-1')] };
      const hiddenByDate = { [TODAY]: ['google-evt-99'] }; // Non-existent

      expect(countHiddenForDate(allEvents, hiddenByDate, TODAY)).toBe(0);
    });
  });

  describe('computeCurrentHourForDate (useCapacityForDate logic)', () => {
    it('returns actual current hour for today', () => {
      const result = computeCurrentHourForDate(TODAY, TODAY, 14);
      expect(result).toBe(14);
    });

    it('returns 0 for future dates (all blocks fully available)', () => {
      const result = computeCurrentHourForDate(TOMORROW, TODAY, 14);
      expect(result).toBe(0);
    });

    it('returns 0 for past dates', () => {
      const result = computeCurrentHourForDate('2025-12-14', TODAY, 14);
      expect(result).toBe(0);
    });
  });
});
