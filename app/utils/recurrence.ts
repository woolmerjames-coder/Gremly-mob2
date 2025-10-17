/**
 * Recurrence Utilities - Phase 6
 * Helper functions for describing custom recurrence patterns
 */

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const NTH_NAMES = ['', '1st', '2nd', '3rd', '4th', '5th'];

/**
 * Describe a weekly recurrence pattern
 * @param days - Array of day indices (0=Sunday, 6=Saturday)
 * @returns Human-readable description, e.g., "Mon, Wed, Fri"
 */
export function describeWeeklyDays(days: number[]): string {
  if (!days || days.length === 0) {
    return 'No days selected';
  }

  // Sort days
  const sorted = [...days].sort((a, b) => a - b);

  // Check for every day
  if (sorted.length === 7) {
    return 'Every day';
  }

  // Check for weekdays (Mon-Fri)
  if (sorted.length === 5 && sorted.every((d) => d >= 1 && d <= 5)) {
    return 'Weekdays';
  }

  // Check for weekends
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) {
    return 'Weekends';
  }

  // Otherwise list the days
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/**
 * Describe an nth weekday pattern
 * @param nth - 1-5 (1st, 2nd, 3rd, 4th, 5th)
 * @param weekday - 0-6 (Sunday-Saturday)
 * @returns Human-readable description, e.g., "2nd Monday"
 */
export function describeNthWeekday(nth: number, weekday: number): string {
  if (nth < 1 || nth > 5) {
    return 'Invalid nth value';
  }
  if (weekday < 0 || weekday > 6) {
    return 'Invalid weekday';
  }

  const nthName = NTH_NAMES[nth];
  const weekdayName = WEEKDAY_NAMES[weekday];

  return `${nthName} ${weekdayName}`;
}

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 */
export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a time string for display
 * @param timeISO - HH:MM format
 * @returns Formatted time, e.g., "8:00 AM"
 */
export function formatTime(timeISO: string): string {
  const [hourStr, minuteStr] = timeISO.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute)) {
    return timeISO;
  }

  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayMinute = String(minute).padStart(2, '0');

  return `${displayHour}:${displayMinute} ${period}`;
}
