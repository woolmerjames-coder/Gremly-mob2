/**
 * The person's week: the date rules of the weekly review, shared by both
 * Workers and the app (lib/week). Pure: no clock and no I/O; today comes in.
 *
 * Everything weekly runs on the person's own day, Sunday unless they choose
 * another. Their week is the seven days after it, so a Sunday review plans
 * Monday to Sunday. A cycle starts on the weekly day and runs until the day
 * before the next one; the review of a cycle plans the week that starts the
 * day after the weekly day.
 *
 * Days are YYYY-MM-DD. Weekdays are 0 Sunday to 6 Saturday. Everything here is
 * decided by dates and numbers alone, never by anyone's words.
 */

export const DEFAULT_WEEKLY_DAY = 0;
export const DEFAULT_DAYS_OFF = [6, 0];

/** The review is promoted on the weekly day and this many days after it. */
export const PROMOTED_AFTER = 2;

/** A Later comes back within this many days. */
export const LATER_MAX_DAYS = 28;

/** A todo with no length counts as this many minutes when a day's room is worked out. */
export const DEFAULT_MINUTES = 30;

/** Free hours on a day go in half hour steps, up to this many. */
export const HOURS_MAX = 16;

/** The three kinds of day a week's free hours are set for. */
export const DAY_KINDS = ['normal_day', 'busy_day', 'weekend_day'];

export const REVIEW_KINDS = ['weekly', 'extra', 'brought_forward'];
export const REVIEW_STATES = ['ready', 'started', 'done', 'skipped'];

/** Where a review is, in order (lib/week useWeekReview). */
export const WEEK_STEPS = [
  'offer',
  'challenge',
  'priorities',
  'shape',
  'intention',
  'ahead',
  'needs_you',
  'board',
  'done',
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function utcNoon(day) {
  return new Date(`${day}T12:00:00Z`);
}

/** A real calendar date as YYYY-MM-DD. */
export function isDay(v) {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const d = utcNoon(v);
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}

export function addDays(day, n) {
  const d = utcNoon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b; negative when b is earlier. */
export function daysBetween(a, b) {
  return Math.round((utcNoon(b) - utcNoon(a)) / 864e5);
}

/** 0 Sunday to 6 Saturday. */
export function weekdayOf(day) {
  return utcNoon(day).getUTCDay();
}

/** Their weekly day as a weekday, Sunday when it is not set. */
export function weeklyDayOf(v) {
  return Number.isInteger(v) && v >= 0 && v <= 6 ? v : DEFAULT_WEEKLY_DAY;
}

/** Their days off as weekdays, in order from Sunday; Saturday and Sunday when not set. */
export function daysOffOf(v) {
  if (!Array.isArray(v)) return [...DEFAULT_DAYS_OFF].sort();
  return [...new Set(v.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
}

/**
 * The cycle a day is in: the weekly day that began it, the week it plans, and
 * the next weekly day.
 * @returns {{since: number, start: string, week_start: string, week_end: string, next: string}}
 */
export function cycleOf(today, weeklyDay) {
  const since = (weekdayOf(today) - weeklyDayOf(weeklyDay) + 7) % 7;
  const start = addDays(today, -since);
  return {
    // days since the weekly day: 0 on the weekly day itself
    since,
    start,
    week_start: addDays(start, 1),
    week_end: addDays(start, 7),
    next: addDays(start, 7),
  };
}

/**
 * What a review started on a day plans, and whether it uses the read made for
 * the weekly day or a fresh one.
 * - The weekly day, or either of the two days after: the rest of the new week,
 *   with the read made for the weekly day.
 * - The day before the weekly day: next week, brought forward, on a fresh read.
 * - Any other day: the rest of this week, on a fresh read (the one extra a week).
 * @returns {{kind: 'weekly'|'extra'|'brought_forward', promoted: boolean, fresh: boolean,
 *   week_start: string, span_start: string, span_end: string}}
 */
export function reviewOn(today, weeklyDay) {
  const c = cycleOf(today, weeklyDay);
  if (c.since <= PROMOTED_AFTER) {
    return {
      kind: 'weekly',
      promoted: true,
      fresh: false,
      week_start: c.week_start,
      span_start: today > c.week_start ? today : c.week_start,
      span_end: c.week_end,
    };
  }
  if (c.since === 6) {
    const start = addDays(c.week_start, 7);
    return {
      kind: 'brought_forward',
      promoted: false,
      fresh: true,
      week_start: start,
      span_start: start,
      span_end: addDays(start, 6),
    };
  }
  return {
    kind: 'extra',
    promoted: false,
    fresh: true,
    week_start: c.week_start,
    span_start: today,
    span_end: c.week_end,
  };
}

/** Every day from first to last, at most two weeks of them. */
export function spanDays(first, last) {
  if (!isDay(first) || !isDay(last) || last < first) return [];
  const days = [first];
  while (days.length < 14 && days[days.length - 1] < last) {
    days.push(addDays(days[days.length - 1], 1));
  }
  return days;
}

/**
 * The kind of day a date is for the week's free hours: a busy day when they
 * said so, a day off when it falls on one of their days off, otherwise normal.
 */
export function dayKind(day, { daysOff, busyDays } = {}) {
  if (Array.isArray(busyDays) && busyDays.includes(day)) return 'busy_day';
  return daysOffOf(daysOff).includes(weekdayOf(day)) ? 'weekend_day' : 'normal_day';
}

/** Free hours in half hour steps, from none to HOURS_MAX, or undefined. */
export function normHours(v) {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  const r = Math.round(n * 2) / 2;
  return r >= 0 && r <= HOURS_MAX ? r : undefined;
}

/** The minutes a todo or a habit takes on a day's room. */
export function minutesOf(item) {
  const m = item?.time_estimate_minutes ?? item?.minutes;
  return Number.isInteger(m) && m > 0 ? m : DEFAULT_MINUTES;
}

/**
 * A day's room: the minutes its kind of day gives, what is placed on it, and
 * what is left. Left is null when no hours are set for that kind of day.
 * @param {{normal_day?: number, busy_day?: number, weekend_day?: number}|null} hours
 * @param {string} kind one of DAY_KINDS
 * @param {number} placed minutes placed on the day
 */
export function dayRoom(hours, kind, placed) {
  const h = normHours(hours?.[kind]);
  if (h === undefined) return { minutes: null, placed, left: null };
  const minutes = Math.round(h * 60);
  return { minutes, placed, left: minutes - placed };
}
