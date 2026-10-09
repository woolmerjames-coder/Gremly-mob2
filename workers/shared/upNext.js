/**
 * Up next (data fabric stage 4b): the open Chapter with the nearest date, as
 * code works it out. The daily picture carries it, and the brief's input, the
 * day the agent is shown, the wrap up's context and the weekly read each
 * include it. No prompt tells Gremly to mention it: he may, when that is
 * natural (James, 1 Oct).
 *
 * A Chapter's next date is the day it starts, while that is today or ahead,
 * and otherwise the day it ends, while that is today or ahead. A Chapter with
 * neither has no next date and is never up next. Nothing here reads words.
 */

import { daysBetween } from './db.js';

/** The phases of a Chapter that is open: under way, or set for later. */
export const OPEN_CHAPTER_PHASES = Object.freeze(['upcoming', 'active']);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (v) => {
  const s = String(v || '').slice(0, 10);
  return DAY.test(s) ? s : null;
};

/** The date a Chapter is next at, and which end of it that is, or null. */
export function nextDateOf(chapter, today) {
  const start = dayOf(chapter?.start_date);
  const end = dayOf(chapter?.end_date);
  if (start && start >= today) return { date: start, which: 'starts' };
  if (end && end >= today) return { date: end, which: 'ends' };
  return null;
}

/**
 * The one Chapter up next, or null. Pure.
 * @param chapters rows with id, title, phase, start_date, end_date, closed_at,
 *   primary_world_id, and world (its World's name) when it was read with it
 * @param today the person's day, YYYY-MM-DD
 */
export function upNext(chapters, today) {
  const open = (chapters || []).filter(
    (c) => c && c.id && OPEN_CHAPTER_PHASES.includes(c.phase) && !c.closed_at,
  );
  let best = null;
  for (const c of open) {
    const next = nextDateOf(c, today);
    if (!next) continue;
    const better =
      !best ||
      next.date < best.next.date ||
      // on the same day, one starting comes before one ending
      (next.date === best.next.date && next.which === 'starts' && best.next.which === 'ends') ||
      (next.date === best.next.date &&
        next.which === best.next.which &&
        String(c.id) < String(best.c.id));
    if (better) best = { c, next };
  }
  if (!best) return null;
  const world = Array.isArray(best.c.world) ? best.c.world[0] : best.c.world;
  return {
    chapter_id: best.c.id,
    title: String(best.c.title || '').trim() || null,
    world_id: best.c.primary_world_id || null,
    world: world?.display_name || world?.name || null,
    date: best.next.date,
    which: best.next.which,
    days_until: daysBetween(today, best.next.date),
  };
}

/** The select that reads what upNext needs, for a person's open Chapters. */
export function upNextSelect(userId) {
  return `chapters?owner_id=eq.${userId}&phase=in.(${OPEN_CHAPTER_PHASES.join(',')})&closed_at=is.null&select=id,title,phase,start_date,end_date,closed_at,primary_world_id,world:worlds!chapters_primary_world_id_fkey(name,display_name)&limit=60`;
}

/**
 * Read a person's open Chapters and work out Up next. Throws when they cannot
 * be read: the caller decides whether its own work goes on without it.
 * @param d the db helper (shared/db.js)
 */
export async function loadUpNext(d, userId, today) {
  const rows = await d.select(upNextSelect(userId));
  return upNext(rows || [], today);
}

/**
 * Up next in words for a reader's input: the Chapter's title, its World, and
 * the day it starts or ends with its weekday. Code says when; the reader is
 * never told to mention it.
 */
export function upNextWords(u) {
  if (!u?.title || !u.date) return '';
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${u.date}T12:00:00Z`),
  );
  const when = `${u.which === 'ends' ? 'ends' : 'starts'} ${u.days_until === 0 ? 'today' : u.days_until === 1 ? 'tomorrow' : `on ${weekday}`} ${u.date}`;
  return `"${u.title}"${u.world ? `, in their World ${u.world},` : ''} ${when}`;
}
