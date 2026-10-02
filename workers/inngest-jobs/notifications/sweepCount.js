/**
 * How many cards Sweep would show right now, so a notification never names a
 * number the app does not. The rules are the app's own,
 * selectSweepCandidatesUnified in lib/store/selectors.ts: keep the two in step.
 *
 * Todos: open, not locked in, not resurfacing later; overdue, due today,
 * undated, skipped in an earlier Sweep, or resurfacing today.
 * Notes: an unanswered "is this one you already have?", an idea from the last
 * week, a list, reference or catch all made today, an upcoming event Gremly
 * holds, a skipped one, or one resurfacing today. Swept notes stay out.
 */
import { db } from '../context/db';
import { addDays, localDateOf } from './reminderTimes';

const relationPending = (rel) =>
  !!rel && typeof rel === 'object' && !!rel.classified && rel.status === 'pending';

/** Pure count, for the dates as the person sees them (`today` in their time zone). */
export function countSweep({ todos = [], notes = [], today, tz }) {
  const weekAgo = addDays(today, -7);
  let count = 0;

  for (const t of todos) {
    if (t.commitment === true || t.archived || t.completed_at) continue;
    const resurface = t.resurface_at || null;
    if (resurface && resurface > today) continue;
    const due = t.due_day || null;
    if (!due || due <= today || t.skipped_in_sweep_at || (resurface && resurface <= today)) {
      count += 1;
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
      count += 1;
    }
  }
  return count;
}

/** Reads what Sweep needs and counts it. */
export async function sweepWaiting(env, userId, { today, tz }) {
  const d = db(env);
  const [todos, notes] = await Promise.all([
    d.select(
      `todos?owner_id=eq.${userId}&completed_at=is.null&archived=eq.false&select=id,due_day,commitment,resurface_at,skipped_in_sweep_at&limit=2000`,
    ),
    d.select(
      `notes?owner_id=eq.${userId}&archived=eq.false&select=id,subtype,created_at,resurface_at,swept_at,skipped_in_sweep_at,target_date,external_source,relation:views->relation&limit=2000`,
    ),
  ]);
  return countSweep({ todos: todos || [], notes: notes || [], today, tz });
}
