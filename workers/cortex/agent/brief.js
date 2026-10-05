// ============================================================================
// brief.js: today's thread on the agent (step 7 of the agent plan, "Gremly
// agent: today's thread").
//
// A message typed in today's thread comes with the day as the app holds it:
// the time, travel, set times, calendar, the plan on screen, the person's
// items, Gremly's open question and the conversation (the same request the
// day turn reads, lib/brief/useDayTurn.ts buildDayTurnRequest). The agent
// reads that day as what it already knows, with Gremly's care rules and
// voice, and answers on the brief surface: a reply, and a card of changes in
// the change model's shape, which can include the plan on screen and today's
// set times. Nothing changes until the person taps.
//
// When the agent cannot finish, the day turn answers instead, exactly as it
// did before this step, so the thread always gets an answer.
//
// Once the answer is sent, the message reaches Gremly's memory as a chat
// message does: a correction goes to the context pipeline straight away
// (learnFromTurn), and the ledger reader reads the rest within the hour.
// ============================================================================

import {
  CARE_RULES,
  CHAT_WRITING_RULES,
  PRIVATE_RULES,
  personBlock,
} from '../../inngest-jobs/careRules.js';
import { readTurnRequest } from '../../inngest-jobs/brief/dayTurn.js';
import { clockTime } from '../../inngest-jobs/brief/writer.js';
import { personIdentity, weekdayName } from '../../shared/db.js';
import { runAgent } from './run.js';
import { toolContext } from './tools/index.js';
import { AGENT_PROMPT_VERSION, isLate } from './prompt.js';
import { dayEndHourOf } from '../../shared/day.js';
import { checkForCorrection } from '../context/corrections.js';

export const BRIEF_AGENT_VERSION = `brief-2026-10-05b/${AGENT_PROMPT_VERSION}`;

// the planning day ends here when nothing earlier ends it, as in the day turn
const DAY_END = 22 * 60;

/** The day the thread sent, for the tools: the plan on screen, set times and items by id. */
export function dayFrameOf(req) {
  return {
    date: req.date,
    plan: req.plan ? { status: req.plan.status, items: req.plan.items } : null,
    blocks: req.blocks.map((b) => ({
      id: b.id,
      title: b.title,
      start: b.start,
      end: b.end,
      travel: b.travel,
    })),
    items: new Map(
      req.items.map((x) => [x.id, { id: x.id, kind: x.kind, title: x.title, minutes: x.minutes }]),
    ),
  };
}

/**
 * The day in words, with the ids the tools take. dayEndHour, the hour their day
 * ends, marks the small hours as the end of their day.
 */
export function renderDay(req, dayEndHour = null) {
  const L = [];
  const late = isLate(req.now, dayEndHour)
    ? `, after midnight; their ${weekdayName(req.date)} ends at ${clockTime(dayEndHour * 60)}`
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
    `SET TIMES TODAY (id | time | title): ${
      req.blocks
        .map((b) => `${b.id} | ${clockTime(b.start)}${b.travel ? ' (travel)' : ''} | ${b.title}`)
        .join('; ') || 'none'
    }`,
  );
  L.push(
    `CALENDAR TODAY (time | title; meetings live in their calendar and cannot be changed or copied here): ${
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
  L.push(
    req.plan
      ? `THE PLAN ON SCREEN, ${req.plan.status === 'locked' ? 'ON TODAY (they said yes to it)' : 'A PROPOSAL'} (id | time | title):\n${req.plan.items
          .map((x) => `${x.id} | ${clockTime(x.start)} | ${x.title}`)
          .join('\n')}`
      : 'THE PLAN ON SCREEN: none yet.',
  );
  L.push(
    `THEIR ITEMS (id | kind | title | day | time | minutes | note):\n${
      req.items
        .map(
          (x) =>
            `${x.id} | ${x.kind} | ${x.title} | ${x.due_day || 'no day'} | ${x.due_time || '-'} | ${x.minutes ? `${x.minutes} min` : '-'} | ${x.note || '-'}`,
        )
        .join('\n') || '(none)'
    }`,
  );
  L.push(`GREMLY'S OPEN QUESTION: ${req.question ? `"${req.question}"` : 'none'}`);
  return L.join('\n\n');
}

