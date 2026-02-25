/**
 * Ritual Day Helper
 *
 * Handles "ritual day" calculations based on a configurable day boundary.
 * This allows users who stay up late to have their day "end" at a time
 * that makes sense for them (e.g., 3am instead of midnight).
 *
 * Example: If day boundary is 4am and it's currently 2am on Jan 10th,
 * the ritual day is still Jan 9th because the user hasn't "slept" yet.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Day Boundary Options
// ─────────────────────────────────────────────────────────────────────────────

export interface DayBoundaryOption {
  /** Hour value (0-23) */
  value: number;
  /** Human-readable label */
  label: string;
}

/**
 * Available day boundary options for user selection.
 * These represent when a "new day" begins for ritual tracking.
 */
export const DAY_BOUNDARY_OPTIONS: DayBoundaryOption[] = [
  { value: 0, label: 'Midnight' },
  { value: 3, label: '3:00 AM' },
  { value: 5, label: '5:00 AM' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current "ritual day" based on day boundary and timezone.
 *
 * If the current hour is before the day boundary, we consider it still
 * "yesterday" from a ritual perspective. This helps users who stay up
 * late track their habits/rituals in a way that matches their lifestyle.
 *
 * @param dayBoundaryHour - Hour (0-23) when the new day begins (default: 4am)
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns YYYY-MM-DD string for the current ritual day
 *
 * @example
 * // At 2am on Jan 10th with 4am boundary → returns "2026-01-09"
 * getRitualDay(4, 'America/New_York');
 *
 * // At 5am on Jan 10th with 4am boundary → returns "2026-01-10"
 * getRitualDay(4, 'America/New_York');
 */
export function getRitualDay(
  dayBoundaryHour: number = 4,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const now = new Date();

  // Get current time in the specified timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);

  // If current hour is before the day boundary, it's still "yesterday"
  if (hour < dayBoundaryHour) {
    // Create a date object for the current day in the timezone, then subtract one day
    const currentDate = new Date(`${year}-${month}-${day}T12:00:00`);
    currentDate.setDate(currentDate.getDate() - 1);

    const yesterdayYear = currentDate.getFullYear();
    const yesterdayMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
    const yesterdayDay = String(currentDate.getDate()).padStart(2, '0');

    return `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;
  }

  return `${year}-${month}-${day}`;
}

/**
 * Get a human-readable label for a day boundary hour.
 *
 * @param hour - Hour value (0-23)
 * @returns Human-readable label (e.g., "4:00 AM", "Midnight")
 *
 * @example
 * getDayBoundaryLabel(0);  // "Midnight"
 * getDayBoundaryLabel(4);  // "4:00 AM"
 * getDayBoundaryLabel(12); // "12:00 PM"
 */
export function getDayBoundaryLabel(hour: number): string {
  // Check if it's in our predefined options first
  const option = DAY_BOUNDARY_OPTIONS.find((opt) => opt.value === hour);
  if (option) {
    return option.label;
  }

  // Otherwise, generate a label
  if (hour === 0) {
    return 'Midnight';
  } else if (hour === 12) {
    return '12:00 PM';
  } else if (hour < 12) {
    return `${hour}:00 AM`;
  } else {
    return `${hour - 12}:00 PM`;
  }
}

/**
 * Check if the current time is within the "late night" period
 * (between midnight and the day boundary).
 *
 * Useful for showing contextual UI like "Still counting as yesterday"
 *
 * @param dayBoundaryHour - Hour (0-23) when the new day begins
 * @param timezone - IANA timezone string
 * @returns true if current hour is between 0 and dayBoundaryHour
 */
export function isInLateNightPeriod(
  dayBoundaryHour: number = 4,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): boolean {
  if (dayBoundaryHour === 0) {
    return false; // No late night period if boundary is midnight
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });

  const hour = parseInt(formatter.format(now), 10);
  return hour >= 0 && hour < dayBoundaryHour;
}

/**
 * Get the number of hours until the next day boundary.
 *
 * Useful for showing "X hours until new day" messages.
 *
 * @param dayBoundaryHour - Hour (0-23) when the new day begins
 * @param timezone - IANA timezone string
 * @returns Number of hours until the next day boundary
 */
export function getHoursUntilDayBoundary(
  dayBoundaryHour: number = 4,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });

  const currentHour = parseInt(formatter.format(now), 10);

  if (currentHour < dayBoundaryHour) {
    // We're in the late night period, boundary is later today
    return dayBoundaryHour - currentHour;
  } else {
    // Boundary is tomorrow
    return 24 - currentHour + dayBoundaryHour;
  }
}
