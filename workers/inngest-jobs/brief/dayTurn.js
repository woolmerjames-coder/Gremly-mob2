/**
 * The day turn (Daily brief in Chat): one reasoning call per message typed in
 * today's thread. It sees the day record (travel, set times, where planning
 * stops), the plan, the person's items, any open question and the
 * conversation, and returns:
 *
 * - about_day: false sends the message to normal chat instead
 * - checklist: everything asked, each proposed, needing an answer, not
 *   possible here, or only noted
 * - changes: one change set for all of it, shown on one card with Apply
 * - reply: a short line that introduces the card and says only what is true
 *
 * Code checks every change: refs must exist, times and days must parse,
 * each kind has what it needs, and the card's words are written here from
 * the change itself, never by the model. Nothing is applied without Apply in
 * the app (lib/brief/applyChanges.ts).
 *
 * Prompt policy: semantic rules only, no examples, no word lists.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { jsonCall, modelFor } from '../context/llm';
import { addDays, personIdentity, weekdayName } from '../context/db';
import { clockTime, noDashes, stripRefs } from './writer';
import { parseHHMM, toHHMM } from './planPick';
import { dayEndHourOf, inSmallHours } from '../../shared/day.js';
import { isDay } from '../../shared/week.js';

export const DAY_TURN_PROMPT_VERSION = 'day-turn-2026-10-05a';
const DAY_END = 22 * 60;
const MAX_CHANGES = 12;

export const CHANGE_KINDS = [
  'create_todo',
  'retime',
  'move_day',
  'rename',
  'complete',
  'cancel',
  'skip_habit',
  'add_block',
  'remove_block',
  'plan_add',
  'plan_remove',
  'plan_move',
];
const ASK_STATUS = ['proposed', 'needs_answer', 'not_possible', 'noted'];

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const num = (v, lo, hi) =>
  v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
    ? Math.min(hi, Math.max(lo, Math.round(Number(v))))
    : null;

/**
 * The app's request, checked, with a ref for every item and set time. A date
 * is taken only when it is a real day, so nothing after this works out a
 * weekday from one that is not.
 */
export function readTurnRequest(body) {
  const date = isDay(body.date) ? body.date : null;
  const now = num(body.now, 0, 24 * 60) ?? 0;
  const items = [];
  const seen = new Set();
  for (const x of Array.isArray(body.items) ? body.items : []) {
    if (!x || typeof x.id !== 'string' || x.id.length > 64 || seen.has(x.id)) continue;
    if (items.length >= 80) break;
    seen.add(x.id);
    items.push({
      ref: `i${items.length + 1}`,
      id: x.id,
      kind: x.kind === 'habit' ? 'habit' : 'todo',
      title: trim(x.title, 100) || 'Untitled',
      due_day: isDay(x.due_day) ? x.due_day : null,
      due_time: parseHHMM(x.due_time) !== null ? toHHMM(parseHHMM(x.due_time)) : null,
      minutes: num(x.minutes, 5, 480),
      note: trim(x.note, 60),
      // a step of a milestone set up in their weekly review: the goal it is towards
      towards: trim(x.towards, 120) || null,
      // a habit they are breaking: there is nothing of it to plan
      breaking: x.kind === 'habit' && x.breaking === true,
    });
  }
  const rec = body.record && typeof body.record === 'object' ? body.record : {};
  const blocks = (Array.isArray(rec.blocks) ? rec.blocks : [])
    .filter((b) => b && typeof b.id === 'string' && num(b.start, 0, 1439) !== null)
    .slice(0, 20)
    .map((b, i) => ({
      ref: `b${i + 1}`,
      id: b.id,
      title: trim(b.title, 60),
      start: num(b.start, 0, 1439),
      end: num(b.end, 0, 1440),
      travel: b.travel === true,
    }));
  const meetings = (Array.isArray(body.meetings) ? body.meetings : [])
    .slice(0, 40)
    .map((m) => ({
      title: trim(m.title, 80),
      start: num(m.start, 0, 1440),
      end: num(m.end, 0, 1440),
    }))
    .filter((m) => m.start !== null && m.end !== null);
  const byId = new Map(items.map((x) => [x.id, x]));
  const planItems = (Array.isArray(body.plan?.items) ? body.plan.items : [])
    .map((x) => ({
      id: x.id,
      start: num(x.start, 0, 1440),
      end: num(x.end, 0, 1440),
      title: trim(x.title, 100),
      kind: x.kind === 'habit' ? 'habit' : 'todo',
    }))
    .filter((x) => typeof x.id === 'string' && x.start !== null);
  // an item in the plan is always one they can refer to
  for (const p of planItems) {
    if (byId.has(p.id) || items.length >= 90) continue;
    const item = {
      ref: `i${items.length + 1}`,
      id: p.id,
      kind: p.kind,
      title: p.title || 'Untitled',
      due_day: null,
      due_time: null,
      minutes: p.end - p.start,
      note: 'in the plan',
    };
    items.push(item);
    byId.set(p.id, item);
  }
  const travel =
    rec.travel && typeof rec.travel === 'object'
      ? { label: trim(rec.travel.label, 40) || null, departs: num(rec.travel.departs, 0, 1439) }
      : null;
  return {
    date,
    now,
    text: trim(body.text, 800),
    question: trim(body.question, 300) || null,
    // the intention of the week today is in, in their words
    intention: trim(body.intention, 200) || null,
    history: (Array.isArray(body.history) ? body.history : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-12)
      .map((m) => ({ role: m.role, content: trim(m.content, 400) })),
    items,
    blocks,
    meetings,
    travel,
    planEnd: num(rec.plan_end, 0, DAY_END) ?? DAY_END,
    plan: planItems.length
      ? { status: body.plan?.status === 'locked' ? 'locked' : 'proposal', items: planItems }
      : null,
  };
}

