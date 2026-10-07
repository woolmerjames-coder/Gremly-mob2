/**
 * The day frame read again during the day. The morning DCO reads travel and
 * set times once; something said later ("we leave for the airport at
 * 12:30") reaches the ledger with the next ledger read. After that read, when
 * a fact about today is new or changed since the frame was read, the frame is
 * read again and written into today's DCO, where the app and the brief find
 * it (dco.day_frame).
 */

import { db } from '../context/db';
import { readDayFrame, coversToday } from '../context/dayFrame';
import { invalidateChatCache } from '../context/cache';
import { calendarSelects, meetingsFrom } from './data';
import { personNow } from '../../shared/day.js';

/** Facts about today, as the frame reads them. */
async function factsAboutToday(env, userId, today) {
  const rows = await db(env).select(
    `life_facts_now?user_id=eq.${userId}&state=in.(current,planned,unconfirmed)&about_date=lte.${today}&or=(about_date.eq.${today},about_date_end.gte.${today})&select=id,statement,about_date,about_date_end,state,private,created_at,updated_at&limit=100`,
  );
  return (rows || []).filter((f) => coversToday(f, today));
}

/** True when the facts about today are not the ones the frame was read from. */
export function frameIsStale(frame, facts) {
  if (!frame?.built_at) return true;
  const read = new Set(Array.isArray(frame.input_fact_ids) ? frame.input_fact_ids : []);
  const now = new Set(facts.filter((f) => !f.private).map((f) => f.id));
  if (read.size !== now.size || [...now].some((id) => !read.has(id))) return true;
  const builtAt = Date.parse(frame.built_at);
  return facts.some((f) => Date.parse(f.updated_at || f.created_at || 0) > builtAt);
}

export async function refreshDayFrame(env, userId, tz) {
  const d = db(env);
  // their day: after midnight it is still yesterday until their day ends
  const { today } = await personNow(env, userId, tz);
  const [row] = await d.select(
    `user_daily_state?user_id=eq.${userId}&date=eq.${today}&select=id,dco`,
  );
  // no DCO yet: the morning build reads the frame with it
  if (!row?.dco?.pipeline) return { skipped: 'no DCO for today' };
  const facts = await factsAboutToday(env, userId, today);
  if (!frameIsStale(row.dco.day_frame, facts)) return { skipped: 'frame is current' };
  const [synced, noteEvents, quickEvents] = await Promise.all(
    calendarSelects(d, userId, tz, today),
  );
  const { meetings } = meetingsFrom({
    synced,
    noteEvents,
    quickEvents,
    tz,
    cancelledIds: new Set(row.dco.cancelled_calendar_ids || []),
  });
  const frame = await readDayFrame(env, { today, meetings, facts });
  // read again just before writing, so a DCO written meanwhile keeps its other fields
  const [fresh] = await d.select(`user_daily_state?id=eq.${row.id}&select=dco`);
  const dco = { ...(fresh?.dco || row.dco), day_frame: frame };
  await d.update(`user_daily_state?id=eq.${row.id}`, {
    dco,
    updated_at: new Date().toISOString(),
  });
  await invalidateChatCache(env, userId).catch(() => undefined);
  return {
    refreshed: true,
    travel: frame.travel?.label ?? null,
    departs: frame.travel?.departs ?? null,
    blocks: frame.blocks.length,
  };
}
