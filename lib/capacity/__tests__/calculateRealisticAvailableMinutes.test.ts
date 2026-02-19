/**
 * Tests for calculateRealisticAvailableMinutes
 *
 * Pure function that calculates usable time remaining in a block
 * from "right now", minus overlapping calendar events.
 */

import { calculateRealisticAvailableMinutes } from '../capacityHelpers';
import { DEFAULT_TIME_BLOCK_PREFERENCES } from '../capacityTypes';
import { resetDateService, createDateService } from '../../date';
import type { CalendarEvent } from '../../calendar/CalendarClient';

const TODAY = '2025-12-15';

function makeEvent(
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const start = new Date(
    `${TODAY}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`,
  );
  const end = new Date(
    `${TODAY}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`,
  );
  return {
    id: `cal-${Math.random().toString(36).slice(2)}`,
    provider: 'google' as CalendarEvent['provider'],
    providerEventId: `evt-${Math.random().toString(36).slice(2)}`,
    title: 'Meeting',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    isAllDay: false,
    location: null,
    ...overrides,
  };
}

function setTimeTo(hour: number, minute: number = 0) {
  resetDateService();
  createDateService({
    clock: () =>
      new Date(`${TODAY}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`),
  });
}

afterEach(() => {
  resetDateService();
});

describe('calculateRealisticAvailableMinutes', () => {
  describe('basic availability', () => {
    it('returns full block minutes when no events and time is before block', () => {
      setTimeTo(5, 0); // 5 AM, before morning block (6-12)
      const result = calculateRealisticAvailableMinutes('morning', [], TODAY);
      // Morning block = 6:00-12:00 = 360 minutes
      expect(result).toBe(360);
    });

    it('returns remaining minutes when time is within the block', () => {
      setTimeTo(9, 0); // 9 AM, inside morning block (6-12)
      const result = calculateRealisticAvailableMinutes('morning', [], TODAY);
      // 9:00-12:00 = 180 minutes
      expect(result).toBe(180);
    });

    it('returns 0 when block is in the past', () => {
      setTimeTo(13, 0); // 1 PM, morning block (6-12) is past
      const result = calculateRealisticAvailableMinutes('morning', [], TODAY);
      expect(result).toBe(0);
    });

    it('returns 0 when exactly at block end', () => {
      setTimeTo(12, 0); // Noon = end of morning block
      const result = calculateRealisticAvailableMinutes('morning', [], TODAY);
      expect(result).toBe(0);
    });
  });

  describe('event subtraction', () => {
    it('subtracts event time from available minutes', () => {
      setTimeTo(9, 0); // 9 AM, 180 min left in morning
      const event = makeEvent(10, 0, 11, 0); // 1 hour meeting 10-11
      const result = calculateRealisticAvailableMinutes('morning', [event], TODAY);
      // 180 - 60 = 120
      expect(result).toBe(120);
    });

    it('clips events to the remaining window (starts before now)', () => {
      setTimeTo(10, 30); // 10:30 AM
      const event = makeEvent(10, 0, 11, 0); // 10:00-11:00
      const result = calculateRealisticAvailableMinutes('morning', [event], TODAY);
      // Window: 10:30-12:00 = 90 min, event overlap: 10:30-11:00 = 30 min
      // Free = 90 - 30 = 60
      expect(result).toBe(60);
    });

    it('clips events to block end', () => {
      setTimeTo(9, 0);
      const event = makeEvent(11, 0, 13, 0); // 11:00-13:00 (extends past morning)
      const result = calculateRealisticAvailableMinutes('morning', [event], TODAY);
      // Window: 9:00-12:00 = 180 min, event overlap: 11:00-12:00 = 60 min
      // Free = 180 - 60 = 120
      expect(result).toBe(120);
    });

    it('merges overlapping events', () => {
      setTimeTo(9, 0);
      const evt1 = makeEvent(10, 0, 10, 45); // 10:00-10:45
      const evt2 = makeEvent(10, 30, 11, 15); // 10:30-11:15 (overlaps)
      const result = calculateRealisticAvailableMinutes('morning', [evt1, evt2], TODAY);
      // Merged: 10:00-11:15 = 75 min
      // Window: 9:00-12:00 = 180, free = 180 - 75 = 105
      expect(result).toBe(105);
    });

    it('handles multiple non-overlapping events', () => {
      setTimeTo(9, 0);
      const evt1 = makeEvent(9, 30, 10, 0); // 30 min
      const evt2 = makeEvent(11, 0, 11, 30); // 30 min
      const result = calculateRealisticAvailableMinutes('morning', [evt1, evt2], TODAY);
      // 180 - 30 - 30 = 120
      expect(result).toBe(120);
    });

    it('ignores all-day events', () => {
      setTimeTo(9, 0);
      const allDay = makeEvent(0, 0, 23, 59, { isAllDay: true });
      const result = calculateRealisticAvailableMinutes('morning', [allDay], TODAY);
      expect(result).toBe(180);
    });

    it('ignores events on a different date', () => {
      setTimeTo(9, 0);
      const tomorrow = new Date('2025-12-16T10:00:00');
      const event: CalendarEvent = {
        id: 'cal-x',
        provider: 'google' as CalendarEvent['provider'],
        providerEventId: 'evt-x',
        title: 'Tomorrow meeting',
        startAt: tomorrow.toISOString(),
        endAt: new Date('2025-12-16T11:00:00').toISOString(),
        isAllDay: false,
        location: null,
      };
      const result = calculateRealisticAvailableMinutes('morning', [event], TODAY);
      expect(result).toBe(180);
    });
  });

  describe('different blocks', () => {
    it('calculates afternoon block (12-17)', () => {
      setTimeTo(13, 0); // 1 PM
      const result = calculateRealisticAvailableMinutes('day', [], TODAY);
      // 13:00-17:00 = 240 minutes
      expect(result).toBe(240);
    });

    it('calculates evening block (17-22)', () => {
      setTimeTo(18, 0); // 6 PM
      const result = calculateRealisticAvailableMinutes('evening', [], TODAY);
      // 18:00-22:00 = 240 minutes
      expect(result).toBe(240);
    });
  });

  describe('time overrides', () => {
    it('uses overridden event times when provided', () => {
      setTimeTo(9, 0);
      const event = makeEvent(10, 0, 11, 0);
      // Override key is `${provider}-${providerEventId}`
      const overrideKey = `${event.provider}-${event.providerEventId}`;
      const overrides = {
        [overrideKey]: {
          startAt: new Date(`${TODAY}T10:00:00`).toISOString(),
          endAt: new Date(`${TODAY}T10:30:00`).toISOString(),
        },
      };
      const result = calculateRealisticAvailableMinutes('morning', [event], TODAY, overrides);
      // Window: 9:00-12:00 = 180, overridden event: 10:00-10:30 = 30 min
      // Free = 180 - 30 = 150
      expect(result).toBe(150);
    });
  });

  describe('custom time block preferences', () => {
    it('respects custom block boundaries', () => {
      setTimeTo(7, 0);
      const prefs = {
        ...DEFAULT_TIME_BLOCK_PREFERENCES,
        morning: { startHour: 7, endHour: 10 },
      };
      const result = calculateRealisticAvailableMinutes('morning', [], TODAY, {}, prefs);
      // 7:00-10:00 = 180 minutes
      expect(result).toBe(180);
    });
  });

  describe('edge cases', () => {
    it('returns 0 when entire block is consumed by an event', () => {
      setTimeTo(9, 0);
      const event = makeEvent(6, 0, 12, 0); // Covers entire morning
      const result = calculateRealisticAvailableMinutes('morning', [event], TODAY);
      expect(result).toBe(0);
    });

    it('handles event starting exactly at current time', () => {
      setTimeTo(10, 0);
      const event = makeEvent(10, 0, 10, 30);
      const result = calculateRealisticAvailableMinutes('morning', [event], TODAY);
      // 10:00-12:00 = 120 min, event 10:00-10:30 = 30 min → 90
      expect(result).toBe(90);
    });
  });
});
