/**
 * The day being wrapped up, read from the clock: the person's day (which
 * after midnight is still yesterday until their day ends), the day after it,
 * and the words for both.
 */
import { getDateService } from '../date/DateService';
import { localMinutesToIso } from '../brief/time';
import type { WrapDay } from './words';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface WrapNow {
  /** The person's day, YYYY-MM-DD */
  day: string;
  /** The day after it */
  tomorrow: string;
  words: WrapDay;
  /** From 5pm, or after midnight before their day ends */
  evening: boolean;
  dayEndHour: number;
  /** When their day started, in ms */
  dayStartMs: number;
}

export function weekdayOf(day: string): string {
  const d = getDateService().fromLocalDate(day);
  return d ? WEEKDAYS[d.getDay()] : '';
}

export function wrapNow(): WrapNow {
  const ds = getDateService();
  const day = ds.ritualDay();
  const tomorrow = ds.addDays(day, 1);
  const late = ds.isInLateNightPeriod();
  const dayEndHour = ds.getDayBoundaryHour();
  return {
    day,
    tomorrow,
    words: { weekday: weekdayOf(day), tomorrow: late ? weekdayOf(tomorrow) : 'tomorrow', late },
    evening: late || ds.getHour() >= 17,
    dayEndHour,
    // in the person's time zone, which is not always the phone's
    dayStartMs: new Date(localMinutesToIso(day, dayEndHour * 60)).getTime(),
  };
}

/**
 * The word on a button for the day after the person's day: "Tomorrow", or
 * its weekday after midnight, when the clock already says that day and
 * "tomorrow" would be read as the day after it.
 */
export function tomorrowLabel(): string {
  const ds = getDateService();
  if (!ds.isInLateNightPeriod()) return 'Tomorrow';
  return weekdayOf(ds.addDays(ds.ritualDay(), 1)) || 'Tomorrow';
}
