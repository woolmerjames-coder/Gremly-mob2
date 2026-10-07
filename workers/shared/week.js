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

/** The weekly pipe starts this many hours before their weekly slot: the synthesis, then the read. */
export const PIPE_LEAD_HOURS = 3;

/**
 * Whether the read is made ahead only for someone who finished a review in the
 * last READ_AHEAD_DAYS days. Off: it is made ahead for everyone the pipe runs
 * for (James, 6 Oct: at this size that is a few cents a week). The rule stays
 * in the pipe behind this, so it can come back when the numbers call for it.
 */
export const READ_AHEAD_NEEDS_REVIEW = false;

/** How far back a finished review counts, for the rule above and for the read's own look back. */
export const READ_AHEAD_DAYS = 28;

/** The read looks this many days ahead for what is dated. */
export const LOOK_AHEAD_DAYS = 42;

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

/**
 * The review an opening today is, given the week's row: what the date says
 * (reviewOn), except that a review already under way is carried on. One
 * started in its own window and opened again on a later day of the same week
 * is still that review, with the read it began with: it is not begun again as
 * the week's one extra, and it does not use the extra up. It plans from today,
 * since the days before are gone.
 * @param {string} today
 * @param {number} weeklyDay
 * @param {{week_start?: string, status?: string, kind?: string}|null} row the
 *   row of the week reviewOn gives for today
 * @returns {{kind: 'weekly'|'extra'|'brought_forward', promoted: boolean, fresh: boolean,
 *   resumed?: boolean, week_start: string, span_start: string, span_end: string}}
 */
export function reviewWith(today, weeklyDay, row) {
  const on = reviewOn(today, weeklyDay);
  if (
    on.kind === 'extra' &&
    row?.status === 'started' &&
    row.week_start === on.week_start &&
    REVIEW_KINDS.includes(row.kind) &&
    row.kind !== 'extra'
  ) {
    return { ...on, kind: row.kind, fresh: false, resumed: true };
  }
  return on;
}

/**
 * Whether a morning brief offers the weekly review: on each of the days after
 * their weekly day while it is still promoted, until it is done or they said
 * not this week. On the weekly day itself the evening offers it.
 * @param {{week_start?: string, status?: string}|null} row the review of the
 *   week that day is in
 */
export function briefOffersReview(today, weeklyDay, row) {
  const c = cycleOf(today, weeklyDay);
  if (c.since < 1 || c.since > PROMOTED_AFTER) return false;
  const mine = row && row.week_start === c.week_start ? row : null;
  return mine?.status !== 'done' && mine?.status !== 'skipped';
}

/**
 * What the evening wrap up's close offers about the week, from their weekly
 * day through the two days after: 'plan' until the review is done, 'see' once
 * it is, and nothing when they said not this week or on any other day.
 * @param {{week_start?: string, status?: string}|null} row the review of the
 *   week that starts after the weekly day
 * @returns {'plan'|'see'|null}
 */
export function closeOffersWeek(today, weeklyDay, row) {
  const c = cycleOf(today, weeklyDay);
  if (c.since > PROMOTED_AFTER) return null;
  const mine = row && row.week_start === c.week_start ? row : null;
  if (mine?.status === 'done') return 'see';
  return mine?.status === 'skipped' ? null : 'plan';
}

/**
 * The week a weekly summary covers: the seven days that end on their weekly
 * day, the one on or after the day given. With Sunday that is Monday to Sunday.
 * @returns {{start: string, end: string}}
 */
export function summaryWeekOf(day, weeklyDay) {
  const c = cycleOf(day, weeklyDay);
  const end = c.since === 0 ? day : c.next;
  return { start: addDays(end, -6), end };
}

/**
 * Whether the read a week's row holds serves a review started today
 * (reviewOn): any read serves the weekly review and a week brought forward;
 * the one extra review of a week is served only by the read made for it.
 * @param {{kind: string}} review what reviewOn gave for today
 * @param {{kind?: string, read?: object|null}|null} row the week's row
 */
export function readServes(review, row) {
  if (!row || !row.read || typeof row.read !== 'object') return false;
  return review?.kind !== 'extra' || row.kind === 'extra';
}

/** The one extra review of a week is used once the week's row is the extra's. */
export function extraUsed(row) {
  return row?.kind === 'extra';
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
