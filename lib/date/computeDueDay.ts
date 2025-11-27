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
