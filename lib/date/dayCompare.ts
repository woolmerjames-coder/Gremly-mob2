/**
 * isToday and friends, for a Date that stands for a day (a due date, a key
 * date, as parseISO gives it).
 *
 * date-fns's versions read the clock, so after midnight they disagree with
 * the person's day (DateService.today(), which lasts until their day end).
 * These have the same names and take the same Date, and compare its day with
 * the person's day instead. Import these where a screen asks "is this day
 * today?".
 *
 * For a moment something happened (made, done, logged), use
 * getDateService().dayOf(moment) and compare that with today().
 */
import { getDateService } from './DateService';

const dayOfDate = (date: Date): string => getDateService().toLocalDate(date);

/** The day is the person's today. */
export function isToday(date: Date): boolean {
  return dayOfDate(date) === getDateService().today();
}

/** The day is the day after the person's today. */
export function isTomorrow(date: Date): boolean {
  return dayOfDate(date) === getDateService().tomorrow();
}

/** The day is the day before the person's today. */
export function isYesterday(date: Date): boolean {
  return dayOfDate(date) === getDateService().yesterday();
}

/** The day is before the person's today. */
export function isPast(date: Date): boolean {
  const day = dayOfDate(date);
  return !!day && day < getDateService().today();
}

/** The day is after the person's today. */
export function isFuture(date: Date): boolean {
  const day = dayOfDate(date);
  return !!day && day > getDateService().today();
}