export function renderTurnInput(req, person) {
  const L = [];
  const name = person?.first_name || 'They';
  // after midnight and before their day ends, the small hours end their day
  const next = addDays(req.date, 1);
  const late = inSmallHours(req.now, req.dayEndHour)
    ? `, after midnight; their ${weekdayName(req.date)} ends at ${clockTime(req.dayEndHour * 60)}, so their tomorrow is ${weekdayName(next)} ${next}, and any time of day they name for later is on ${weekdayName(next)}, after they have slept`
    : '';
  L.push(`TODAY: ${weekdayName(req.date)} ${req.date}. TIME NOW: ${clockTime(req.now)}${late}.`);
  if (req.travel) {
    L.push(
      `TRAVEL TODAY: ${req.travel.label || 'they travel today'}${
        req.travel.departs !== null
          ? `; they set off at ${clockTime(req.travel.departs)}, and nothing is planned after that`
          : '; the time they set off is not known yet'
      }.`,
    );
  }
  L.push(
    `SET TIMES TODAY (ref | time | title): ${
      req.blocks
        .map((b) => `${b.ref} | ${clockTime(b.start)}${b.travel ? ' (travel)' : ''} | ${b.title}`)
        .join('; ') || 'none'
    }`,
  );
  L.push(
    `CALENDAR TODAY (time | title; meetings live in their calendar and cannot be changed here): ${
      req.meetings
        .map(
          (m) =>
            `${clockTime(m.start)} to ${clockTime(m.end)} ${m.title}${
              req.planEnd < DAY_END && m.start >= req.planEnd ? ' (after they set off)' : ''
            }`,
        )
        .join('; ') || 'nothing'
    }`,
  );
  const refOf = new Map(req.items.map((x) => [x.id, x.ref]));
  L.push(
    req.plan
      ? `THE PLAN ON SCREEN, ${req.plan.status === 'locked' ? 'ON TODAY (they said yes to it)' : 'A PROPOSAL'} (ref | time | title):\n${req.plan.items
          .map((x) => `${refOf.get(x.id)} | ${clockTime(x.start)} | ${x.title}`)
          .join('\n')}`
      : 'THE PLAN ON SCREEN: none yet.',
  );
  L.push(
    `THEIR ITEMS (ref | kind | title | day | time | minutes | note):\n${
      req.items
        .map(
          (x) =>
            `${x.ref} | ${x.kind} | ${x.title} | ${x.due_day || 'no day'} | ${x.due_time || '-'} | ${x.minutes ? `${x.minutes} min` : '-'} | ${x.note || '-'}`,
        )
        .join('\n') || '(none)'
    }`,
  );
  L.push(`GREMLY'S OPEN QUESTION: ${req.question ? `"${req.question}"` : 'none'}`);
  L.push(
    `THE CONVERSATION SO FAR (oldest first):\n${
      req.history.map((m) => `${m.role === 'user' ? name : 'Gremly'}: ${m.content}`).join('\n') ||
      '(nothing yet)'
    }`,
  );
  L.push(`WHAT ${name.toUpperCase()} JUST SAID: "${req.text}"`);
  return L.join('\n\n');
}

