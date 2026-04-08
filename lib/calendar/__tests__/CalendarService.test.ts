/**
 * Tests for lib/calendar/CalendarService
 *
 * Tests the event merging & query logic using mocked store/DateService.
 */

import type { CalendarItem } from '../CalendarService';

// Mock store state (use plain functions to survive clearAllMocks)
let mockState: Record<string, any> = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));

// Mock DateService
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    today: () => '2025-12-15',
    getTimezone: () => 'UTC',
    addDays: (dateStr: string, days: number) => {
      const d = new Date(dateStr + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    },
    now: () => new Date('2025-12-15T12:00:00Z'),
  }),
}));

import { getEventsForDate, getEventsForRange, hasConflict, findGaps } from '../CalendarService';

function makeBaseState(overrides: Record<string, any> = {}) {
  return {
    notes: [],
    calendarEvents: {},
    userCalendarEvents: [],
    todos: [],
    habits: [],
    habitProgress: [],
    ...overrides,
  };
}

describe('CalendarService', () => {
  beforeEach(() => {
    mockState = makeBaseState();
  });

  describe('getEventsForDate', () => {
    it('returns empty array when no events exist', () => {
      const items = getEventsForDate('2025-12-15');
      expect(items).toEqual([]);
    });

    it('returns entity events from notes with subtype=event', () => {
      mockState = makeBaseState({
        notes: [
          {
            id: 'note-1',
            subtype: 'event',
            title: 'Team lunch',
            target_date: '2025-12-15',
            event_time: '12:00',
            end_time: '13:00',
            archived: false,
            location: 'Cafe',
          },
        ],
      });

      const items = getEventsForDate('2025-12-15');
      expect(items).toHaveLength(1);
      expect(items[0].source).toBe('gremly_event');
      expect(items[0].title).toBe('Team lunch');
      expect(items[0].startTime).toBe('12:00');
      expect(items[0].location).toBe('Cafe');
    });

    it('excludes archived notes', () => {
      mockState = makeBaseState({
        notes: [
          {
            id: 'note-1',
            subtype: 'event',
            title: 'Archived event',
            target_date: '2025-12-15',
            archived: true,
          },
        ],
      });

      const items = getEventsForDate('2025-12-15');
      expect(items).toHaveLength(0);
    });

    it('includes multi-day events that span the queried date', () => {
      mockState = makeBaseState({
        notes: [
          {
            id: 'note-1',
            subtype: 'event',
            title: 'Conference',
            target_date: '2025-12-14',
            end_date: '2025-12-16',
            archived: false,
          },
        ],
      });

      const items = getEventsForDate('2025-12-15');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Conference');
    });

    it('returns synced calendar events', () => {
      mockState = makeBaseState({
        calendarEvents: {
          '2025-12-15': [
            {
              title: 'External Meeting',
              startAt: '2025-12-15T10:00:00Z',
              endAt: '2025-12-15T11:00:00Z',
              isAllDay: false,
              provider: 'google_calendar',
              providerEventId: 'ext-1',
            },
          ],
        },
      });

      const items = getEventsForDate('2025-12-15');
      expect(items).toHaveLength(1);
      expect(items[0].source).toBe('synced');
      expect(items[0].title).toBe('External Meeting');
      expect(items[0].provider).toBe('google_calendar');
    });

    it('returns user calendar events', () => {
      mockState = makeBaseState({
        userCalendarEvents: [
          {
            id: 'uce-1',
            event_date: '2025-12-15',
            title: 'User event',
            event_time: '14:00',
            duration_minutes: 60,
          },
        ],
      });

      const items = getEventsForDate('2025-12-15');
      expect(items).toHaveLength(1);
      expect(items[0].source).toBe('user_calendar');
      expect(items[0].title).toBe('User event');
    });

    it('sorts all-day events before timed events', () => {
      mockState = makeBaseState({
        notes: [
          {
            id: 'n1',
            subtype: 'event',
            title: 'Timed',
            target_date: '2025-12-15',
            event_time: '09:00',
            archived: false,
          },
          {
            id: 'n2',
            subtype: 'event',
            title: 'All Day',
            target_date: '2025-12-15',
            archived: false,
          },
        ],
      });

      const items = getEventsForDate('2025-12-15');
      expect(items[0].title).toBe('All Day');
      expect(items[1].title).toBe('Timed');
    });
  });

  describe('getEventsForRange', () => {
    it('returns events across multiple days', () => {
      mockState = makeBaseState({
        notes: [
          {
            id: 'n1',
            subtype: 'event',
            title: 'Day 1',
            target_date: '2025-12-15',
            archived: false,
          },
          {
            id: 'n2',
            subtype: 'event',
            title: 'Day 2',
            target_date: '2025-12-16',
            archived: false,
          },
        ],
      });

      const items = getEventsForRange('2025-12-15', '2025-12-16');
      expect(items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('hasConflict', () => {
    it('returns false when no events exist', () => {
      expect(hasConflict('2025-12-15', '10:00', '11:00')).toBe(false);
    });

    it('detects overlapping timed events', () => {
      mockState = makeBaseState({
        notes: [
          {
            id: 'n1',
            subtype: 'event',
            title: 'Meeting',
            target_date: '2025-12-15',
            event_time: '09:30',
            end_time: '10:30',
            archived: false,
          },
        ],
      });

      expect(hasConflict('2025-12-15', '10:00', '11:00')).toBe(true);
    });

    it('returns false for non-overlapping events', () => {
      mockState = makeBaseState({
        notes: [
          {
            id: 'n1',
            subtype: 'event',
            title: 'Meeting',
            target_date: '2025-12-15',
            event_time: '08:00',
            end_time: '09:00',
            archived: false,
          },
        ],
      });

      expect(hasConflict('2025-12-15', '10:00', '11:00')).toBe(false);
    });
  });

  describe('findGaps', () => {
    it('returns full working day when no events exist', () => {
      const gaps = findGaps('2025-12-15', 30);
      expect(gaps.length).toBeGreaterThanOrEqual(1);
      expect(gaps[0].start).toBe('08:00');
      expect(gaps[0].end).toBe('22:00');
    });

    it('finds gaps between events', () => {
      mockState = makeBaseState({
        notes: [
          {
            id: 'n1',
            subtype: 'event',
            title: 'Morning',
            target_date: '2025-12-15',
            event_time: '09:00',
            end_time: '10:00',
            archived: false,
          },
          {
            id: 'n2',
            subtype: 'event',
            title: 'Afternoon',
            target_date: '2025-12-15',
            event_time: '14:00',
            end_time: '15:00',
            archived: false,
          },
        ],
      });

      const gaps = findGaps('2025-12-15', 30);
      // Should find gap between 10:00 and 14:00
      const midGap = gaps.find((g) => g.start === '10:00' && g.end === '14:00');
      expect(midGap).toBeDefined();
    });
  });
});
