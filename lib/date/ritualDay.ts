/**
 * Ritual Day Helper — DEPRECATED thin wrapper
 *
 * All logic now lives in DateService. This file re-exports for backward
 * compatibility. New code should import from DateService directly.
 *
 * @deprecated Import from './DateService' instead.
 */

import {
  DateService,
  createDateService,
  getDateService,
  DAY_BOUNDARY_OPTIONS,
  type DayBoundaryOption,
} from './DateService';

// Re-export types and constants
export { DAY_BOUNDARY_OPTIONS };
export type { DayBoundaryOption };

/**
 * @deprecated Use `getDateService().ritualDay()` instead.
 *
 * Get the current "ritual day" based on day boundary and timezone.
 * If custom params differ from the singleton, creates a temporary DateService.
 */
export function getRitualDay(
  dayBoundaryHour: number = 4,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const singleton = getDateService();
  if (
    dayBoundaryHour === singleton.getDayBoundaryHour() &&
    timezone === singleton.getTimezone()
  ) {
    return singleton.ritualDay();
  }
  const tmp = createTempService(dayBoundaryHour, timezone);
  return tmp.ritualDay();
}

/**
 * @deprecated Use `getDateService().getDayBoundaryHour()` with
 * `DAY_BOUNDARY_OPTIONS` instead.
 */
export function getDayBoundaryLabel(hour: number): string {
  const option = DAY_BOUNDARY_OPTIONS.find((opt) => opt.value === hour);
  if (option) return option.label;
  if (hour === 0) return 'Midnight';
  if (hour === 12) return '12:00 PM';
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

/**
 * @deprecated Use `getDateService().isInLateNightPeriod()` instead.
 */
export function isInLateNightPeriod(
  dayBoundaryHour: number = 4,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): boolean {
  const singleton = getDateService();
  if (
    dayBoundaryHour === singleton.getDayBoundaryHour() &&
    timezone === singleton.getTimezone()
  ) {
    return singleton.isInLateNightPeriod();
  }
  const tmp = createTempService(dayBoundaryHour, timezone);
  return tmp.isInLateNightPeriod();
}

/**
 * @deprecated Use `getDateService().getHoursUntilDayBoundary()` instead.
 */
export function getHoursUntilDayBoundary(
  dayBoundaryHour: number = 4,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): number {
  const singleton = getDateService();
  if (
    dayBoundaryHour === singleton.getDayBoundaryHour() &&
    timezone === singleton.getTimezone()
  ) {
    return singleton.getHoursUntilDayBoundary();
  }
  const tmp = createTempService(dayBoundaryHour, timezone);
  return tmp.getHoursUntilDayBoundary();
}

// Helper: create a one-off DateService with custom params (no singleton mutation)
function createTempService(dayBoundaryHour: number, timezone: string) {
  return new DateService({ dayBoundaryHour, timezone });
}