/**
 * Gremly in today's thread: who it is, the care rules, its voice and the
 * person. The same from one message to the next, so it is read from the
 * provider's cache; the day, which changes, is dayContext.
 */
export function briefPersona(person) {
  return [
    "You are Gremly, a warm, shame-free companion, in the person's thread for today.",
    CARE_RULES,
    `VOICE
Warm, lively and brief, like a friend who knows their day and is glad to be part of it. Share in what today means to them: when it is about something or someone that matters to them, be openly glad with them, in your own words, and see what they are doing today in its light. Gremly has a playful spark; let it show whenever the moment allows. Suggest, never instruct. Reply in one to three short sentences of plain chat text, with no headings, lists, bold or emoji. Say what you would change in your own words, as an offer. Say plainly what cannot be done here and why. Ask a question only when you need the answer to act or to understand them, never to offer more. Never invent an item, a time, a day or a fact.`,
    PRIVATE_RULES,
    CHAT_WRITING_RULES,
    personBlock(person),
  ].join('\n\n');
}

/**
 * What today is about, from Gremly's picture of their day (the DCO the brief
 * is written from): what the day is for, where they are, and how the brief is
 * pitching it. Empty when there is no picture of today yet.
 */
export function dayMeaning(dco) {
  if (!dco || typeof dco !== 'object') return '';
  const lines = [];
  const lead = dco.lead_story;
  if (lead?.what) lines.push(`- ${lead.what}${lead.why_today ? `: ${lead.why_today}` : ''}`);
  const away = dco.day_frame?.away;
  if (away?.label) {
    lines.push(
      `- Away: ${away.label}${away.through ? `, until ${weekdayName(away.through)} ${away.through}` : ''}`,
    );
  }
  const moment = dco.life_moment;
  if (moment && typeof moment === 'object' && (moment.what || moment.label)) {
    lines.push(`- In their life right now: ${moment.what || moment.label}`);
  } else if (typeof moment === 'string' && moment.trim()) {
    lines.push(`- In their life right now: ${moment.trim()}`);
  }
  if (dco.voice_note) lines.push(`- How Gremly's brief is pitching today: ${dco.voice_note}`);
  return lines.length
    ? `WHAT TODAY IS ABOUT (Gremly's picture of their day)\n${lines.join('\n')}`
    : '';
}

/** Where tonight's wrap up has got to, in words (lib/brief/types.ts WrapStep). */
const WRAP_AT = {
  offer: 'Gremly has opened on the day and offered the cards',
  cards: 'they are going through the cards',
  partial: 'they closed the cards part way',
  habits: 'their habits',
  journal: 'their journal',
  questions: "Gremly's questions",
  close: 'the close',
  declined: 'they put it off for now',
  done: 'it is finished',
};

const UUID_LIKE = /^[0-9a-f-]{36}$/i;

/**
 * Tonight's wrap up as the app sends it with a message typed while it is
 * under way (lib/wrapup): where it is, what was sorted, and the question the
 * message answers, when it answers one. Null when there is none.
 */
export function readWrap(raw) {
  if (!raw || typeof raw !== 'object' || !WRAP_AT[raw.step]) return null;
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const decisions = (Array.isArray(raw.decisions) ? raw.decisions : [])
    .map((d) => ({ title: str(d?.title, 100), outcome: str(d?.outcome, 40) }))
    .filter((d) => d.title && d.outcome)
    .slice(0, 20);
  const a = raw.answering;
  const item = a?.item && UUID_LIKE.test(String(a.item.id || '')) ? a.item : null;
  return {
    step: raw.step,
    decisions,
    answering: str(a?.question, 300)
      ? {
          question: str(a.question, 300),
          item: item
            ? {
                id: item.id,
                kind: ['todo', 'habit', 'note'].includes(item.kind) ? item.kind : 'item',
                title: str(item.title, 100),
                when: str(item.when, 30),
              }
            : null,
        }
      : null,
  };
}

