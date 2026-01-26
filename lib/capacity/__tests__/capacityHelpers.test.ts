/**
 * Tests for capacityHelpers module
 *
 * Tests the capacity calculation functions for calendar-aware planning.
 * These functions compute available time based on calendar events and
 * user preferences for time block boundaries.
 *
 * Key functions tested:
 * - getTimeBlockBoundaries: User-customizable block boundaries
 * - getEventMinutesInBlock: Event overlap calculation
 * - calculateBlockCapacity: Single block availability
 * - calculateDayCapacity: Full day capacity across all blocks
 * - getCapacitySummary: Gremly's capacity assessment
 */

import {
  getTimeBlockBoundaries,
  getEventMinutesInBlock,
  calculateBlockCapacity,
  calculateDayCapacity,
  getCapacitySummary,
  getEffectiveEventTimes,
  getEffectiveEventDuration,
  getEventId,
} from '../capacityHelpers';
import { DEFAULT_TIME_BLOCK_PREFERENCES, type TimeBlockPreferences } from '../capacityTypes';
import type { CalendarEvent } from '../../calendar/CalendarClient';

// =============================================================================
// FACTORIES
// =============================================================================

function makeCalendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    provider: 'google',
    providerEventId: `google-${Math.random().toString(36).slice(2)}`,
    title: 'Test Event',
    startAt: '2025-01-25T10:00:00',
    endAt: '2025-01-25T11:00:00',
    isAllDay: false,
    calendarId: 'cal-1',
    ...overrides,
  } as CalendarEvent;
}

// =============================================================================
// TESTS
// =============================================================================

describe('getTimeBlockBoundaries', () => {
  it('returns default boundaries when no preferences provided', () => {
    const boundaries = getTimeBlockBoundaries();

    expect(boundaries.morning).toEqual({
      block: 'morning',
      startHour: 6,
      endHour: 12,
      label: 'Morning',
    });

    expect(boundaries.day).toEqual({
      block: 'day',
      startHour: 12,
      endHour: 17,
      label: 'Afternoon',
    });

    expect(boundaries.evening).toEqual({
      block: 'evening',
      startHour: 17,
      endHour: 22,
      label: 'Evening',
    });
  });

  it('returns custom boundaries from user preferences', () => {
    const customPrefs: TimeBlockPreferences = {
      morning: { startHour: 5, endHour: 10 },
      day: { startHour: 10, endHour: 18 },
      evening: { startHour: 18, endHour: 23 },
    };

    const boundaries = getTimeBlockBoundaries(customPrefs);

    expect(boundaries.morning.startHour).toBe(5);
    expect(boundaries.morning.endHour).toBe(10);
    expect(boundaries.day.startHour).toBe(10);
    expect(boundaries.day.endHour).toBe(18);
    expect(boundaries.evening.startHour).toBe(18);
    expect(boundaries.evening.endHour).toBe(23);
  });
});

describe('getEventId', () => {
  it('creates unique ID from provider and providerEventId', () => {
    const event = makeCalendarEvent({
      provider: 'google',
      providerEventId: 'abc123',
    });

    expect(getEventId(event)).toBe('google-abc123');
  });
});

describe('getEffectiveEventTimes', () => {
  it('returns original times when no override exists', () => {
    const event = makeCalendarEvent({
      startAt: '2025-01-25T10:00:00',
      endAt: '2025-01-25T11:00:00',
    });

    const result = getEffectiveEventTimes(event, {});

    expect(result.hasOverride).toBe(false);
    expect(result.startAt.toISOString()).toContain('2025-01-25');
  });

  it('returns override times when set', () => {
    const event = makeCalendarEvent({
      provider: 'google',
      providerEventId: 'evt-1',
      startAt: '2025-01-25T10:00:00',
      endAt: '2025-01-25T11:00:00',
    });

    const overrides = {
      'google-evt-1': {
        startAt: '2025-01-25T09:00:00',
        endAt: '2025-01-25T10:30:00',
      },
    };

    const result = getEffectiveEventTimes(event, overrides);

    expect(result.hasOverride).toBe(true);
    expect(result.startAt.getHours()).toBe(9);
    expect(result.endAt.getHours()).toBe(10);
    expect(result.endAt.getMinutes()).toBe(30);
  });
});

