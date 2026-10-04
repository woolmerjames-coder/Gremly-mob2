/**
 * The day being wrapped up, read from the clock: the person's day (which
 * after midnight is still yesterday until their day ends), the day after it,
 * and the words for both.
 */
import { getDateService } from '../date/DateService';
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
  return {
    day,
    tomorrow,
    words: { weekday: weekdayOf(day), tomorrow: late ? weekdayOf(tomorrow) : 'tomorrow', late },
    evening: late || ds.getHour() >= 17,
    dayEndHour: ds.getDayBoundaryHour(),
    dayStartMs: ds.startOfRitualDay(day).getTime(),
  };
}
