/**
 * formatDue - Human-friendly due date formatting
 *
 * This is a thin wrapper around DateService for backward compatibility.
 * New code should use DateService directly via useDateService() hook.
 *
 * @deprecated Use dateService.formatForChip() or dateService.formatForOverlay() instead
 */

import { getDateService } from './DateService';

export interface FormatDueOptions {
  /** YYYY-MM-DD format date string - canonical, timezone-safe */
  dueDay?: string | null;
  /** ISO 8601 timestamp - fallback if dueDay not available (date extraction only) */
  dueIso?: string | null;
  /** HH:mm format time string - optional specific time (from due_time column) */
  dueTime?: string | null;
}

/**
 * Formats due date for human-friendly display.
 *
 * NOTE: Time is ONLY shown if explicitly passed via dueTime parameter.
 * We no longer extract time from ISO strings to avoid timezone bugs
 * (e.g., UTC midnight displaying as "@ 16:00" in PST).
 *
 * @deprecated Use dateService.formatForChip() for short format
 * @param optionsOrDueIso - Either FormatDueOptions object or legacy ISO string
 * @returns Human-friendly due date string like "due Today", "due Tomorrow", "due Mon"
 */
export function formatDue(optionsOrDueIso?: FormatDueOptions | string | null): string {
  const dateService = getDateService();

  // Handle legacy signature: formatDue(dueIso)
  let dueDay: string | null | undefined;
  let dueTime: string | null | undefined;

  if (typeof optionsOrDueIso === 'string') {
    // Legacy: passed a string directly - extract date portion only
    // No time extraction to avoid timezone bugs
    dueDay = dateService.extractDateFromIso(optionsOrDueIso);
  } else if (optionsOrDueIso && typeof optionsOrDueIso === 'object') {
    // New: passed options object - prefer dueDay
    dueDay = optionsOrDueIso.dueDay;
    dueTime = optionsOrDueIso.dueTime;

    // Fallback to dueIso for date if dueDay not provided
    if (!dueDay && optionsOrDueIso.dueIso) {
      dueDay = dateService.extractDateFromIso(optionsOrDueIso.dueIso);
    }
  }

  // If no date, return default
  if (!dueDay) return 'no deadline yet';

  // Format the date
  const formatted = dateService.formatForChip(dueDay);

  // Add time suffix if explicitly provided (skip midnight 00:00)
  const timeStr = dueTime && dueTime !== '00:00' ? ` @ ${dueTime}` : '';

  return `due ${formatted}${timeStr}`;
}