describe('getEffectiveEventDuration', () => {
  it('calculates duration in minutes from start/end times', () => {
    const event = makeCalendarEvent({
      startAt: '2025-01-25T10:00:00',
      endAt: '2025-01-25T11:30:00',
    });

    expect(getEffectiveEventDuration(event, {})).toBe(90);
  });

  it('uses override times for duration calculation', () => {
    const event = makeCalendarEvent({
      provider: 'google',
      providerEventId: 'evt-1',
      startAt: '2025-01-25T10:00:00',
      endAt: '2025-01-25T11:00:00',
    });

    const overrides = {
      'google-evt-1': {
        startAt: '2025-01-25T10:00:00',
        endAt: '2025-01-25T12:00:00', // 2 hours instead of 1
      },
    };

    expect(getEffectiveEventDuration(event, overrides)).toBe(120);
  });
});

describe('getEventMinutesInBlock', () => {
  const currentDate = '2025-01-25';

  it('returns 0 for all-day events', () => {
    const event = makeCalendarEvent({
      isAllDay: true,
      startAt: '2025-01-25T00:00:00',
      endAt: '2025-01-26T00:00:00',
    });

    const result = getEventMinutesInBlock(event, 9, 12, currentDate, {});
    expect(result).toBe(0);
  });

  it('returns full duration when event is entirely within block', () => {
    const event = makeCalendarEvent({
      startAt: '2025-01-25T10:00:00',
      endAt: '2025-01-25T11:00:00',
    });

    const result = getEventMinutesInBlock(event, 6, 12, currentDate, {});
    expect(result).toBe(60);
  });

  it('returns partial overlap when event starts before block', () => {
    const event = makeCalendarEvent({
      startAt: '2025-01-25T05:00:00', // before morning block (6am)
      endAt: '2025-01-25T07:00:00',
    });

    const result = getEventMinutesInBlock(event, 6, 12, currentDate, {});
    expect(result).toBe(60); // only 6-7am counts
  });

  it('returns partial overlap when event ends after block', () => {
    const event = makeCalendarEvent({
      startAt: '2025-01-25T11:00:00',
      endAt: '2025-01-25T13:00:00', // past morning block (12pm)
    });

    const result = getEventMinutesInBlock(event, 6, 12, currentDate, {});
    expect(result).toBe(60); // only 11am-12pm counts
  });

  it('returns 0 when event does not overlap block', () => {
    const event = makeCalendarEvent({
      startAt: '2025-01-25T14:00:00',
      endAt: '2025-01-25T15:00:00',
    });

    const result = getEventMinutesInBlock(event, 6, 12, currentDate, {});
    expect(result).toBe(0);
  });

  it('handles events spanning entire block', () => {
    const event = makeCalendarEvent({
      startAt: '2025-01-25T05:00:00',
      endAt: '2025-01-25T14:00:00',
    });

    const result = getEventMinutesInBlock(event, 6, 12, currentDate, {});
    expect(result).toBe(360); // 6 hours = 360 minutes
  });
});

describe('calculateBlockCapacity', () => {
  const currentDate = '2025-01-25';

  it('returns full capacity when no events', () => {
    const result = calculateBlockCapacity(
      'morning',
      [],
      8, // current hour
      currentDate,
      {},
      0,
      DEFAULT_TIME_BLOCK_PREFERENCES,
    );

    expect(result.block).toBe('morning');
    expect(result.totalMinutes).toBe(360); // 6-12 = 6 hours
    expect(result.calendarMinutes).toBe(0);
    expect(result.availableMinutes).toBe(360);
    expect(result.isPast).toBe(false);
  });

  it('subtracts calendar event time from available', () => {
    const events = [
      makeCalendarEvent({
        startAt: '2025-01-25T09:00:00',
        endAt: '2025-01-25T10:00:00',
      }),
      makeCalendarEvent({
        startAt: '2025-01-25T10:30:00',
        endAt: '2025-01-25T11:00:00',
      }),
    ];

    const result = calculateBlockCapacity(
      'morning',
      events,
      8,
      currentDate,
      {},
      0,
      DEFAULT_TIME_BLOCK_PREFERENCES,
    );

    expect(result.calendarMinutes).toBe(90); // 60 + 30
    expect(result.availableMinutes).toBe(270); // 360 - 90
    expect(result.eventCount).toBe(2);
  });

  it('subtracts task minutes from available', () => {
    const result = calculateBlockCapacity(
      'morning',
      [],
      8,
      currentDate,
      {},
      120, // 2 hours of tasks
      DEFAULT_TIME_BLOCK_PREFERENCES,
    );

    expect(result.taskMinutes).toBe(120);
    expect(result.availableMinutes).toBe(240); // 360 - 120
  });

  it('marks block as past when currentHour >= endHour', () => {
    const result = calculateBlockCapacity(
      'morning',
      [],
      13, // past morning (ends at 12)
      currentDate,
      {},
      0,
      DEFAULT_TIME_BLOCK_PREFERENCES,
    );

    expect(result.isPast).toBe(true);
    expect(result.totalMinutes).toBe(0);
    expect(result.availableMinutes).toBe(0);
  });

  it('floors available minutes at 0', () => {
    const events = [
      makeCalendarEvent({
        startAt: '2025-01-25T06:00:00',
        endAt: '2025-01-25T12:00:00', // entire block
      }),
    ];

    const result = calculateBlockCapacity(
      'morning',
      events,
      8,
      currentDate,
      {},
      60, // additional task minutes
      DEFAULT_TIME_BLOCK_PREFERENCES,
    );

    expect(result.availableMinutes).toBe(0); // not negative
  });
});