/** The wrap up under way, for the agent: where it is, and the question a message answers. */
export function wrapContext(wrap) {
  if (!wrap) return '';
  const L = [
    'THE EVENING WRAP UP, UNDER WAY',
    `They are wrapping up their day with Gremly in this thread: the cards for what waits for a decision, their habits, their journal, Gremly's questions, then the close. Where it is now: ${WRAP_AT[wrap.step]}.`,
  ];
  if (wrap.decisions.length) {
    L.push(
      `Sorted in the cards tonight: ${wrap.decisions.map((d) => `${d.title} (${d.outcome})`).join('; ')}.`,
    );
  }
  L.push(
    'The wrap up carries on by itself after your reply, from where it is, so answer what they said and leave its steps to it.',
  );
  const a = wrap.answering;
  if (a) {
    const about = a.item
      ? `, about their ${a.item.kind} "${a.item.title}" (id ${a.item.id})${a.item.when ? `, ${a.item.when}` : ''}`
      : '';
    L.push(
      '',
      "THEIR MESSAGE ANSWERS GREMLY'S QUESTION",
      `Gremly asked: "${a.question}"${about}. Their message is the answer, and it is already saved to what Gremly knows. Take it in as a friend would, in one or two short sentences. When the answer means one of their items is wrong or needs to change, put that change on the card with your reply, as your offer; when it changes nothing, say so plainly and put nothing on the card.`,
    );
  }
  return L.join('\n');
}

/** What Gremly knows about today, with their latest message: what the day is about, the day itself, and the wrap up when one is under way. */
export function dayContext(req, dco = null, wrap = null, dayEndHour = null) {
  const meaning = dayMeaning(dco);
  const evening = wrapContext(wrap);
  return `WHAT YOU KNOW ABOUT TODAY\n${meaning ? `${meaning}\n\n` : ''}${renderDay(req, dayEndHour)}${evening ? `\n\n${evening}` : ''}`;
}

/** Today's picture of the day, if the brief has made one; never stops the turn. */
async function readDco(ctx, userId, date) {
  try {
    const rows = await ctx.db.select(
      `user_daily_state?user_id=eq.${userId}&date=eq.${date}&select=dco&limit=1`,
    );
    return rows?.[0]?.dco || null;
  } catch {
    return null;
  }
}

