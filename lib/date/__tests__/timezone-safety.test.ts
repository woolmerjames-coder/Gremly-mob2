/**
 * Timezone Safety Tests
 *
 * These tests verify that date operations use local timezone correctly,
 * preventing the bug where `new Date().toISOString().split('T')[0]` returns
 * UTC date instead of local date.
 *
 * At 8pm PST on Wednesday, UTC is already Thursday - this caused bugs
 * throughout the app where "today" comparisons were off by a day.
 */

import {
  createDateService,
  resetDateService,
  getDateService,
  type DateService,
} from '../DateService';

describe('Timezone Safety', () => {
  afterEach(() => {
    resetDateService();
  });

  describe('getCurrentDate vs toISOString', () => {
    it('returns local date, not UTC date', () => {
      // Simulate 8pm PST on Dec 22, 2025
      // In UTC, this is 4am Dec 23, 2025
      // The WRONG behavior would return "2025-12-23" (UTC)
      // The CORRECT behavior returns "2025-12-22" (local)

      const pst8pm = new Date('2025-12-22T20:00:00-08:00');
      const service = createDateService({ clock: () => pst8pm });

      const localDate = service.getCurrentDate();
      const utcDate = pst8pm.toISOString().split('T')[0]; // This is the BUG pattern

      // getCurrentDate should return local date
      expect(localDate).toBe('2025-12-22');

      // The buggy UTC pattern would return wrong date in Pacific timezone
      // Note: In CI, this might differ based on system timezone
      // The key assertion is that getCurrentDate returns the correct local date
    });

    it('returns consistent date throughout the day', () => {
      // Early morning
      const morning = new Date('2025-12-22T06:00:00');
      const morningService = createDateService({ clock: () => morning });
      expect(morningService.getCurrentDate()).toBe('2025-12-22');

      // Late evening
      const evening = new Date('2025-12-22T23:59:59');
      const eveningService = createDateService({ clock: () => evening });
      expect(eveningService.getCurrentDate()).toBe('2025-12-22');

      // Right after midnight
      const midnight = new Date('2025-12-23T00:01:00');
      const midnightService = createDateService({ clock: () => midnight });
      expect(midnightService.getCurrentDate()).toBe('2025-12-23');
    });
  });

  describe('addDays timezone safety', () => {
    it('adds days without timezone drift', () => {
      const service = createDateService({
        clock: () => new Date('2025-12-22T20:00:00'),
      });

      const today = service.getCurrentDate();
      expect(today).toBe('2025-12-22');

      const tomorrow = service.addDays(today, 1);
      expect(tomorrow).toBe('2025-12-23');

      const nextWeek = service.addDays(today, 7);
      expect(nextWeek).toBe('2025-12-29');

      const yesterday = service.addDays(today, -1);
      expect(yesterday).toBe('2025-12-21');
    });

    it('handles month boundaries correctly', () => {
      const service = createDateService({
        clock: () => new Date('2025-12-30T12:00:00'),
      });

      const dec30 = service.getCurrentDate();
      expect(dec30).toBe('2025-12-30');

      const jan1 = service.addDays(dec30, 2);
      expect(jan1).toBe('2026-01-01');
    });

    it('handles DST transitions without issues', () => {
      // March 9, 2025 is when DST starts in US (clocks spring forward)
      const service = createDateService({
        clock: () => new Date('2025-03-08T12:00:00'),
      });

      const march8 = service.getCurrentDate();
      expect(march8).toBe('2025-03-08');

      const march9 = service.addDays(march8, 1);
      expect(march9).toBe('2025-03-09');

      const march10 = service.addDays(march8, 2);
      expect(march10).toBe('2025-03-10');
    });
  });

  describe('fromDateString timezone safety', () => {
    it('parses YYYY-MM-DD at noon to avoid DST issues', () => {
      const service = getDateService();

      const date = service.fromDateString('2025-12-22');
      expect(date).not.toBeNull();
      if (date) {
        // Should be parsed at noon local time
        expect(date.getHours()).toBe(12);
        expect(date.getFullYear()).toBe(2025);
        expect(date.getMonth()).toBe(11); // December (0-indexed)
        expect(date.getDate()).toBe(22);
      }
    });

    it('roundtrips correctly: string -> Date -> string', () => {
      const service = getDateService();

      const original = '2025-12-22';
      const dateObj = service.fromDateString(original);
      expect(dateObj).not.toBeNull();

      if (dateObj) {
        const backToString = service.toDateString(dateObj);
        expect(backToString).toBe(original);
      }
    });
  });

  describe('daysBetween timezone safety', () => {
    it('calculates difference correctly', () => {
      const service = getDateService();

      expect(service.daysBetween('2025-12-20', '2025-12-22')).toBe(2);
      expect(service.daysBetween('2025-12-22', '2025-12-20')).toBe(-2);
      expect(service.daysBetween('2025-12-22', '2025-12-22')).toBe(0);
    });

    it('handles month boundaries', () => {
      const service = getDateService();

      expect(service.daysBetween('2025-12-30', '2026-01-02')).toBe(3);
    });
  });

  describe('extractDateFromIso', () => {
    it('extracts date portion from ISO timestamp', () => {
      const service = getDateService();

      // Should extract "2025-12-22" regardless of time component
      expect(service.extractDateFromIso('2025-12-22T00:00:00.000Z')).toBe('2025-12-22');
      expect(service.extractDateFromIso('2025-12-22T23:59:59.999Z')).toBe('2025-12-22');
      expect(service.extractDateFromIso('2025-12-22T14:30:00+05:00')).toBe('2025-12-22');
    });

    it('handles date-only strings', () => {
      const service = getDateService();

      expect(service.extractDateFromIso('2025-12-22')).toBe('2025-12-22');
    });

    it('returns null for invalid input', () => {
      const service = getDateService();

      expect(service.extractDateFromIso('')).toBeNull();
      expect(service.extractDateFromIso('invalid')).toBeNull();
      expect(service.extractDateFromIso('not-a-date')).toBeNull();
    });
  });
});

describe('Integration: habitHelpers uses DateService', () => {
  /**
   * These tests verify that habitHelpers.ts functions use DateService
   * instead of raw new Date().toISOString() calls.
   */

  it('getTodayDateString returns local date via DateService', () => {
    // Reset DateService to ensure clean state
    resetDateService();

    // Import the function (static import)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getTodayDateString } = require('../../sweep/habitHelpers');

    const result = getTodayDateString();

    // Should return YYYY-MM-DD format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Should match what DateService returns
    const ds = getDateService();
    expect(result).toBe(ds.getCurrentDate());
  });
});
