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

  describe('today vs toISOString', () => {
    it('returns local date, not UTC date', () => {
      // Use current time - whatever timezone we're in
      const now = new Date();
      const service = createDateService({ clock: () => now });

      const localDate = service.today();

      // Format the expected local date the same way DateService does
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const expectedLocalDate = `${year}-${month}-${day}`;

      // today should return local date
      expect(localDate).toBe(expectedLocalDate);

      // The key insight: toISOString().split('T')[0] gives UTC date,
      // which may differ from local date depending on time of day and timezone.
      // We're verifying that today uses local time components.
    });

    it('returns consistent date based on local time', () => {
      // Create dates with explicit local time components
      // by using new Date(year, month-1, day, hour, minute)

      // Early morning of Dec 22
      const morning = new Date(2025, 11, 22, 6, 0, 0); // Dec 22, 6am local
      const morningService = createDateService({ clock: () => morning });
      expect(morningService.today()).toBe('2025-12-22');

      // Late evening of Dec 22
      const evening = new Date(2025, 11, 22, 23, 59, 59); // Dec 22, 11:59pm local
      const eveningService = createDateService({ clock: () => evening });
      expect(eveningService.today()).toBe('2025-12-22');

      // Right after midnight on Dec 23
      const midnight = new Date(2025, 11, 23, 0, 1, 0); // Dec 23, 12:01am local
      const midnightService = createDateService({ clock: () => midnight });
      expect(midnightService.today()).toBe('2025-12-23');
    });
  });

  describe('addDays timezone safety', () => {
    it('adds days without timezone drift', () => {
      // Use local time constructor to avoid timezone confusion
      const service = createDateService({
        clock: () => new Date(2025, 11, 22, 20, 0, 0), // Dec 22, 8pm local
      });

      const today = service.today();
      expect(today).toBe('2025-12-22');

      const tomorrow = service.addDays(today, 1);
      expect(tomorrow).toBe('2025-12-23');

      const nextWeek = service.addDays(today, 7);
      expect(nextWeek).toBe('2025-12-29');

      const yesterday = service.addDays(today, -1);
      expect(yesterday).toBe('2025-12-21');
    });

    it('handles month boundaries correctly', () => {
      // Use local time constructor: new Date(year, month-1, day, hour)
      const service = createDateService({
        clock: () => new Date(2025, 11, 30, 12, 0, 0), // Dec 30, noon local
      });

      const dec30 = service.today();
      expect(dec30).toBe('2025-12-30');

      const jan1 = service.addDays(dec30, 2);
      expect(jan1).toBe('2026-01-01');
    });

    it('handles DST transitions without issues', () => {
      // March 9, 2025 is when DST starts in US (clocks spring forward)
      // Use local time constructor to be timezone-agnostic
      const service = createDateService({
        clock: () => new Date(2025, 2, 8, 12, 0, 0), // March 8, noon local
      });

      const march8 = service.today();
      expect(march8).toBe('2025-03-08');

      const march9 = service.addDays(march8, 1);
      expect(march9).toBe('2025-03-09');

      const march10 = service.addDays(march8, 2);
      expect(march10).toBe('2025-03-10');
    });
  });

  describe('fromLocalDate timezone safety', () => {
    it('parses YYYY-MM-DD at noon to avoid DST issues', () => {
      const service = getDateService();

      const date = service.fromLocalDate('2025-12-22');
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
      const dateObj = service.fromLocalDate(original);
      expect(dateObj).not.toBeNull();

      if (dateObj) {
        const backToString = service.toLocalDate(dateObj);
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

  describe('extractLocalDate', () => {
    it('extracts date portion from ISO timestamp', () => {
      const service = getDateService();

      // Should extract "2025-12-22" regardless of time component
      expect(service.extractLocalDate('2025-12-22T00:00:00.000Z')).toBe('2025-12-22');
      expect(service.extractLocalDate('2025-12-22T23:59:59.999Z')).toBe('2025-12-22');
      // Use T18:00Z to avoid timezone shifts in western US timezones
      expect(service.extractLocalDate('2025-12-22T18:00:00.000Z')).toBe('2025-12-22');
    });

    it('handles date-only strings', () => {
      const service = getDateService();

      expect(service.extractLocalDate('2025-12-22')).toBe('2025-12-22');
    });

    it('returns null for invalid input', () => {
      const service = getDateService();

      expect(service.extractLocalDate('')).toBeNull();
      expect(service.extractLocalDate('invalid')).toBeNull();
      expect(service.extractLocalDate('not-a-date')).toBeNull();
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
    expect(result).toBe(ds.today());
  });
});
