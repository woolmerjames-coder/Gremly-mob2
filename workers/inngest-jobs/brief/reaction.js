/**
 * Yesterday's reaction to the brief (gap 6 of the context handoff): what the
 * person did with the day's thread. Read by the DCO builder and the brief
 * writer as an input, never shown as it is.
 *
 * Only what happened is reported: whether the brief was opened, the buttons
 * tapped, the plan they said yes to (and what was taken out or moved on the way),
 * and the first things they typed. No judgement is attached.
 */

import { addDays, db } from '../context/db';

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** "8am", "1:15pm": the same clock the brief writer uses. */
function clockTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
}

/**
 * Summarise a thread's messages; exported for tests.
 *
 * The evening wrap up is in the same thread (its messages are marked wrap),
 * and so is a plan made there for the next day. Neither is a reaction to the
 * brief: a tap on Sweep now, the journal entry typed that night and tomorrow's
 * plan are left out, so none of them is read as what they did with the brief.
 */
export function summariseThread(meta, all) {
  const messages = (all || []).filter((m) => !m.metadata_json?.wrap);
  const parts = [];
  parts.push(meta?.seen_at ? 'they opened it' : 'they did not open it');
  const taps = messages
    .filter((m) => m.metadata_json?.type === 'brief-reply')
    .map((m) => `"${trim(m.content, 40)}"`);
  if (taps.length) parts.push(`tapped ${taps.join(', ')}`);

  const plans = messages
    .filter((m) => m.metadata_json?.type === 'brief-plan')
    .map((m) => m.metadata_json)
    // a plan for another day (Plan tomorrow) is not the brief's plan
    .filter((p) => !p.date || !meta?.ritual_day || p.date === meta.ritual_day);
  const locked = [...plans].reverse().find((p) => p.status === 'locked');
  if (locked) {
    const items = (locked.items || []).map((i) => `${trim(i.title, 50)} at ${clockTime(i.start)}`);
    parts.push(
      items.length ? `said yes to a plan: ${items.join(', ')}` : 'said yes to an empty plan',
    );
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
      last.status === 'dismissed'
        ? 'saw a plan and left it'
        : 'saw a plan and did not say yes to it',
    );
  }

  const typed = messages
    .filter((m) => m.role === 'user' && m.metadata_json?.type !== 'brief-reply')
    .slice(0, 3)
    .map((m) => `"${trim(m.content, 120)}"`);
  if (typed.length) parts.push(`said ${typed.join('; ')}`);
  return parts.join('; ');
}

// Where a wrap up that was not finished stopped, in words
const STOPPED_AT = {
  offer: 'before opening the cards',
  cards: 'with the cards open',
  partial: 'part way through the cards',
  habits: 'at their habits',
  journal: 'at the journal',
  questions: "at Gremly's questions",
  close: 'at the close',
};

const listWords = (xs) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * Last night's wrap up (scope_chats.metadata_json.sweep, lib/brief/types.ts
 * WrapUpState), in words for the morning brief: whether they finished it, what
 * they sorted, with what they moved to `today` by name, and whether they wrote
 * in their journal. Null when they did not start one, so the brief never
 * speaks of a wrap up that did not happen. Pure; exported for tests.
 */
export function summariseWrap(state, today) {
  if (!state || typeof state !== 'object' || !state.started_at) return null;
  const parts = [];
  if (state.step === 'declined') parts.push('they said not tonight to the cards');
  else if (state.finished_at || state.step === 'done') parts.push('they finished it');
  else parts.push(`they stopped ${STOPPED_AT[state.step] || 'part way'}`);

  const live = (Array.isArray(state.decisions) ? state.decisions : []).filter(
    (d) => d && !d.undone_at,
  );
  if (state.path === 'clear') parts.push('nothing was waiting to sort');
  else if (state.path === 'skip') parts.push('they moved on without sorting the cards');
  else if (live.length) {
    const toToday = live
      .filter((d) => d.out === 'kept' && d.fields?.day === today)
      .map((d) => `"${trim(d.title, 50)}"`);
    const kept = live.filter((d) => d.out === 'kept').length - toToday.length;
    const letGo = live.filter((d) => d.out === 'let_go').length;
    const left = live.filter((d) => d.out === 'left').length;
    const bits = [];
    if (toToday.length) {
      const named = toToday.slice(0, 3);
      const more = toToday.length - named.length;
      bits.push(`moved ${listWords(named)}${more ? ` and ${more} more` : ''} to today`);
    }
    if (kept) bits.push(`kept ${kept} for other days or as ${kept === 1 ? 'it was' : 'they were'}`);
    if (letGo) bits.push(`let ${letGo} go`);
    if (left) bits.push(`left ${left} for another time`);
    parts.push(
      `they sorted ${live.length} ${live.length === 1 ? 'card' : 'cards'}: ${bits.join(', ')}`,
    );
  }
  if (state.journal === 'written') parts.push('they wrote in their journal');
  else if (state.journal === 'mood') parts.push('they noted how the day felt');
  return `LAST NIGHT'S WRAP UP: ${parts.join('; ')}.`;
}

/** The day's thread and its messages, or null when there was no thread that day. */
async function readThread(env, userId, ritualDay) {
  const d = db(env);
  const threads = await d.select(
    `scope_chats?user_id=eq.${userId}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${ritualDay}&select=id,metadata_json&limit=1`,
  );
  const thread = threads?.[0];
  if (!thread) return null;
  const messages = await d.select(
    `scope_chat_messages?chat_id=eq.${thread.id}&select=role,content,metadata_json,created_at&order=created_at.asc&limit=300`,
  );
  return { thread, messages: messages || [] };
}

/** "YESTERDAY'S BRIEF (date): ..." or null when there was no thread that day. */
export async function readThreadReaction(env, userId, ritualDay) {
  const t = await readThread(env, userId, ritualDay);
  if (!t) return null;
  return `YESTERDAY'S BRIEF (${ritualDay}): ${summariseThread(t.thread.metadata_json, t.messages)}.`;
}

/**
 * Last night's wrap up for the morning brief of `today` (the person's day), in
 * words (summariseWrap), or null when none was started. It was in yesterday's
 * thread; only the thread's state is read, not its messages.
 */
export async function readLastWrap(env, userId, today) {
  const yesterday = addDays(today, -1);
  const threads = await db(env).select(
    `scope_chats?user_id=eq.${userId}&chat_type=eq.daily&metadata_json->>ritual_day=eq.${yesterday}&select=metadata_json&limit=1`,
  );
  return summariseWrap(threads?.[0]?.metadata_json?.sweep, today);
}
