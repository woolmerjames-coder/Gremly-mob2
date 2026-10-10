/**
 * How many cards Sweep would show right now, so a notification never names a
 * number the app does not. The rules are the app's own,
 * selectSweepCandidatesUnified in lib/store/selectors.ts: keep the two in step.
 *
 * Todos: open, not resurfacing later; overdue, due
 * today, undated, skipped in an earlier Sweep, or resurfacing today. A todo's
 * day is its planned day, or with none its deadline (shared/todoDay.js); one
 * with no day planned is always a card, as Sweep asks for a day.
 * Notes: an idea from the last week, a list, reference or catch all made
 * today, an upcoming event Gremly holds, a skipped one, or one resurfacing
 * today. Swept notes stay out.
 * Any todo, note or habit with a question Sweep asks is a card whatever its
 * kind or day (rowAsks below, the app's ask rules in lib/minddrop/asks.ts):
 * the wrap up asks those made that day, the quick sweep those made that day
 * or the day before. Keep the two in step: both run the shared cases in
 * workers/shared/sweepAskCases.json.
 */
import { db } from '../context/db';
import { addDays, localDateOf } from './reminderTimes';
import { minutesIn } from '../../shared/calendar.js';
import { DEFAULT_DAY_END_HOUR, personDay } from '../../shared/day.js';
// Which day a todo is on: its planned day, else its deadline (stage 2c, 9 Oct 2026)
import { isTodoOnOrBefore, isTodoOverdue, plannedDayOf } from '../../shared/todoDay.js';

const relationPending = (rel) =>
  !!rel && typeof rel === 'object' && !!rel.classified && rel.status === 'pending';

/** Days from one day to another (YYYY-MM-DD). */
function daysFrom(from, to) {
  const at = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((at(to) - at(from)) / 86400000);
}

/** The person's day a row was made on (the app's DateService.dayOf). */
function dayMade(row, tz, dayEndHour) {
  if (!row.created_at) return null;
  return personDay(
    localDateOf(new Date(row.created_at), tz),
    minutesIn(tz, row.created_at),
    dayEndHour,
  );
}

/**
 * A question Sweep asks on the row (the app's sweepAskOf, lib/minddrop/asks.ts,
 * Mind Drop rethink stage 8): a pending relation or same, an unsure split
 * (views.split.status pending) or an unanswered question, asked on its day
 * (views.ask_since, else the day the row was made). Live until the day after
 * that day is over; the wrap up ('wrapup') asks those made that day, the quick
 * sweep ('quick') those made that day or the day before. An older build's note
 * still waiting on a split is never asked: the app lets it go at the next load.
 */
export function rowAsks(row, today, when, { tz, dayEndHour = DEFAULT_DAY_END_HOUR } = {}) {
  const pending = relationPending(row.relation ?? row.views?.relation);
  const needs =
    row.needs_clarification === true ||
    row.v_needs === true ||
    row.views?.needs_clarification === true;
  const resolved =
    row.clarification_resolved === true ||
    row.v_resolved === true ||
    row.views?.clarification_resolved === true;
  const split = (row.split_status ?? row.views?.split?.status) === 'pending';
  if (!pending && !(needs && !resolved) && !split) return false;
  const given = row.ask_since ?? row.views?.ask_since;
  const since =
    typeof given === 'string' && given ? given.slice(0, 10) : dayMade(row, tz, dayEndHour) || today;
  const age = daysFrom(since, today);
  if (age > 1) return false;
  return when === 'wrapup' ? age === 0 : true;
}

/**
 * What Sweep would show, for the dates as the person sees them (`today` in
 * their time zone): the todos and notes on its cards.
 */