describe('calculateDayCapacity', () => {
  const currentDate = '2025-01-25';

  it('returns capacity for all three blocks', () => {
    const result = calculateDayCapacity([], 8, currentDate, {});

    expect(result.blocks.morning).toBeDefined();
    expect(result.blocks.day).toBeDefined();
    expect(result.blocks.evening).toBeDefined();
  });

  it('sums totals across all blocks', () => {
    const events = [
      makeCalendarEvent({
        startAt: '2025-01-25T10:00:00',
        endAt: '2025-01-25T11:00:00', // 60 min in morning
      }),
      makeCalendarEvent({
        startAt: '2025-01-25T14:00:00',
        endAt: '2025-01-25T15:00:00', // 60 min in day
      }),
    ];

    const result = calculateDayCapacity(events, 8, currentDate, {});

    expect(result.totalCalendarMinutes).toBe(120);
    expect(result.totalEventCount).toBe(2);
    expect(result.totalAvailableMinutes).toBe(
      result.blocks.morning.availableMinutes +
        result.blocks.day.availableMinutes +
        result.blocks.evening.availableMinutes,
    );
  });

  it('passes task minutes to correct blocks', () => {
    const taskMinutesByBlock = {
      morning: 60,
      day: 90,
      evening: 30,
    };

    const result = calculateDayCapacity([], 8, currentDate, {}, taskMinutesByBlock);

    expect(result.blocks.morning.taskMinutes).toBe(60);
    expect(result.blocks.day.taskMinutes).toBe(90);
    expect(result.blocks.evening.taskMinutes).toBe(30);
    expect(result.totalTaskMinutes).toBe(180);
  });

  it('respects custom time block preferences', () => {
    const customPrefs: TimeBlockPreferences = {
      morning: { startHour: 5, endHour: 9 },
      day: { startHour: 9, endHour: 17 },
      evening: { startHour: 17, endHour: 23 },
    };

    const result = calculateDayCapacity([], 7, currentDate, {}, undefined, customPrefs);

    expect(result.blocks.morning.startHour).toBe(5);
    expect(result.blocks.morning.endHour).toBe(9);
    expect(result.blocks.day.startHour).toBe(9);
    expect(result.blocks.evening.endHour).toBe(23);
  });
});

describe('getCapacitySummary', () => {
  it('returns warning when fully booked', () => {
    const result = getCapacitySummary(60, 0);

    expect(result.tone).toBe('warning');
    expect(result.message).toContain('Fully booked');
  });

  it('returns positive when ratio <= 0.5', () => {
    const result = getCapacitySummary(100, 300);

    expect(result.tone).toBe('positive');
    expect(result.message).toContain('Plenty of room');
  });

  it('returns positive "doable" when ratio is 0.5-0.8', () => {
    const result = getCapacitySummary(200, 300);

    expect(result.tone).toBe('positive');
    expect(result.message).toContain('doable');
  });

  it('returns cautious "snug" when ratio is 0.8-1.0', () => {
    const result = getCapacitySummary(270, 300);

    expect(result.tone).toBe('cautious');
    expect(result.message).toContain('Snug');
  });

  it('returns cautious when slightly overloaded', () => {
    const result = getCapacitySummary(360, 300);

    expect(result.tone).toBe('cautious');
  });

  it('returns warning when heavily overloaded', () => {
    const result = getCapacitySummary(600, 300);

    expect(result.tone).toBe('warning');
  });
});