/** A short, stable key for one person's turns in today's thread (the provider's prompt cache). */
export function cacheKeyFor(userId) {
  let h = 0x811c9dc5;
  for (const ch of String(userId || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `gremly-brief-${h.toString(16)}`;
}

/**
 * One message in today's thread, answered by the agent, or by the day turn
 * when the agent is switched off or cannot finish.
 * @param {object} p
 * @param {object} p.env
 * @param {string} p.userId
 * @param {object} p.body the app's request (DayTurnRequest, plus timezone and tasks)
 * @param {boolean} p.useAgent AGENT_BRIEF
 * @param {(body: object) => Promise<object|null>} p.dayTurn asks the day turn, as before
 * @param {(line: string) => void} [p.onStatus]
 * @param {object} [p.deps] { person, ctx, models, agent, dayEndHour } for tests and replays
 * @returns {Promise<object>} engine 'agent' with reply, card and tasks, or engine
 *   'day_turn' with the day turn's own answer
 */
export async function runBriefTurn({ env, userId, body, useAgent, dayTurn, onStatus, deps = {} }) {
  const fromDayTurn = async (extra = {}) => {
    const data = dayTurn ? await dayTurn(body).catch(() => null) : null;
    return { engine: 'day_turn', ...(data || { about_day: false, error: 'no answer' }), ...extra };
  };
  if (!useAgent) return fromDayTurn();

  const req = readTurnRequest(body || {});
  if (!req.date || !req.text) return { engine: 'agent', error: 'nothing to read' };
  const timezone = typeof body?.timezone === 'string' && body.timezone ? body.timezone : 'UTC';
  const day = dayFrameOf(req);
  const ctx = deps.ctx
    ? { ...deps.ctx, today: req.date, day }
    : toolContext(env, { userId, today: req.date, timezone, day });
  const [person, dco, dayEndHour] = await Promise.all([
    deps.person || personIdentity(env, userId),
    readDco(ctx, userId, req.date),
    // when their day ends, so the small hours read as the end of it
    deps.dayEndHour ?? dayEndHourOf(env, userId),
  ]);

  const r = await runAgent({
    surface: 'brief',
    persona: briefPersona(person),
    context: dayContext(req, dco, readWrap(body?.wrap), dayEndHour),
    cacheKey: cacheKeyFor(userId),
    history: req.history,
    message: req.text,
    ctx,
    nowMin: req.now,
    dayEndHour,
    tasks: Array.isArray(body?.tasks) ? body.tasks : [],
    onStatus,
    firstStatus: 'Looking at your day',
    models: deps.models,
    deps: deps.agent,
  });
  const how = {
    model: r.model,
    ms: r.ms,
    stopped: r.stopped,
    tools: r.steps.filter((s) => s.kind === 'tool').map((s) => s.name),
    prompt_version: BRIEF_AGENT_VERSION,
  };
  if (r.ok) return { engine: 'agent', reply: r.reply, card: r.card, tasks: r.tasks, ...how };
  console.warn('[BriefTurn] the agent could not finish, the day turn answers', r.error);
  return fromDayTurn({ agent_error: String(r.error || 'failed').slice(0, 200), agent: how });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether today's thread answers the message itself. One it does not answer
 * (nothing to say and no card) goes on to normal chat in the app (useDayTurn),
 * and chat runs its own correction check on it, so it is checked there, once.
 */
export function answeredInThread(result) {
  if (!result || result.error) return false;
  if (result.engine === 'agent')
    return !!(String(result.reply || '').trim() || result.card?.length);
  return !!(result.about_day && (result.reply || result.changes?.length));
}

/**
 * After the answer is sent, what they just said reaches Gremly's memory the way
 * a chat message does: when they say Gremly has something about their life
 * wrong, the context pipeline corrects it straight away. The message is the one
 * checked; the conversation before it and the reply are its background.
 *
 * @param {object} p
 * @param {object} p.env
 * @param {string} p.userId
 * @param {object} p.body the app's request
 * @param {object|null} p.result what answered, as the route sends it
 * @param {object} [p.deps] { checkForCorrection } for tests
 * @returns {Promise<{sent: number}>}
 */
export async function learnFromTurn({ env, userId, body, result, deps = {} }) {
  const req = readTurnRequest(body || {});
  if (!req.text || !answeredInThread(result)) return { sent: 0 };
  // an answer to one of Gremly's questions is saved by the app as the answer
  // (lib/wrapup, answerQuestion), so it is not read a second time here
  if (readWrap(body?.wrap)?.answering) return { sent: 0 };
  const lines = req.history.map((m) => `${m.role === 'user' ? 'User' : 'Gremly'}: ${m.content}`);
  lines.push(`User: ${req.text}`);
  if (typeof result?.reply === 'string' && result.reply) lines.push(`Gremly: ${result.reply}`);
  const check = deps.checkForCorrection || checkForCorrection;
  return check({
    conversationText: lines.join('\n\n'),
    latest: req.text,
    chatId: typeof body?.chat_id === 'string' && UUID.test(body.chat_id) ? body.chat_id : null,
    userId,
    env,
    surface: 'brief',
  });
}

/**
 * The route's answer: status lines while the turn runs, then the result, as
 * server-sent events ({ status } lines, then { done: true, ... }). The stream
 * closes with the result; learning from the turn runs after that, so it adds
 * no wait.
 */
export function briefTurnResponse({ waitUntil, ...p }) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let open = true;
  const send = async (obj) => {
    if (!open) return;
    try {
      await writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
    } catch {
      open = false;
    }
  };
  const work = (async () => {
    let result = null;
    try {
      await send({ ping: true });
      result = await runBriefTurn({ ...p, onStatus: (line) => void send({ status: line }) });
      await send({ done: true, ...result });
    } catch (err) {
      console.error('[BriefTurn] failed', err);
      await send({ done: true, error: 'failed' });
    } finally {
      open = false;
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
    if (result)
      await learnFromTurn({
        env: p.env,
        userId: p.userId,
        body: p.body,
        result,
        deps: p.deps?.learn,
      }).catch((err) => console.warn('[BriefTurn] learning from the turn failed', err?.message));
  })();
  if (typeof waitUntil === 'function') waitUntil(work);
  return new Response(readable, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
