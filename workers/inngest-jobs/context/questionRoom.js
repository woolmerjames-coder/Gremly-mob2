/**
 * The room left for new questions for one person (workers/shared/questionRules.js
 * QUESTIONS_WAITING_MOST): every writer of Gremly's questions asks before it
 * writes and writes only that many, its most pressing first. Code counts;
 * which questions are worth asking stays each writer's judgment.
 *
 * Since 18 Oct the room is shared by weight across writers (takeRoom): a
 * question that needs an answer, with no room left, holds back the newest
 * waiting one that only helps and has not yet been put to them. That one is
 * not lost: it waits a week (hold_until), then counts and can be asked again.
 */

import { roomFor, questionWeight } from '../../shared/questionRules.js';

/** Days a question held back for a more pressing one waits. */
export const HELD_FOR_DAYS = 7;

const dayOf = (iso) => String(iso).slice(0, 10);
function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The questions waiting for them now: open or asked, not held to a later day, never the welcome back. */
async function waitingNow(d, userId, today) {
  const rows =
    (await d.select(
      `gremly_questions?user_id=eq.${userId}&status=in.(open,asked)&select=id,kind,weight,asked_at,hold_until,created_at`,
    )) || [];
  return rows.filter((q) => q.kind !== 'while_away' && (!q.hold_until || dayOf(q.hold_until) <= today));
}

/** How many more questions may wait for them now. */
export async function questionRoom(d, userId, nowIso = new Date().toISOString()) {
  return roomFor((await waitingNow(d, userId, dayOf(nowIso))).length);
}

/**
 * Which of these new question rows to write, those that need an answer first,
 * in the room left. A row that needs an answer, once there is no room, holds
 * back the newest waiting question that only helps and has not been put to
 * them, and takes its place. Holds rows back as it goes; writes none of the
 * new rows, which the writer then writes.
 * @param rows new question rows, each with its weight (needs, helps or none)
 * @returns {{ kept: object[], held: string[], no_room: number }}
 */
export async function takeRoom(d, userId, rows, nowIso = new Date().toISOString()) {
  const today = dayOf(nowIso);
  const waiting = await waitingNow(d, userId, today);
  let room = roomFor(waiting.length);
  const needs = (r) => questionWeight(r?.weight) === 'needs';
  const ordered = [...(rows || [])].sort((a, b) => needs(b) - needs(a));
  // the newest first: what came last has waited least
  const yieldable = waiting
    .filter((q) => !needs(q) && !q.asked_at)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const kept = [];
  const held = [];
  let noRoom = 0;
  for (const r of ordered) {
    if (room > 0) {
      kept.push(r);
      room--;
      continue;
    }
    const give = needs(r) ? yieldable.shift() : null;
    if (!give) {
      noRoom++;
      continue;
    }
    await d.update(`gremly_questions?id=eq.${give.id}&user_id=eq.${userId}&status=eq.open`, {
      hold_until: addDays(today, HELD_FOR_DAYS),
    });
    held.push(give.id);
    kept.push(r);
  }
  return { kept, held, no_room: noRoom };
}
