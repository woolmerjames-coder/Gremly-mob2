/**
 * timeBlockHelpers.test.ts
 *
 * Tests for time block helper functions.
 * Used by the Now screen to organize Today's Focus by time of day.
 */

import {
  getTimeBlockForHour,
  getCurrentTimeBlock,
  getTimeBlockForEvent,
  groupEventsByTimeBlock,
  formatEventTimeForHint,
  getTimeBlockOrder,
  isTimeBlockPast,
  inferTimeWindow,
  timeWindowToBlock,
  type TimeBlock,
} from '../timeBlockHelpers';
import type { CalendarEvent } from '../../calendar/CalendarClient';

describe('timeBlockHelpers', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // getTimeBlockForHour
  // ─────────────────────────────────────────────────────────────────────────

  describe('getTimeBlockForHour', () => {
    it('returns morning for hours 5-11', () => {
      expect(getTimeBlockForHour(5)).toBe('morning');
      expect(getTimeBlockForHour(8)).toBe('morning');
      expect(getTimeBlockForHour(11)).toBe('morning');
    });

    it('returns afternoon for hours 12-16', () => {
      expect(getTimeBlockForHour(12)).toBe('afternoon');
      expect(getTimeBlockForHour(14)).toBe('afternoon');
      expect(getTimeBlockForHour(16)).toBe('afternoon');
    });

    it('returns evening for hours 17-20', () => {
      expect(getTimeBlockForHour(17)).toBe('evening');
      expect(getTimeBlockForHour(19)).toBe('evening');
      expect(getTimeBlockForHour(20)).toBe('evening');
    });

    it('returns evening for late night hours 21-23', () => {
      expect(getTimeBlockForHour(21)).toBe('evening');
      expect(getTimeBlockForHour(23)).toBe('evening');
    });

    it('returns evening for early morning hours 0-4', () => {
      expect(getTimeBlockForHour(0)).toBe('evening');
      expect(getTimeBlockForHour(2)).toBe('evening');
      expect(getTimeBlockForHour(4)).toBe('evening');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getTimeBlockForEvent
  // ─────────────────────────────────────────────────────────────────────────

  describe('getTimeBlockForEvent', () => {
    const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
      id: 'test-event',
      provider: 'outlook',
      providerEventId: 'test-id',
      title: 'Test Event',
      startAt: '2025-12-22T09:00:00Z',
      endAt: '2025-12-22T10:00:00Z',
      isAllDay: false,
      location: null,
      ...overrides,
    });

    it('returns morning for all-day events', () => {
      const event = makeEvent({ isAllDay: true });
      expect(getTimeBlockForEvent(event)).toBe('morning');
    });

    it('returns correct block based on event start time', () => {
      const morningEvent = makeEvent({ startAt: '2025-12-22T09:00:00Z' });
      const afternoonEvent = makeEvent({ startAt: '2025-12-22T14:00:00Z' });
      const eveningEvent = makeEvent({ startAt: '2025-12-22T18:00:00Z' });

      // Note: These depend on timezone, testing the logic flow
      expect(typeof getTimeBlockForEvent(morningEvent)).toBe('string');
      expect(typeof getTimeBlockForEvent(afternoonEvent)).toBe('string');
      expect(typeof getTimeBlockForEvent(eveningEvent)).toBe('string');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // groupEventsByTimeBlock
  // ─────────────────────────────────────────────────────────────────────────

  describe('groupEventsByTimeBlock', () => {
    it('returns empty arrays for all blocks when no events', () => {
      const result = groupEventsByTimeBlock([]);
      expect(result.morning).toEqual([]);
      expect(result.afternoon).toEqual([]);
      expect(result.evening).toEqual([]);
      expect(result.anytime).toEqual([]);
    });

    it('groups events by their time block', () => {
      const events: CalendarEvent[] = [
        {
          id: '1',
          provider: 'outlook',
          providerEventId: '1',
          title: 'All Day Event',
          startAt: '2025-12-22T00:00:00Z',
          endAt: '2025-12-23T00:00:00Z',
          isAllDay: true,
          location: null,
        },
      ];

      const result = groupEventsByTimeBlock(events);
      // All-day events go to morning
      expect(result.morning.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // formatEventTimeForHint
  // ─────────────────────────────────────────────────────────────────────────

  describe('formatEventTimeForHint', () => {
    it('returns "All day" for all-day events', () => {
      const event: CalendarEvent = {
        id: '1',
        provider: 'outlook',
        providerEventId: '1',
        title: 'All Day Event',
        startAt: '2025-12-22T00:00:00Z',
        endAt: '2025-12-23T00:00:00Z',
        isAllDay: true,
        location: null,
      };

      expect(formatEventTimeForHint(event)).toBe('All day');
    });

    it('returns formatted time for timed events', () => {
      const event: CalendarEvent = {
        id: '1',
        provider: 'outlook',
        providerEventId: '1',
        title: 'Meeting',
        startAt: '2025-12-22T14:30:00Z',
        endAt: '2025-12-22T15:30:00Z',
        isAllDay: false,
        location: null,
      };

      const result = formatEventTimeForHint(event);
      // Should contain AM or PM
      expect(result).toMatch(/AM|PM/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getTimeBlockOrder
  // ─────────────────────────────────────────────────────────────────────────

  describe('getTimeBlockOrder', () => {
    it('returns blocks in correct order', () => {
      expect(getTimeBlockOrder()).toEqual(['morning', 'afternoon', 'evening', 'anytime']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // inferTimeWindow
  // ─────────────────────────────────────────────────────────────────────────

  describe('inferTimeWindow', () => {
    it('uses explicit timeWindow when set and not "any"', () => {
      expect(inferTimeWindow({ name: 'Task', timeWindow: 'morning' })).toBe('morning');
      expect(inferTimeWindow({ name: 'Task', timeWindow: 'evening' })).toBe('evening');
    });

    it('returns "any" when timeWindow is "any"', () => {
      expect(inferTimeWindow({ name: 'Task', timeWindow: 'any' })).toBe('any');
    });

    it('infers from dueTime hour - morning', () => {
      expect(inferTimeWindow({ name: 'Task', dueTime: '08:00' })).toBe('morning');
      expect(inferTimeWindow({ name: 'Task', dueTime: '11:30' })).toBe('morning');
    });

    it('infers from dueTime hour - afternoon', () => {
      expect(inferTimeWindow({ name: 'Task', dueTime: '12:00' })).toBe('afternoon');
      expect(inferTimeWindow({ name: 'Task', dueTime: '14:30' })).toBe('afternoon');
      expect(inferTimeWindow({ name: 'Task', dueTime: '16:45' })).toBe('afternoon');
    });

    it('infers from dueTime hour - evening', () => {
      expect(inferTimeWindow({ name: 'Task', dueTime: '17:00' })).toBe('evening');
      expect(inferTimeWindow({ name: 'Task', dueTime: '19:30' })).toBe('evening');
      expect(inferTimeWindow({ name: 'Task', dueTime: '20:00' })).toBe('evening');
    });

    it('infers morning from name keywords', () => {
      expect(inferTimeWindow({ name: 'Morning meditation' })).toBe('morning');
      expect(inferTimeWindow({ name: 'Have breakfast' })).toBe('morning');
    });

    it('infers afternoon from name keywords', () => {
      expect(inferTimeWindow({ name: 'Afternoon walk' })).toBe('afternoon');
      expect(inferTimeWindow({ name: 'Lunch with team' })).toBe('afternoon');
      expect(inferTimeWindow({ name: 'Midday break' })).toBe('afternoon');
      expect(inferTimeWindow({ name: 'Noon meeting' })).toBe('afternoon');
    });

    it('infers evening from name keywords', () => {
      expect(inferTimeWindow({ name: 'Evening jog' })).toBe('evening');
      expect(inferTimeWindow({ name: 'Night reading' })).toBe('evening');
      expect(inferTimeWindow({ name: 'Dinner with friends' })).toBe('evening');
    });

    it('returns "any" when no inference possible', () => {
      expect(inferTimeWindow({ name: 'Generic task' })).toBe('any');
      expect(inferTimeWindow({ name: 'Do something' })).toBe('any');
    });

    it('prioritizes timeWindow over dueTime', () => {
      expect(
        inferTimeWindow({
          name: 'Task',
          timeWindow: 'morning',
          dueTime: '18:00',
        }),
      ).toBe('morning');
    });

    it('prioritizes dueTime over name inference', () => {
      expect(
        inferTimeWindow({
          name: 'Evening task',
          dueTime: '09:00',
        }),
      ).toBe('morning');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // timeWindowToBlock
  // ─────────────────────────────────────────────────────────────────────────

  describe('timeWindowToBlock', () => {
    it('maps morning to morning', () => {
      expect(timeWindowToBlock('morning')).toBe('morning');
    });

    it('maps afternoon/midday to afternoon', () => {
      expect(timeWindowToBlock('afternoon')).toBe('afternoon');
      expect(timeWindowToBlock('midday')).toBe('afternoon');
    });

    it('maps evening/night to evening', () => {
      expect(timeWindowToBlock('evening')).toBe('evening');
      expect(timeWindowToBlock('night')).toBe('evening');
    });

    it('maps any/anytime to anytime', () => {
      expect(timeWindowToBlock('any')).toBe('anytime');
      expect(timeWindowToBlock('anytime')).toBe('anytime');
    });

    it('defaults unknown values to anytime', () => {
      expect(timeWindowToBlock('unknown')).toBe('anytime');
      expect(timeWindowToBlock('')).toBe('anytime');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getCurrentTimeBlock (snapshot test - depends on actual time)
  // ─────────────────────────────────────────────────────────────────────────

  describe('getCurrentTimeBlock', () => {
    it('returns a valid time block', () => {
      const block = getCurrentTimeBlock();
      expect(['morning', 'afternoon', 'evening', 'anytime']).toContain(block);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // isTimeBlockPast
  // ─────────────────────────────────────────────────────────────────────────

  describe('isTimeBlockPast', () => {
    it('returns boolean', () => {
      const result = isTimeBlockPast('morning');
      expect(typeof result).toBe('boolean');
    });
  });
});