export function sweepItems({
  todos = [],
  notes = [],
  habits = [],
  today,
  tz,
  dayEndHour = DEFAULT_DAY_END_HOUR,
  // which questions count: the quick sweep's window unless told (the app's list is the same)
  asks = 'quick',
}) {
  const weekAgo = addDays(today, -7);
  const outTodos = [];
  const outNotes = [];
  const asking = (row) => rowAsks(row, today, asks, { tz, dayEndHour });

  for (const t of todos) {
    // (an old Lock In flag keeps nothing out: Lock In is gone from the app)
    if (t.archived || t.completed_at) continue;
    const ask = asking(t);
    const resurface = t.resurface_at || null;
    if (resurface && resurface > today && !ask) continue;
    if (
      ask ||
      !plannedDayOf(t) ||
      isTodoOnOrBefore(t, today) ||
      t.skipped_in_sweep_at ||
      (resurface && resurface <= today)
    ) {
      outTodos.push(t);
    }
  }

  for (const n of notes) {
    if (n.archived) continue;
    const pending = asking(n);
    if (n.subtype === 'journal' && !pending) continue;
    const resurface = n.resurface_at || null;
    if (resurface && resurface > today && !pending) continue;
    const resurfacesToday = !!resurface && resurface <= today;
    const skipped = !!n.skipped_in_sweep_at;
    if (n.swept_at && !resurfacesToday && !skipped && !pending) continue;

    const createdDay = n.created_at
      ? personDay(localDateOf(new Date(n.created_at), tz), minutesIn(tz, n.created_at), dayEndHour)
      : null;
    const isEvent = n.subtype === 'event';
    const target = n.target_date || null;
    const held = !n.external_source;
    if (isEvent && target && target < today && held && !pending) continue;

    const recentIdea = n.subtype === 'idea' && !!createdDay && createdDay >= weekAgo;
    const madeToday = ['catchall', 'list', 'reference'].includes(n.subtype) && createdDay === today;
    const upcomingEvent = isEvent && !!target && target >= today && held;

    if (pending || recentIdea || madeToday || upcomingEvent || skipped || resurfacesToday) {
      outNotes.push(n);
    }
  }
  // a habit is a card only for a question Sweep asks
  const outHabits = habits.filter((h) => !h.archived && asking(h));
  return { todos: outTodos, notes: outNotes, habits: outHabits };
}

/** Pure count of Sweep's cards. */
export function countSweep(input) {
  const { todos, notes, habits } = sweepItems(input);
  return todos.length + notes.length + habits.length;
}

/**
 * The evening wrap up's cards (the app's selectWrapUp): Sweep's cards counted
 * from the person's day. A todo that was due that day and did not happen is a
 * card like any other. Keep the two in step.
 *
 * `today` is the person's day, which after midnight is still yesterday until
 * their day ends.
 */
export function eveningItems(input) {
  // tonight's wrap up asks the questions made today
  const { todos, notes, habits } = sweepItems({ ...input, asks: 'wrapup' });
  return { todos, notes, habits };
}

/**
 * The quick sweep (lib/sweep/quickSweep.ts, needsDecision): of Sweep's cards,
 * only what still needs a decision. Todos past their day (planned, or with
 * none their deadline), with no day planned and never decided, skipped before
 * or resurfacing; notes with a question, skipped
 * or resurfacing, or not yet swept (an upcoming event only waits for a
 * reminder). Keep the two in step.
 *
 * `since` (their last finished Sweep) adds `newSince`: how many of these were
 * added after it, so the brief can say they are new rather than left over.
 */
export function quickSweepItems(input) {
  const { today, since = null, tz, dayEndHour = DEFAULT_DAY_END_HOUR } = input;
  const { todos, notes, habits } = sweepItems({ ...input, asks: 'quick' });
  const asks = (row) => rowAsks(row, today, 'quick', { tz, dayEndHour });
  const resurfacing = (r) => !!r.resurface_at && r.resurface_at <= today;
  const pastDay = [];
  const noDay = [];
  const other = [];
  for (const t of todos) {
    if (isTodoOverdue(t, today)) pastDay.push(t);
    else if (!plannedDayOf(t) && !t.decided_at) noDay.push(t);
    else if (asks(t) || t.skipped_in_sweep_at || resurfacing(t)) other.push(t);
  }
  const quickNotes = notes.filter(
    (n) =>
      asks(n) ||
      !!n.skipped_in_sweep_at ||
      resurfacing(n) ||
      (n.subtype !== 'event' && !n.swept_at),
  );
  const all = [...pastDay, ...noDay, ...other, ...quickNotes, ...habits];
  const newSince = since
    ? all.filter((r) => r.created_at && new Date(r.created_at) > new Date(since)).length
    : null;
  return { pastDay, noDay, other, notes: quickNotes, habits, newSince };
}

