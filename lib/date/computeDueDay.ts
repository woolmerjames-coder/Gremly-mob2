/**
 * GREMLY TODO DATE MODEL
 * ======================
 * Gremly uses `due_day` (YYYY-MM-DD) as the CANONICAL field for todo due dates.
 * This represents a LOCAL "all-day" date with NO time component.
 *
 * - `due_day`: Primary source of truth for Mind Drop, Today lane, overlay display
 * - `due_date`: Mirror of due_day for backward compatibility (same YYYY-MM-DD value)
 * - `due_at`: UNUSED for Mind Drop + Today logic. May be null. Only relevant if
 *             we ever add time-of-day reminders (not currently implemented).
 *
 * All date comparisons for "due today" use simple string comparison:
 *   todo.due_day === getTodayDayString()
 *
 * This avoids UTC timezone drift issues that occur with ISO timestamps.
 */

/**
 * Get today's date as a YYYY-MM-DD string in the DEVICE LOCAL TIMEZONE.
 * This is the canonical way to get "today" for todo due date comparisons.
 *
 * IMPORTANT: Does NOT use .toISOString() which would convert to UTC.
 *
 * @returns Today's date as YYYY-MM-DD in local timezone
 */
export function getTodayDayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert a Date object to a YYYY-MM-DD string in the DEVICE LOCAL TIMEZONE.
 * Use this when the user picks a date from a date picker.
 *
 * IMPORTANT: Does NOT use .toISOString() which would convert to UTC.
 *
 * @param date - A Date object (typically from a date picker)
 * @returns YYYY-MM-DD string in local timezone
 */
export function toDayString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string into a Date object representing that LOCAL day.
 * The time is set to noon to avoid any DST edge cases.
 *
 * @param dayString - YYYY-MM-DD string
 * @returns Date object set to noon local time on that day, or null if invalid
 */
export function parseDayString(dayString: string | null | undefined): Date | null {
  if (!dayString || typeof dayString !== 'string') {
    return null;
  }

  const match = dayString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
  const day = parseInt(match[3], 10);

  // Set to noon to avoid DST edge cases
  const date = new Date(year, month, day, 12, 0, 0, 0);
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * computeDueDay - Extracts the canonical YYYY-MM-DD string from an ISO date/datetime
 *
 * This is the single source of truth for computing due_day from a due_at or due_date.
 * Used when creating or updating todos to ensure due_day is always set correctly.
 *
 * IMPORTANT: This function handles a tricky timezone edge case:
 * - Database stores dates like "2025-11-26T00:00:00+00:00" (UTC midnight)
 * - In PST (UTC-8), parsing this gives Nov 25 4pm local time
 * - We detect this pattern and extract the date portion directly
 *
 * For timestamps with actual times (not midnight), we use local timezone:
 * - "2025-11-26T17:00:00-08:00" (5pm PST) → due_day = "2025-11-26"
 *
 * @param isoDate - ISO 8601 date/datetime string (e.g., "2025-11-26T17:00:00.000Z" or "2025-11-26")
 * @returns YYYY-MM-DD string, or null if parsing fails
 */
export function computeDueDay(isoDate: string | null | undefined): string | null {
  if (!isoDate || typeof isoDate !== 'string') {
    return null;
  }

  try {
    // Check if this is a date-only string (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      return isoDate;
    }

    // Check for UTC midnight pattern: "YYYY-MM-DDT00:00:00+00:00" or "YYYY-MM-DDT00:00:00Z"
    // These are typically dates from the database that should NOT be shifted by local timezone
    const utcMidnightMatch = isoDate.match(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?(?:Z|\+00:00)$/);
    if (utcMidnightMatch) {
      // Extract the date portion directly without timezone conversion
      return utcMidnightMatch[1];
    }

    // For all other timestamps, parse and extract local date
    const dateObj = new Date(isoDate);
    if (isNaN(dateObj.getTime())) {
      return null;
    }

    // Extract year, month, day in LOCAL timezone
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Extract HH:mm time portion from an ISO date/datetime string
 * Returns null if time is midnight (00:00) or parsing fails
 *
 * @param isoDate - ISO 8601 date/datetime string
 * @returns HH:mm string in local timezone, or null if midnight or invalid
 */
export function computeDueTime(isoDate: string | null | undefined): string | null {
  if (!isoDate || typeof isoDate !== 'string') {
    return null;
  }

  try {
    const dateObj = new Date(isoDate);
    if (isNaN(dateObj.getTime())) {
      return null;
    }

    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;

    // Return null for midnight (no specific time set)
    return time === '00:00' ? null : time;
  } catch {
    return null;
  }
}
