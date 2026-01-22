/**
 * ritualDay.test.ts
 *
 * Tests for ritual day helper functions.
 * These functions handle day boundary calculations for users who stay up late.
 */

import {
  getRitualDay,
  getDayBoundaryLabel,
  isInLateNightPeriod,
  getHoursUntilDayBoundary,
  DAY_BOUNDARY_OPTIONS,
} from '../ritualDay';

describe('ritualDay', () => {
  // Use beforeEach/afterEach for proper timer management
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DAY_BOUNDARY_OPTIONS
  // ─────────────────────────────────────────────────────────────────────────

  describe('DAY_BOUNDARY_OPTIONS', () => {
    it('contains expected options', () => {
      expect(DAY_BOUNDARY_OPTIONS).toEqual([
        { value: 0, label: 'Midnight' },
        { value: 3, label: '3:00 AM' },
        { value: 5, label: '5:00 AM' },
      ]);
    });

    it('has 3 options', () => {
      expect(DAY_BOUNDARY_OPTIONS).toHaveLength(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getDayBoundaryLabel
  // ─────────────────────────────────────────────────────────────────────────

  describe('getDayBoundaryLabel', () => {
    it('returns "Midnight" for hour 0', () => {
      expect(getDayBoundaryLabel(0)).toBe('Midnight');
    });

    it('returns predefined labels for known options', () => {
      expect(getDayBoundaryLabel(3)).toBe('3:00 AM');
      expect(getDayBoundaryLabel(5)).toBe('5:00 AM');
    });

    it('generates labels for hours not in predefined options', () => {
      expect(getDayBoundaryLabel(4)).toBe('4:00 AM');
      expect(getDayBoundaryLabel(1)).toBe('1:00 AM');
      expect(getDayBoundaryLabel(6)).toBe('6:00 AM');
      expect(getDayBoundaryLabel(11)).toBe('11:00 AM');
    });

    it('returns "12:00 PM" for hour 12', () => {
      expect(getDayBoundaryLabel(12)).toBe('12:00 PM');
    });

    it('generates PM labels for hours 13-23', () => {
      expect(getDayBoundaryLabel(13)).toBe('1:00 PM');
      expect(getDayBoundaryLabel(18)).toBe('6:00 PM');
      expect(getDayBoundaryLabel(23)).toBe('11:00 PM');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getRitualDay
  // ─────────────────────────────────────────────────────────────────────────

  describe('getRitualDay', () => {
    /**
     * Helper to mock Date to a specific time.
     * Uses a fixed timezone (UTC) to avoid test flakiness.
     * Note: jest.useFakeTimers() is called in beforeEach.
     */
    function mockDateToUTC(isoString: string) {
      jest.setSystemTime(new Date(isoString));
    }

    it('returns today when current hour is after boundary (5am with 4am boundary)', () => {
      // 5am UTC on Jan 10, 2026 - boundary is 4am, so it's Jan 10
      mockDateToUTC('2026-01-10T05:00:00Z');
      const result = getRitualDay(4, 'UTC');
      expect(result).toBe('2026-01-10');
    });

    it('returns yesterday when current hour is before boundary (2am with 4am boundary)', () => {
      // 2am UTC on Jan 10, 2026 - boundary is 4am, so it's still Jan 9
      mockDateToUTC('2026-01-10T02:00:00Z');
      const result = getRitualDay(4, 'UTC');
      expect(result).toBe('2026-01-09');
    });

    it('returns today when boundary is midnight (0)', () => {
      // Midnight boundary means no late-night adjustment
      mockDateToUTC('2026-01-10T02:00:00Z');
      const result = getRitualDay(0, 'UTC');
      expect(result).toBe('2026-01-10');
    });

    it('returns today when current hour equals boundary exactly', () => {
      // 4am UTC exactly with 4am boundary = new day
      mockDateToUTC('2026-01-10T04:00:00Z');
      const result = getRitualDay(4, 'UTC');
      expect(result).toBe('2026-01-10');
    });

    it('handles year boundary (Jan 1 late night counts as Dec 31)', () => {
      // 2am UTC on Jan 1, 2026 with 4am boundary = still Dec 31, 2025
      mockDateToUTC('2026-01-01T02:00:00Z');
      const result = getRitualDay(4, 'UTC');
      expect(result).toBe('2025-12-31');
    });

    it('handles month boundary (Mar 1 late night counts as Feb 28/29)', () => {
      // 2am UTC on Mar 1, 2026 with 4am boundary = Feb 28, 2026
      mockDateToUTC('2026-03-01T02:00:00Z');
      const result = getRitualDay(4, 'UTC');
      expect(result).toBe('2026-02-28');
    });

    it('handles 3am boundary correctly', () => {
      // 2am with 3am boundary = yesterday
      mockDateToUTC('2026-01-10T02:00:00Z');
      expect(getRitualDay(3, 'UTC')).toBe('2026-01-09');

      // 4am with 3am boundary = today
      mockDateToUTC('2026-01-10T04:00:00Z');
      expect(getRitualDay(3, 'UTC')).toBe('2026-01-10');
    });

    it('handles 5am boundary correctly', () => {
      // 4am with 5am boundary = yesterday
      mockDateToUTC('2026-01-10T04:00:00Z');
      expect(getRitualDay(5, 'UTC')).toBe('2026-01-09');

      // 6am with 5am boundary = today
      mockDateToUTC('2026-01-10T06:00:00Z');
      expect(getRitualDay(5, 'UTC')).toBe('2026-01-10');
    });

    it('uses default boundary of 4 when not specified', () => {
      mockDateToUTC('2026-01-10T02:00:00Z');
      // With default 4am boundary, 2am counts as yesterday
      const result = getRitualDay(undefined, 'UTC');
      expect(result).toBe('2026-01-09');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // isInLateNightPeriod
  // ─────────────────────────────────────────────────────────────────────────

  describe('isInLateNightPeriod', () => {
    function mockDateToUTC(isoString: string) {
      jest.setSystemTime(new Date(isoString));
    }

    it('returns true when in late night period (2am with 4am boundary)', () => {
      mockDateToUTC('2026-01-10T02:00:00Z');
      expect(isInLateNightPeriod(4, 'UTC')).toBe(true);
    });

    it('returns false when past boundary (5am with 4am boundary)', () => {
      mockDateToUTC('2026-01-10T05:00:00Z');
      expect(isInLateNightPeriod(4, 'UTC')).toBe(false);
    });

    it('returns false when boundary is midnight (0)', () => {
      mockDateToUTC('2026-01-10T02:00:00Z');
      expect(isInLateNightPeriod(0, 'UTC')).toBe(false);
    });

    it('returns false exactly at the boundary hour', () => {
      mockDateToUTC('2026-01-10T04:00:00Z');
      expect(isInLateNightPeriod(4, 'UTC')).toBe(false);
    });

    it('returns false at midnight (hour 24 in en-US locale)', () => {
      // Note: Intl.DateTimeFormat with hour12:false returns "24" for midnight
      // in en-US locale, so isInLateNightPeriod returns false
      mockDateToUTC('2026-01-10T00:00:00Z');
      expect(isInLateNightPeriod(4, 'UTC')).toBe(false);
    });

    it('returns true one hour before boundary', () => {
      mockDateToUTC('2026-01-10T03:00:00Z');
      expect(isInLateNightPeriod(4, 'UTC')).toBe(true);
    });

    it('returns false during daytime hours', () => {
      mockDateToUTC('2026-01-10T14:00:00Z');
      expect(isInLateNightPeriod(4, 'UTC')).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getHoursUntilDayBoundary
  // ─────────────────────────────────────────────────────────────────────────

  describe('getHoursUntilDayBoundary', () => {
    function mockDateToUTC(isoString: string) {
      jest.setSystemTime(new Date(isoString));
    }

    it('returns hours until boundary when in late night period', () => {
      // 2am with 4am boundary = 2 hours until boundary
      mockDateToUTC('2026-01-10T02:00:00Z');
      expect(getHoursUntilDayBoundary(4, 'UTC')).toBe(2);
    });

    it('returns hours until next day boundary when past current boundary', () => {
      // 5am with 4am boundary = 23 hours until next 4am
      mockDateToUTC('2026-01-10T05:00:00Z');
      expect(getHoursUntilDayBoundary(4, 'UTC')).toBe(23);
    });

    it('returns 24 hours when exactly at boundary', () => {
      // 4am with 4am boundary = 24 hours until next 4am
      mockDateToUTC('2026-01-10T04:00:00Z');
      expect(getHoursUntilDayBoundary(4, 'UTC')).toBe(24);
    });

    it('returns correct hours at midnight with 4am boundary', () => {
      // 0am with 4am boundary = 4 hours until boundary
      mockDateToUTC('2026-01-10T00:00:00Z');
      expect(getHoursUntilDayBoundary(4, 'UTC')).toBe(4);
    });

    it('returns correct hours for midnight boundary', () => {
      // 10pm with midnight boundary = 2 hours until midnight
      mockDateToUTC('2026-01-10T22:00:00Z');
      expect(getHoursUntilDayBoundary(0, 'UTC')).toBe(2);
    });

    it('returns 0 hours at midnight with midnight boundary (hour 24 edge case)', () => {
      // Note: Intl.DateTimeFormat with hour12:false returns "24" for midnight
      // in en-US locale, so 24 - 24 + 0 = 0
      mockDateToUTC('2026-01-10T00:00:00Z');
      expect(getHoursUntilDayBoundary(0, 'UTC')).toBe(0);
    });

    it('handles afternoon times correctly', () => {
      // 2pm (14:00) with 4am boundary = 14 hours until next 4am
      mockDateToUTC('2026-01-10T14:00:00Z');
      expect(getHoursUntilDayBoundary(4, 'UTC')).toBe(14);
    });
  });
});