// the ask rules read these on todos, notes and habits (rowAsks)
const ASK_COLS =
  'needs_clarification,clarification_resolved,v_needs:views->needs_clarification,v_resolved:views->clarification_resolved,relation:views->relation,ask_since:views->>ask_since,split_status:views->split->>status';
const TODO_COLS = `id,created_at,due_day,scheduled_date,target_date,resurface_at,skipped_in_sweep_at,${ASK_COLS}`;

async function readSweepRows(env, userId) {
  const d = db(env);
  const todosQuery = (cols) =>
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=eq.false&select=${cols}&limit=2000`,
    );
  const [todos, notes, habits, prefs] = await Promise.all([
    // decided_at arrives with its migration; until then every undated todo still counts
    todosQuery(`${TODO_COLS},decided_at`).catch(() => todosQuery(TODO_COLS)),
    d.select(
      `notes?owner_id=eq.${userId}&archived=eq.false&select=id,subtype,created_at,resurface_at,swept_at,skipped_in_sweep_at,target_date,external_source,${ASK_COLS}&limit=2000`,
    ),
    // a habit is a card only for a question Sweep asks
    d.select(
      `habits?owner_id=eq.${userId}&archived=eq.false&select=id,created_at,${ASK_COLS}&limit=2000`,
    ),
    d
      .select(`cortex_preferences?owner_id=eq.${userId}&select=last_sweep_completed_at&limit=1`)
      .catch(() => null),
  ]);
  return {
    todos: todos || [],
    notes: notes || [],
    habits: habits || [],
    lastSweepAt: prefs?.[0]?.last_sweep_completed_at || null,
  };
}

/** Reads what Sweep needs and counts it. */
export async function sweepWaiting(env, userId, { today, tz, dayEndHour }) {
  const rows = await readSweepRows(env, userId);
  return countSweep({ ...rows, today, tz, dayEndHour });
}

/**
 * The counts from rows already read (pure). `day` is the person's day, for the
 * evening's number; it is the calendar date when left out.
 */
export function countBoth({
  todos = [],
  notes = [],
  habits = [],
  lastSweepAt = null,
  today,
  tz,
  day = null,
  dayEndHour,
}) {
  const q = quickSweepItems({ todos, notes, habits, today, tz, dayEndHour, since: lastSweepAt });
  const evening = eveningItems({ todos, notes, habits, today: day || today, tz, dayEndHour });
  return {
    all: countSweep({ todos, notes, habits, today, tz, dayEndHour }),
    // what the evening wrap up will offer to sort
    evening: evening.todos.length + evening.notes.length + evening.habits.length,
    quick: q.pastDay.length + q.noDay.length + q.other.length + q.notes.length + q.habits.length,
    pastDay: q.pastDay.length,
    noDay: q.noDay.length,
    other: q.other.length,
    notes: q.notes.length,
    // habits with a question Sweep asks (stage 8): part of quick, so the parts add up
    habits: q.habits.length,
    newSince: q.newSince,
    lastSweepAt,
  };
}

/**
 * Sweep's counts: the evening wrap up's cards, the quick sweep's (the
 * morning), and Sweep's whole list, with what the quick sweep holds:
 * { all, evening, quick, pastDay, noDay, other, notes, habits, newSince, lastSweepAt }.
 */
export async function sweepCounts(env, userId, { today, tz, day = null, dayEndHour }) {
  const rows = await readSweepRows(env, userId);
  return countBoth({ ...rows, today, tz, day, dayEndHour });
}
