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
  /** ISO 8601 timestamp - fallback if dueDay not available */
  dueIso?: string | null;
  /** HH:mm format time string - optional specific time */
  dueTime?: string | null;
}

/**
 * Formats due date for human-friendly display.
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
  let isoForTimeExtraction: string | null | undefined;

  if (typeof optionsOrDueIso === 'string') {
    // Legacy: passed a string directly - extract date portion
    // Use extractDateFromIso (no range validation) for display purposes
    dueDay = dateService.extractDateFromIso(optionsOrDueIso);
    isoForTimeExtraction = optionsOrDueIso;
  } else if (optionsOrDueIso && typeof optionsOrDueIso === 'object') {
    // New: passed options object - prefer dueDay
    dueDay = optionsOrDueIso.dueDay;
    dueTime = optionsOrDueIso.dueTime;

    // Fallback to dueIso if dueDay not provided
    if (!dueDay && optionsOrDueIso.dueIso) {
      dueDay = dateService.extractDateFromIso(optionsOrDueIso.dueIso);
      isoForTimeExtraction = optionsOrDueIso.dueIso;
    }
  }

  // If no date, return default
  if (!dueDay) return 'no deadline yet';

  // Extract time from ISO string if dueTime not provided
  if (!dueTime && isoForTimeExtraction) {
    dueTime = extractTimeFromIso(isoForTimeExtraction);
  }

  // Format the date
  const formatted = dateService.formatForChip(dueDay);

  // Add time suffix if present (skip midnight 00:00)
  const timeStr = dueTime && dueTime !== '00:00' ? ` @ ${dueTime}` : '';

  return `due ${formatted}${timeStr}`;
}

/**
 * Extract HH:mm time from ISO string. Returns null for midnight or invalid.
 */
function extractTimeFromIso(isoDate: string): string | null {
  try {
    const dateObj = new Date(isoDate);
    if (isNaN(dateObj.getTime())) return null;

    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;

    return time === '00:00' ? null : time;
  } catch {
    return null;
  }
}
