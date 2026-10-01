/**
 * Yesterday's reaction to the brief (gap 6 of the context handoff): what the
 * person did with the day's thread. Read by the DCO builder and the brief
 * writer as an input, never shown as it is.
 *
 * Only what happened is reported: whether the brief was opened, the buttons
 * tapped, the plan locked in (and what was taken out or moved on the way),
 * and the first things they typed. No judgement is attached.
 */

import { db } from '../context/db';

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function hhmm(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Summarise a thread's messages; exported for tests. */
export function summariseThread(meta, messages) {
  const parts = [];
  parts.push(meta?.seen_at ? 'they opened it' : 'they did not open it');
  const taps = messages
    .filter((m) => m.metadata_json?.type === 'brief-reply')
    .map((m) => `"${trim(m.content, 40)}"`);
  if (taps.length) parts.push(`tapped ${taps.join(', ')}`);

  const plans = messages
    .filter((m) => m.metadata_json?.type === 'brief-plan')
    .map((m) => m.metadata_json);
  const locked = [...plans].reverse().find((p) => p.status === 'locked');
  if (locked) {
    const items = (locked.items || []).map((i) => `${trim(i.title, 50)} at ${hhmm(i.start)}`);
    parts.push(items.length ? `locked in a plan: ${items.join(', ')}` : 'locked in an empty plan');
    const first = plans[0];
    const lockedIds = new Set((locked.items || []).map((i) => i.id));
    const removed = (first?.items || [])
      .filter((i) => !lockedIds.has(i.id))
      .map((i) => trim(i.title, 50));
    if (removed.length) parts.push(`took out ${removed.join(', ')}`);
    const moved = (locked.items || [])
      .filter((i) => {
        const was = (first?.items || []).find((f) => f.id === i.id);
        return was && was.start !== i.start;
      })
      .map((i) => trim(i.title, 50));
    if (moved.length) parts.push(`moved ${moved.join(', ')}`);
  } else if (plans.length) {
    const last = plans[plans.length - 1];
    parts.push(
      last.status === 'dismissed' ? 'saw a plan and left it' : 'saw a plan and did not lock it in',
    );
  }

  const typed = messages
    .filter((m) => m.role === 'user' && m.metadata_json?.type !== 'brief-reply')
    .slice(0, 3)
    .map((m) => `"${trim(m.content, 120)}"`);
  if (typed.length) parts.push(`said ${typed.join('; ')}`);
  return parts.join('; ');
}

/** "YESTERDAY'S BRIEF (date): ..." or null when there was no thread that day. */
export async function readThreadReaction(env, userId, ritualDay) {
  const d = db(env);
  const threads = await d.select(
    `scope_chats?user_id=eq.${userId}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${ritualDay}&select=id,metadata_json&limit=1`,
  );
  const thread = threads?.[0];
  if (!thread) return null;
  const messages = await d.select(
    `scope_chat_messages?chat_id=eq.${thread.id}&select=role,content,metadata_json,created_at&order=created_at.asc&limit=300`,
  );
  return `YESTERDAY'S BRIEF (${ritualDay}): ${summariseThread(thread.metadata_json, messages || [])}.`;
}
