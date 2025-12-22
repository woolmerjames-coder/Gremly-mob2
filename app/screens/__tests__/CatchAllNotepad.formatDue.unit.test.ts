/**
 * Test suite for formatDue - human-friendly due date formatting
 */

import { formatDue } from '../../../lib/date/formatDue';
import { resetDateService } from '../../../lib/date';

describe('formatDue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Set current time to Nov 8, 2025, 10:00 AM
    jest.setSystemTime(new Date('2025-11-08T10:00:00'));
    // Reset DateService so it picks up the fake time
    resetDateService();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetDateService();
  });

  describe('no due date', () => {
    it('returns "no deadline yet" when dueIso is null', () => {
      expect(formatDue(null)).toBe('no deadline yet');
    });

    it('returns "no deadline yet" when dueIso is undefined', () => {
      expect(formatDue(undefined)).toBe('no deadline yet');
    });

    it('returns "no deadline yet" when dueIso is empty string', () => {
      expect(formatDue('')).toBe('no deadline yet');
    });
  });

  describe('today', () => {
    it('shows "due Today" for today at midnight', () => {
      const today = new Date('2025-11-08T00:00:00');
      expect(formatDue(today.toISOString())).toBe('due Today');
    });

    it('shows "due Today @ HH:mm" for today with time', () => {
      const today = new Date('2025-11-08T14:30:00');
      expect(formatDue(today.toISOString())).toBe('due Today @ 14:30');
    });

    it('shows "due Today @ HH:mm" for today at 17:00', () => {
      const today = new Date('2025-11-08T17:00:00');
      expect(formatDue(today.toISOString())).toBe('due Today @ 17:00');
    });
  });

  describe('tomorrow', () => {
    it('shows "due Tomorrow" for tomorrow at midnight', () => {
      const tomorrow = new Date('2025-11-09T00:00:00');
      expect(formatDue(tomorrow.toISOString())).toBe('due Tomorrow');
    });

    it('shows "due Tomorrow @ HH:mm" for tomorrow with time', () => {
      const tomorrow = new Date('2025-11-09T09:00:00');
      expect(formatDue(tomorrow.toISOString())).toBe('due Tomorrow @ 09:00');
    });
  });

  describe('within next 7 days', () => {
    it('shows "due Mon" for Monday (2 days from now)', () => {
      const monday = new Date('2025-11-10T00:00:00'); // Nov 10 is Monday
      expect(formatDue(monday.toISOString())).toBe('due Mon');
    });

    it('shows "due Fri" for Friday (6 days from now)', () => {
      const friday = new Date('2025-11-14T00:00:00'); // Nov 14 is Friday
      expect(formatDue(friday.toISOString())).toBe('due Fri');
    });

    it('shows "due Wed @ HH:mm" with time', () => {
      const wednesday = new Date('2025-11-12T15:30:00'); // Nov 12 is Wednesday
      expect(formatDue(wednesday.toISOString())).toBe('due Wed @ 15:30');
    });

    it('shows "due Sat" for exactly 7 days from now', () => {
      const saturday = new Date('2025-11-15T00:00:00'); // Nov 15 is Saturday
      expect(formatDue(saturday.toISOString())).toBe('due Sat');
    });
  });

  describe('beyond 7 days within same month', () => {
    it('shows "due Nov 20" for 12 days from now', () => {
      const later = new Date('2025-11-20T00:00:00');
      expect(formatDue(later.toISOString())).toBe('due Nov 20');
    });

    it('shows "due Nov 28 @ HH:mm" with time', () => {
      const later = new Date('2025-11-28T10:15:00');
      expect(formatDue(later.toISOString())).toBe('due Nov 28 @ 10:15');
    });
  });

  describe('different month', () => {
    it('shows "due Dec 5" for next month', () => {
      const december = new Date('2025-12-05T00:00:00');
      expect(formatDue(december.toISOString())).toBe('due Dec 5');
    });

    it('shows "due Jan 15, 2026" for next year (includes year when different)', () => {
      const january = new Date('2026-01-15T00:00:00');
      expect(formatDue(january.toISOString())).toBe('due Jan 15, 2026');
    });

    it('shows "due Dec 25 @ HH:mm" with time', () => {
      const christmas = new Date('2025-12-25T18:00:00');
      expect(formatDue(christmas.toISOString())).toBe('due Dec 25 @ 18:00');
    });
  });

  describe('time formatting', () => {
    it('does not show time for midnight (00:00)', () => {
      const midnight = new Date('2025-11-10T00:00:00');
      expect(formatDue(midnight.toISOString())).toBe('due Mon');
    });

    it('shows time for 09:00', () => {
      const morning = new Date('2025-11-10T09:00:00');
      expect(formatDue(morning.toISOString())).toBe('due Mon @ 09:00');
    });

    it('pads single-digit hours and minutes', () => {
      const early = new Date('2025-11-10T05:05:00');
      expect(formatDue(early.toISOString())).toBe('due Mon @ 05:05');
    });

    it('shows time for 23:59', () => {
      const lateNight = new Date('2025-11-10T23:59:00');
      expect(formatDue(lateNight.toISOString())).toBe('due Mon @ 23:59');
    });
  });

  describe('edge cases', () => {
    it('handles past dates (shows as today if same day)', () => {
      const pastToday = new Date('2025-11-08T05:00:00'); // Earlier today
      expect(formatDue(pastToday.toISOString())).toBe('due Today @ 05:00');
    });

    it('handles yesterday as past date', () => {
      const yesterday = new Date('2025-11-07T14:00:00');
      // Should still format based on the date logic (negative diffDays)
      // This will show as a past date but format keeps working
      const result = formatDue(yesterday.toISOString());
      expect(result).toBeTruthy(); // At minimum, function doesn't crash
    });
  });

  /**
   * Tests for dueDay-based formatting (timezone-safe)
   *
   * When dueDay is provided as YYYY-MM-DD, it should be treated as a local date
   * and NOT be affected by UTC timezone conversions.
   */
  describe('dueDay option (timezone-safe)', () => {
    it('returns "no deadline yet" when dueDay is null/undefined', () => {
      expect(formatDue({ dueDay: null })).toBe('no deadline yet');
      expect(formatDue({ dueDay: undefined })).toBe('no deadline yet');
      expect(formatDue({})).toBe('no deadline yet');
    });

    it('shows "due Today" when dueDay equals today', () => {
      // System time is Nov 8, 2025
      expect(formatDue({ dueDay: '2025-11-08' })).toBe('due Today');
    });

    it('shows "due Tomorrow" when dueDay equals tomorrow', () => {
      expect(formatDue({ dueDay: '2025-11-09' })).toBe('due Tomorrow');
    });

    it('shows weekday name for within 7 days', () => {
      expect(formatDue({ dueDay: '2025-11-10' })).toBe('due Mon'); // Monday
      expect(formatDue({ dueDay: '2025-11-14' })).toBe('due Fri'); // Friday
    });

    it('shows "due Mon DD" for beyond 7 days', () => {
      expect(formatDue({ dueDay: '2025-11-20' })).toBe('due Nov 20');
      expect(formatDue({ dueDay: '2025-12-25' })).toBe('due Dec 25');
    });

    it('includes dueTime when provided', () => {
      expect(formatDue({ dueDay: '2025-11-08', dueTime: '14:30' })).toBe('due Today @ 14:30');
      expect(formatDue({ dueDay: '2025-11-09', dueTime: '09:00' })).toBe('due Tomorrow @ 09:00');
      expect(formatDue({ dueDay: '2025-11-10', dueTime: '17:00' })).toBe('due Mon @ 17:00');
    });

    it('ignores midnight dueTime (00:00)', () => {
      expect(formatDue({ dueDay: '2025-11-08', dueTime: '00:00' })).toBe('due Today');
    });

    it('prefers dueDay over dueIso when both provided', () => {
      // dueIso is UTC midnight which would shift back a day in Pacific time
      // dueDay is the canonical local date and should be used
      expect(
        formatDue({
          dueDay: '2025-11-08',
          dueIso: '2025-11-08T00:00:00+00:00', // UTC midnight
        }),
      ).toBe('due Today');
    });

    it('falls back to dueIso when dueDay is not provided', () => {
      const tomorrow = new Date('2025-11-09T00:00:00');
      expect(formatDue({ dueIso: tomorrow.toISOString() })).toBe('due Tomorrow');
    });

    /**
     * Critical timezone bug test:
     * When dueDay = "2025-11-08" (today) but dueIso = "2025-11-08T00:00:00+00:00" (UTC midnight),
     * the UTC timestamp would render as Nov 7 in Pacific time (-8h offset).
     * The dueDay field should prevent this timezone shift.
     */
    it('prevents timezone shift when dueDay is provided (critical bug fix)', () => {
      // Simulate the bug scenario:
      // User sets "today" in Pacific time
      // dueDay = "2025-11-08" (correct local date)
      // dueIso = "2025-11-08T00:00:00+00:00" (UTC midnight, which is Nov 7 4pm in Pacific)

      // Without the fix, parsing dueIso would give wrong day
      // With the fix, dueDay takes precedence
      expect(
        formatDue({
          dueDay: '2025-11-08',
          dueIso: '2025-11-08T00:00:00+00:00',
          dueTime: null,
        }),
      ).toBe('due Today');
    });
  });
});