const TURN_SCHEMA = {
  type: 'object',
  properties: {
    about_day: { type: 'boolean' },
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ask: { type: 'string' },
          status: { type: 'string', enum: ASK_STATUS },
        },
        required: ['ask', 'status'],
      },
    },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: CHANGE_KINDS },
          ref: { type: 'string', nullable: true },
          title: { type: 'string', nullable: true },
          day: { type: 'string', nullable: true },
          time: { type: 'string', nullable: true },
          end_time: { type: 'string', nullable: true },
          minutes: { type: 'integer', nullable: true },
          travel: { type: 'boolean' },
        },
        required: ['kind', 'ref', 'title', 'day', 'time', 'end_time', 'minutes', 'travel'],
      },
    },
    reply: { type: 'string' },
  },
  required: ['about_day', 'checklist', 'changes', 'reply'],
};

function turnSystem(person) {
  return {
    fixed: `You are Gremly, a warm, shame-free companion, in the person's thread for today. They have just typed a message. Handle everything in it that is about their day, in this one turn.

${CARE_RULES}

WHAT YOU RETURN
- about_day: true when the message is about today or their plans, items, times, travel or the plan on screen, or answers Gremly's open question. False for anything else; normal chat answers those, and the rest of your output is ignored.
- checklist: every separate thing they asked for or told you, in their order, each in a few words, with a status. proposed: a change below covers it. needs_answer: it cannot be done without something only they know. not_possible: nothing here can do it; calendar meetings live in their calendar and cannot be changed here. noted: they told you something with nothing to change.
- changes: one change set covering every proposed ask, and nothing they did not ask for or that does not follow directly from what they said. Kinds: create_todo for something new to do (title, with day and time when they gave them); retime for a set time today on one of their items (time, and day when it moves too); move_day for an item to another day; rename (title); complete for something they did; cancel for something they no longer need to do; skip_habit for a habit not done today; add_block for a set time today that the day must be planned around and that is not one of their items, with travel true when it is part of their travel (a set time on another day is a create_todo with that day and time); remove_block for a set time that no longer holds; plan_add, plan_remove and plan_move for the plan on screen. Use only refs from the input. When they give a time for something already listed, change that item rather than creating a new one. Times are HH:MM on a 24-hour clock and days are YYYY-MM-DD.
- reply: one to three short chat sentences. The changes appear on a card under it for them to check and apply, so the reply introduces them as what you would change and never says a change has already been made. Say plainly what cannot be done here and why. Ask at most one question, only when something is truly unclear, and never one the input already answers.
- Never invent an item, a time, a day or a fact.

VOICE
Warm, plain and brief, like a friend who knows their day. Suggest, never instruct.

${PRIVATE_RULES}

${WRITING_RULES}`,
    varying: personBlock(person),
  };
}

function minutesWord(m) {
  return clockTime(m);
}

