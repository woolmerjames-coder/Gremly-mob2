/**
 * DEPRECATED: Use DateService instead
 *
 * This file is kept for backward compatibility during migration.
 * All new code should use:
 *   import { getDateService } from './DateService';
 *   const dateService = getDateService();
 *
 * Migration guide:
 *   getTodayDayString() → dateService.getCurrentDate()
 *   toDayString(date) → dateService.toDateString(date)
 *   parseDayString(str) → dateService.fromDateString(str)
 *   computeDueDay(iso) → dateService.parseAIDate(iso)
 *   computeDueTime(iso) → extract time manually or use DateService
 *
 * @deprecated This entire module will be removed in a future version
 */

import { getDateService } from './DateService';

/**
 * @deprecated Use getDateService().getCurrentDate() instead
 */
export function getTodayDayString(): string {
  return getDateService().getCurrentDate();
}

/**
 * @deprecated Use getDateService().toDateString(date) instead
 */
export function toDayString(date: Date): string {
  // eslint-disable-next-line no-restricted-syntax -- toDateString is a DateService method, not Date.prototype.toDateString
  return getDateService().toDateString(date);
}

/**
 * @deprecated Use getDateService().fromDateString(str) instead
 */
export function parseDayString(dayString: string | null | undefined): Date | null {
  return getDateService().fromDateString(dayString);
}

/**
 * @deprecated Use getDateService().extractDateFromIso(isoDate) instead
 */
export function computeDueDay(isoDate: string | null | undefined): string | null {
  return getDateService().extractDateFromIso(isoDate);
}

/**
 * Extract HH:mm time portion from an ISO date/datetime string.
 * Returns null if time is midnight (00:00) or parsing fails.
 *
 * Note: This function is kept as-is since DateService doesn't have a direct equivalent.
 * Consider adding time extraction to DateService if needed frequently.
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

    return time === '00:00' ? null : time;
  } catch {
    return null;
  }
}
