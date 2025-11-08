/**
 * Test suite for formatDue - human-friendly due date formatting
 */

import { formatDue } from '../CatchAllNotepad';

describe('formatDue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Set current time to Nov 8, 2025, 10:00 AM
    jest.setSystemTime(new Date('2025-11-08T10:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
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

    it('shows "due Jan 15" for next year', () => {
      const january = new Date('2026-01-15T00:00:00');
      expect(formatDue(january.toISOString())).toBe('due Jan 15');
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
});
