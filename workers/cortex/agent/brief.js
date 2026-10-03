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
// ============================================================================

import {
  CARE_RULES,
  PRIVATE_RULES,
  WRITING_RULES,
  personBlock,
} from '../../inngest-jobs/careRules.js';
import { readTurnRequest } from '../../inngest-jobs/brief/dayTurn.js';
import { clockTime } from '../../inngest-jobs/brief/writer.js';
import { personIdentity, weekdayName } from '../../shared/db.js';
import { runAgent } from './run.js';
import { toolContext } from './tools/index.js';
import { AGENT_PROMPT_VERSION } from './prompt.js';

export const BRIEF_AGENT_VERSION = `brief-2026-10-03c/${AGENT_PROMPT_VERSION}`;

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

/** The day in words, with the ids the tools take. */
export function renderDay(req) {
  const L = [];
  L.push(`TODAY: ${weekdayName(req.date)} ${req.date}. TIME NOW: ${clockTime(req.now)}.`);
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
      ? `THE PLAN ON SCREEN, ${req.plan.status === 'locked' ? 'LOCKED IN' : 'A PROPOSAL'} (id | time | title):\n${req.plan.items
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
    WRITING_RULES,
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

/** What Gremly knows about today, with their latest message: what the day is about, then the day itself. */
export function dayContext(req, dco = null) {
  const meaning = dayMeaning(dco);
  return `WHAT YOU KNOW ABOUT TODAY\n${meaning ? `${meaning}\n\n` : ''}${renderDay(req)}`;
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
 * @param {object} [p.deps] { person, ctx, models, agent } for tests and replays
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
  const [person, dco] = await Promise.all([
    deps.person || personIdentity(env, userId),
    readDco(ctx, userId, req.date),
  ]);

  const r = await runAgent({
    surface: 'brief',
    persona: briefPersona(person),
    context: dayContext(req, dco),
    cacheKey: cacheKeyFor(userId),
    history: req.history,
    message: req.text,
    ctx,
    nowMin: req.now,
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

/**
 * The route's answer: status lines while the turn runs, then the result, as
 * server-sent events ({ status } lines, then { done: true, ... }).
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
    try {
      await send({ ping: true });
      const result = await runBriefTurn({ ...p, onStatus: (line) => void send({ status: line }) });
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
