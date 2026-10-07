/**
 * The summary for the week a day is in: the one whose seven days include it.
 *
 * A summary covers the seven days that end on the person's weekly day, Monday
 * to Sunday for a Sunday, and is written on that last day. So a week does not
 * have to start on a Monday, and nothing here asks which day it starts on.
 * For a week that does start on a Monday this is the summary that starts on
 * the Monday of the day's own week, as it always was. When two weeks overlap,
 * after the weekly day moved, the later one is theirs.
 */
import { addDays, isDay } from '../week/model';

export function summaryForDay<T extends { week_start_date?: string | null }>(
  summaries: readonly T[],
  day: string,
): T | undefined {
  let found: T | undefined;
  let foundStart = '';
  for (const s of summaries) {
    const start = String(s.week_start_date ?? '').slice(0, 10);
    if (!isDay(start) || start > day || day > addDays(start, 6)) continue;
    if (start > foundStart) {
      found = s;
      foundStart = start;
    }
  }
  return found;
}
