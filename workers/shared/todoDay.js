/**
 * todoDay.js: which day a todo is on, and when it is overdue. One rule for the
 * app and both Workers (Mind Drop rethink stage 2c, 9 Oct 2026).
 *
 * A todo is on the day the person plans to do it: due_day, or scheduled_date
 * when only that is set. A todo with no planned day but a deadline
 * (target_date) is on its deadline day: due that day, and overdue once the
 * deadline has passed. A deadline never moves a todo that has a planned day,
 * and a deadline only todo still has no planned day, so the morning quick
 * sweep goes on asking when to do it.
 *
 * Days are YYYY-MM-DD in the person's own day (DateService in the app,
 * personDay in the Workers), so they compare as strings. Whether a todo is
 * open (not completed, not archived) is the caller's business.
 */

/** The date part of a date column's value, or null. */
export function dayOnly(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const day = value.slice(0, 10);
  return day[4] === '-' && day[7] === '-' ? day : null;
}

/** The day they plan to do it, or null. */
export function plannedDayOf(todo) {
  return dayOnly(todo?.due_day) || dayOnly(todo?.scheduled_date) || null;
}

/** The deadline, or null. */
export function deadlineOf(todo) {
  return dayOnly(todo?.target_date);
}

/**
 * The day a todo is on: its planned day, else its deadline, else null. A
 * caller with its own planned day (one that also reads a legacy timestamp)
 * passes it in.
 */
export function todoDayOf(todo, planned = plannedDayOf(todo)) {
  return planned || deadlineOf(todo) || null;
}

/** What puts a todo on its day: 'planned', 'deadline', or null when it has none. */
export function todoDayKind(todo, planned = plannedDayOf(todo)) {
  if (planned) return 'planned';
  return deadlineOf(todo) ? 'deadline' : null;
}

/** On this day: planned for it, or a deadline only todo due that day. */
export function isTodoOn(todo, day, planned = plannedDayOf(todo)) {
  const d = todoDayOf(todo, planned);
  return d !== null && d === day;
}

/** Overdue: its day, planned or deadline, has passed. */
export function isTodoOverdue(todo, today, planned = plannedDayOf(todo)) {
  const d = todoDayOf(todo, planned);
  return d !== null && d < today;
}

/** On or before this day: due that day or overdue by then. */
export function isTodoOnOrBefore(todo, day, planned = plannedDayOf(todo)) {
  const d = todoDayOf(todo, planned);
  return d !== null && d <= day;
}

/** No day at all: neither a planned day nor a deadline. */
export function isTodoUndated(todo, planned = plannedDayOf(todo)) {
  return todoDayOf(todo, planned) === null;
}

/** A deadline and no planned day: due on the deadline, waiting for a day. */
export function hasUnscheduledDeadline(todo, planned = plannedDayOf(todo)) {
  return !planned && deadlineOf(todo) !== null;
}

/**
 * Deadline wording for a todo that is on its day by its deadline: 'Due today'
 * on the deadline, 'Overdue' once it has passed, and null for any other todo
 * (a planned day, no deadline, or a deadline still ahead, which the caller
 * words with its own day format).
 */
export function deadlineWords(todo, today, planned = plannedDayOf(todo)) {
  if (!hasUnscheduledDeadline(todo, planned)) return null;
  const d = deadlineOf(todo);
  if (d === today) return 'Due today';
  return d < today ? 'Overdue' : null;
}

const FILTER_OPS = new Set(['eq', 'lt', 'lte', 'gt', 'gte']);

/**
 * The same rule as a PostgREST filter for a todos query: todos whose day
 * (planned, else deadline) compares with `day` by `op` (eq, lt, lte, gt or
 * gte). Use as `or=(${todoDayFilter('eq', day)})`.
 */
export function todoDayFilter(op, day) {
  if (!FILTER_OPS.has(op)) throw new Error(`todoDayFilter: unknown op ${op}`);
  return `due_day.${op}.${day},and(due_day.is.null,scheduled_date.${op}.${day}),and(due_day.is.null,scheduled_date.is.null,target_date.${op}.${day})`;
}

/** Todos whose day (planned, else deadline) is from `first` to `last`, as a PostgREST or-filter. */
export function todoDayRangeFilter(first, last) {
  return `and(due_day.gte.${first},due_day.lte.${last}),and(due_day.is.null,scheduled_date.gte.${first},scheduled_date.lte.${last}),and(due_day.is.null,scheduled_date.is.null,target_date.gte.${first},target_date.lte.${last})`;
}

/**
 * Todos on this day or before it (due or overdue), as a PostgREST or-filter.
 * Use as `or=(${todoOnOrBeforeFilter(day)})`.
 */
export function todoOnOrBeforeFilter(day) {
  return todoDayFilter('lte', day);
}