function dayWord(day, today) {
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  if (day <= addDays(today, 6)) return weekdayName(day);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

/** The card's words for a change, from the change itself. */
export function changeLabel(c, today) {
  const t = c.title;
  switch (c.kind) {
    case 'create_todo':
      return `Add "${t}"${c.day && c.day !== today ? ` for ${dayWord(c.day, today)}` : ''}${
        c.start !== null ? ` at ${minutesWord(c.start)}` : ''
      }`;
    case 'retime':
      return `${t} at ${minutesWord(c.start)}${c.day && c.day !== today ? ` ${dayWord(c.day, today)}` : ''}`;
    case 'move_day':
      return `Move ${t} to ${dayWord(c.day, today)}`;
    case 'rename':
      return `Rename ${c.was} to "${t}"`;
    case 'complete':
      return `Mark ${t} done`;
    case 'cancel':
      return `Take ${t} off your list`;
    case 'skip_habit':
      return `Skip ${t} today`;
    case 'add_block':
      return `${t} at ${minutesWord(c.start)}`;
    case 'remove_block':
      return `Take ${t} off today`;
    case 'plan_add':
      return `Add ${t} to the plan${c.start !== null ? ` at ${minutesWord(c.start)}` : ''}`;
    case 'plan_remove':
      return `Take ${t} out of the plan`;
    case 'plan_move':
      return `Move ${t} to ${minutesWord(c.start)} in the plan`;
    default:
      return t;
  }
}

/**
 * Keep only changes the input supports, each with what its kind needs, and
 * write the card's words for them.
 */
export function checkChanges(output, req) {
  const byRef = new Map(req.items.map((x) => [x.ref, x]));
  const blockByRef = new Map(req.blocks.map((b) => [b.ref, b]));
  const inPlan = new Set((req.plan?.items || []).map((x) => x.id));
  const today = req.date;
  const out = [];
  const dropped = [];
  const keys = new Set();
  const lastDay = addDays(today, 365);
  for (const raw of output?.changes || []) {
    if (out.length >= MAX_CHANGES) break;
    const kind = CHANGE_KINDS.includes(raw?.kind) ? raw.kind : null;
    const item = byRef.get(raw?.ref) || null;
    const block = blockByRef.get(raw?.ref) || null;
    const start = parseHHMM(raw?.time);
    let end = parseHHMM(raw?.end_time);
    if (end !== null && start !== null && end <= start) end = null;
    const day = isDay(raw?.day) && raw.day >= today && raw.day <= lastDay ? raw.day : null;
    const title = noDashes(stripRefs(trim(raw?.title, 80)));
    const minutes = num(raw?.minutes, 5, 480);
    let c = null;
    switch (kind) {
      case 'create_todo':
        if (title) c = { kind, title, day: day || today, start, minutes };
        break;
      case 'retime':
        // a habit they are breaking has no time to do it at
        if (item && !item.breaking && start !== null)
          c = { kind, id: item.id, item: item.kind, title: item.title, start, day: day || today };
        break;
      case 'move_day':
        if (item && item.kind === 'todo' && day && day !== today)
          c = { kind, id: item.id, item: 'todo', title: item.title, day };
        else if (item && item.kind === 'todo' && day === today && item.due_day !== today)
          c = { kind, id: item.id, item: 'todo', title: item.title, day };
        break;
      case 'rename':
        if (item && title && title !== item.title)
          c = { kind, id: item.id, item: item.kind, title, was: item.title };
        break;
      case 'complete':
      case 'cancel':
        if (item) c = { kind, id: item.id, item: item.kind, title: item.title };
        break;
      case 'skip_habit':
        if (item && item.kind === 'habit')
          c = { kind, id: item.id, item: 'habit', title: item.title };
        break;
      case 'add_block':
        // a set time on another day is something to do that day, at that time
        if (title && start !== null && day && day !== today)
          c = { kind: 'create_todo', title, day, start, minutes };
        else if (title && start !== null)
          c = { kind, title, start, end, travel: raw.travel === true };
        break;
      case 'remove_block':
        if (block) c = { kind, id: block.id, title: block.title };
        break;
      case 'plan_add':
        if (item && !item.breaking && !inPlan.has(item.id))
          c = { kind, id: item.id, item: item.kind, title: item.title, start, minutes };
        break;
      case 'plan_remove':
        if (item && inPlan.has(item.id))
          c = { kind, id: item.id, item: item.kind, title: item.title };
        break;
      case 'plan_move':
        if (item && inPlan.has(item.id) && start !== null)
          c = { kind, id: item.id, item: item.kind, title: item.title, start };
        break;
      default:
        break;
    }
    if (!c) {
      dropped.push(raw?.kind ?? null);
      continue;
    }
    // one change per item: a new time covers moving it in the plan too
    const key = c.id ? `${c.id}` : `${c.kind}:${c.title}:${c.start}`;
    if (keys.has(key)) {
      dropped.push(c.kind);
      continue;
    }
    keys.add(key);
    out.push({ ...c, label: changeLabel(c, today) });
  }
  return { changes: out.map((c, i) => ({ ...c, cid: `c${i + 1}` })), dropped };
}

// A reply that says a change is already made. The card only proposes, so
// such a reply is replaced (scripts/day-replay/checks.mjs checks the same).
const CLAIMS = [
  /\b(i['’]ve|i have)\s+(\w+\s+)?(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|set|put|made|taken|skipped)\b/i,
  /\ball set\b/i,
  /^\s*done\b/i,
  /\b(it['’]s|that['’]s|they['’]re|is|are)\s+now\s+(added|moved|updated|changed|cancell?ed|removed|saved|booked|scheduled|in)\b/i,
];

export function claimsDone(reply) {
  return !!reply && CLAIMS.some((re) => re.test(reply));
}

export function checkChecklist(output) {
  return (output?.checklist || [])
    .map((a) => ({
      ask: noDashes(stripRefs(trim(a?.ask, 100))),
      status: ASK_STATUS.includes(a?.status) ? a.status : 'noted',
    }))
    .filter((a) => a.ask)
    .slice(0, 12);
}

/** The model step, given the checked request (the replay suite calls this directly). */
export async function runDayTurn(env, req, person) {
  const input = renderTurnInput(req, person);
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'dayTurn'),
    fallback: modelFor(env, 'dayTurnFallback'),
    system: turnSystem(person),
    user: input,
    schema: TURN_SCHEMA,
    maxTokens: 3000,
    effort: 'low',
    thinking: 'low',
  });
  if (!output?.about_day) {
    return { about_day: false, model, input, prompt_version: DAY_TURN_PROMPT_VERSION };
  }
  const { changes, dropped } = checkChanges(output, req);
  const checklist = checkChecklist(output);
  let reply = noDashes(stripRefs(trim(output.reply, 500))) || null;
  // nothing is changed until Apply: a reply that says otherwise is replaced
  const claimed = claimsDone(reply);
  if (claimed) {
    console.warn('[DayTurn] the reply claimed a change; replaced');
    reply = changes.length ? "Here's what I'd change." : null;
  }
  return {
    about_day: true,
    checklist,
    changes,
    reply,
    // for the replay suite: the model's own reply said a change was made
    reply_claimed: claimed,
    dropped: dropped.length,
    model,
    input,
    prompt_version: DAY_TURN_PROMPT_VERSION,
  };
}

export async function dayTurn(env, userId, body) {
  const req = readTurnRequest(body);
  if (!req.date || !req.text) return { about_day: false, reason: 'nothing to read' };
  const [person, dayEndHour] = await Promise.all([
    personIdentity(env, userId).catch(() => null),
    dayEndHourOf(env, userId),
  ]);
  req.dayEndHour = dayEndHour;
  const { input: _input, ...result } = await runDayTurn(env, req, person);
  if (result.dropped) {
    console.warn(
      `[DayTurn] dropped ${result.dropped} change(s) the input did not support for ${userId}`,
    );
  }
  return result;
}

export async function handleDayTurnApi(request, env, corsResponse) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.user_id === 'string' ? body.user_id : null;
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return corsResponse({ error: 'user_id is required' }, 400);
    }
    return corsResponse(await dayTurn(env, userId, body));
  } catch (e) {
    console.error('[DayTurn] API error:', e);
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}
