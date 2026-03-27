/**
 * DEPRECATED: Use DateService instead
 *
 * This file is kept for backward compatibility during migration.
 * All new code should use:
 *   import { getDateService } from './DateService';
 *   const dateService = getDateService();
 *
 * Migration guide:
 *   getTodayDayString() → dateService.today()
 *   toDayString(date) → dateService.toLocalDate(date)
 *   parseDayString(str) → dateService.fromLocalDate(str)
 *   computeDueDay(iso) → dateService.parseAIDate(iso)
 *   computeDueTime(iso) → extract time manually or use DateService
 *
 * @deprecated This entire module will be removed in a future version
 */

import { getDateService } from './DateService';

/**
 * @deprecated Use getDateService().today() instead
 */
export function getTodayDayString(): string {
  return getDateService().today();
}

/**
 * @deprecated Use getDateService().toLocalDate(date) instead
 */
export function toDayString(date: Date): string {
  return getDateService().toLocalDate(date);
}

/**
 * @deprecated Use getDateService().fromLocalDate(str) instead
 */
export function parseDayString(dayString: string | null | undefined): Date | null {
  return getDateService().fromLocalDate(dayString);
}

/**
 * @deprecated Use getDateService().extractLocalDate(isoDate) instead
 */
export function computeDueDay(isoDate: string | null | undefined): string | null {
  return getDateService().extractLocalDate(isoDate);
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
