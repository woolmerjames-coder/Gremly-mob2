/**
 * How many cards Sweep would show right now, so a notification never names a
 * number the app does not. The rules are the app's own,
 * selectSweepCandidatesUnified in lib/store/selectors.ts: keep the two in step.
 *
 * Todos: open, not resurfacing later; overdue, due
 * today, undated, skipped in an earlier Sweep, or resurfacing today.
 * Notes: an unanswered "is this one you already have?", an idea from the last
 * week, a list, reference or catch all made today, an upcoming event Gremly
 * holds, a skipped one, or one resurfacing today. Swept notes stay out.
 */
import { db } from '../context/db';
import { addDays, localDateOf } from './reminderTimes';

const relationPending = (rel) =>
  !!rel && typeof rel === 'object' && !!rel.classified && rel.status === 'pending';

/**
 * What Sweep would show, for the dates as the person sees them (`today` in
 * their time zone): the todos and notes on its cards.
 */
export function sweepItems({ todos = [], notes = [], today, tz }) {
  const weekAgo = addDays(today, -7);
  const outTodos = [];
  const outNotes = [];

  for (const t of todos) {
    // (an old Lock In flag keeps nothing out: Lock In is gone from the app)
    if (t.archived || t.completed_at) continue;
    const resurface = t.resurface_at || null;
    if (resurface && resurface > today) continue;
    const due = t.due_day || null;
    if (!due || due <= today || t.skipped_in_sweep_at || (resurface && resurface <= today)) {
      outTodos.push(t);
    }
  }

  for (const n of notes) {
    if (n.archived) continue;
    const pending = relationPending(n.relation ?? n.views?.relation);
    if (n.subtype === 'journal' && !pending) continue;
    const resurface = n.resurface_at || null;
    if (resurface && resurface > today) continue;
    const resurfacesToday = !!resurface && resurface <= today;
    const skipped = !!n.skipped_in_sweep_at;
    if (n.swept_at && !resurfacesToday && !skipped && !pending) continue;

    const createdDay = n.created_at ? localDateOf(new Date(n.created_at), tz) : null;
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
  return { todos: outTodos, notes: outNotes };
}

/** Pure count of Sweep's cards. */
export function countSweep(input) {
  const { todos, notes } = sweepItems(input);
  return todos.length + notes.length;
}

/** A question waits on the card (the app's sweepCardAsks). */
function asks(row) {
  const pending = relationPending(row.relation ?? row.views?.relation);
  const needs = row.needs_clarification === true || row.v_needs === true;
  const resolved = row.clarification_resolved === true || row.v_resolved === true;
  return pending || (needs && !resolved);
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
  const { todos, notes } = sweepItems(input);
  return { todos, notes };
}

/**
 * The quick sweep (lib/sweep/quickSweep.ts, needsDecision): of Sweep's cards,
 * only what still needs a decision. Todos past their day, with no day and
 * never decided, skipped before or resurfacing; notes with a question, skipped
 * or resurfacing, or not yet swept (an upcoming event only waits for a
 * reminder). Keep the two in step.
 *
 * `since` (their last finished Sweep) adds `newSince`: how many of these were
 * added after it, so the brief can say they are new rather than left over.
 */
export function quickSweepItems(input) {
  const { today, since = null } = input;
  const { todos, notes } = sweepItems(input);
  const resurfacing = (r) => !!r.resurface_at && r.resurface_at <= today;
  const pastDay = [];
  const noDay = [];
  const other = [];
  for (const t of todos) {
    if (t.due_day && t.due_day < today) pastDay.push(t);
    else if (!t.due_day && !t.decided_at) noDay.push(t);
    else if (asks(t) || t.skipped_in_sweep_at || resurfacing(t)) other.push(t);
  }
  const quickNotes = notes.filter(
    (n) =>
      asks(n) ||
      !!n.skipped_in_sweep_at ||
      resurfacing(n) ||
      (n.subtype !== 'event' && !n.swept_at),
  );
  const all = [...pastDay, ...noDay, ...other, ...quickNotes];
  const newSince = since
    ? all.filter((r) => r.created_at && new Date(r.created_at) > new Date(since)).length
    : null;
  return { pastDay, noDay, other, notes: quickNotes, newSince };
}

const TODO_COLS =
  'id,created_at,due_day,resurface_at,skipped_in_sweep_at,needs_clarification,clarification_resolved,v_needs:views->needs_clarification,v_resolved:views->clarification_resolved';

async function readSweepRows(env, userId) {
  const d = db(env);
  const todosQuery = (cols) =>
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=eq.false&select=${cols}&limit=2000`,
    );
  const [todos, notes, prefs] = await Promise.all([
    // decided_at arrives with its migration; until then every undated todo still counts
    todosQuery(`${TODO_COLS},decided_at`).catch(() => todosQuery(TODO_COLS)),
    d.select(
      `notes?owner_id=eq.${userId}&archived=eq.false&select=id,subtype,created_at,resurface_at,swept_at,skipped_in_sweep_at,target_date,external_source,needs_clarification,clarification_resolved,v_needs:views->needs_clarification,v_resolved:views->clarification_resolved,relation:views->relation&limit=2000`,
    ),
    d
      .select(`cortex_preferences?owner_id=eq.${userId}&select=last_sweep_completed_at&limit=1`)
      .catch(() => null),
  ]);
  return {
    todos: todos || [],
    notes: notes || [],
    lastSweepAt: prefs?.[0]?.last_sweep_completed_at || null,
  };
}

/** Reads what Sweep needs and counts it. */
export async function sweepWaiting(env, userId, { today, tz }) {
  const rows = await readSweepRows(env, userId);
  return countSweep({ ...rows, today, tz });
}

/**
 * The counts from rows already read (pure). `day` is the person's day, for the
 * evening's number; it is the calendar date when left out.
 */
export function countBoth({ todos = [], notes = [], lastSweepAt = null, today, tz, day = null }) {
  const q = quickSweepItems({ todos, notes, today, tz, since: lastSweepAt });
  const evening = eveningItems({ todos, notes, today: day || today, tz });
  return {
    all: countSweep({ todos, notes, today, tz }),
    // what the evening wrap up will offer to sort
    evening: evening.todos.length + evening.notes.length,
    quick: q.pastDay.length + q.noDay.length + q.other.length + q.notes.length,
    pastDay: q.pastDay.length,
    noDay: q.noDay.length,
    other: q.other.length,
    notes: q.notes.length,
    newSince: q.newSince,
    lastSweepAt,
  };
}

/**
 * Sweep's counts: the evening wrap up's cards, the quick sweep's (the
 * morning), and Sweep's whole list, with what the quick sweep holds:
 * { all, evening, quick, pastDay, noDay, other, notes, newSince, lastSweepAt }.
 */
export async function sweepCounts(env, userId, { today, tz, day = null }) {
  const rows = await readSweepRows(env, userId);
  return countBoth({ ...rows, today, tz, day });
}
