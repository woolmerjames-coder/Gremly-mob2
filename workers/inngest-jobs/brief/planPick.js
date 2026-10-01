/**
 * The plan picker (Daily brief in Chat): which of today's candidates go in a
 * plan, each with a time-of-day window and a one-line reason, plus Gremly's
 * line before the plan card. The app builds the pool from its own data (a
 * rule, never a model) and places the picks with its slot fitter, so this
 * call never decides times and can never add something that is not in the
 * pool.
 *
 * It also reads a change typed while a plan is open ("move the run after 6"),
 * returning remove, add or move operations by ref; the app re-fits.
 *
 * Prompt policy: semantic rules only, no examples, no word lists.
 */

import { CARE_RULES, WRITING_RULES, PRIVATE_RULES, personBlock } from '../careRules';
import { jsonCall, modelFor } from '../context/llm';
import { db, userTimezone, localDate, personIdentity } from '../context/db';
import { noDashes, stripRefs, clockTime } from './writer';

export const PLAN_PICK_PROMPT_VERSION = 'plan-pick-2026-10-01b';
const DAY_END = 22 * 60;

function trim(text, n) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** "13:15" → 795; anything else → null */
export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : null;
}

const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Clean the app's request: only what the picker may see, every item with a ref. */
export function readRequest(body) {
  const num = (v, lo, hi) =>
    v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
      ? Math.min(hi, Math.max(lo, Math.round(Number(v))))
      : null;
  const now = num(body.now, 0, 24 * 60) ?? 0;
  const from = Math.max(now, num(body.gap_from, 0, 24 * 60) ?? now);
  const pool = (Array.isArray(body.pool) ? body.pool : [])
    .filter((p) => p && typeof p.id === 'string' && p.id.length <= 64)
    .slice(0, 40)
    .map((p, i) => ({
      ref: `p${i + 1}`,
      id: p.id,
      kind: ['todo', 'habit', 'reach'].includes(p.kind) ? p.kind : 'todo',
      title: trim(p.title, 100),
      minutes: num(p.minutes, 5, 480),
      why: trim(p.why, 140),
      window:
        Array.isArray(p.window) && p.window.length === 2
          ? [num(p.window[0], 0, 1440), num(p.window[1], 0, 1440)]
          : null,
    }));
  const meetings = (Array.isArray(body.meetings) ? body.meetings : [])
    .slice(0, 40)
    .map((m) => ({
      title: trim(m.title, 80),
      start: num(m.start, 0, 1440),
      end: num(m.end, 0, 1440),
    }))
    .filter((m) => m.start !== null && m.end !== null && m.end > m.start);
  const live = Array.isArray(body.live_plan)
    ? body.live_plan
        .map((x) => ({ id: x.id, start: num(x.start, 0, 1440), end: num(x.end, 0, 1440) }))
        .filter((x) => typeof x.id === 'string' && x.start !== null)
    : [];
  return {
    mode: body.mode === 'edit' ? 'edit' : 'pick',
    forDay:
      typeof body.for_day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.for_day)
        ? body.for_day
        : null,
    now,
    from,
    pool,
    meetings,
    live,
    text: trim(body.text, 500),
  };
}

export function renderPlanInput(req, ctx) {
  const L = [];
  if (ctx.otherDay) {
    L.push(`PLANNING ANOTHER DAY: ${ctx.otherDay}. PLANNING FROM ${clockTime(req.from)} TO 10pm.`);
  } else {
    L.push(`TIME NOW: ${clockTime(req.now)}. PLANNING FROM ${clockTime(req.from)} TO 10pm.`);
  }
  L.push(
    `MEETINGS STILL AHEAD: ${
      req.meetings
        .filter((m) => m.end > req.from)
        .map((m) => `${clockTime(m.start)} to ${clockTime(m.end)} ${m.title}`)
        .join('; ') || 'none'
    }`,
  );
  L.push(
    `CANDIDATES (ref | kind | title | minutes if known | why it is a candidate | usual time of day):\n${req.pool
      .map(
        (p) =>
          `${p.ref} | ${p.kind === 'reach' ? 'suggestion from what they said' : p.kind} | ${p.title} | ${p.minutes ? `${p.minutes} min` : 'unknown'} | ${p.why || '-'} | ${p.window ? `${clockTime(p.window[0])} to ${clockTime(p.window[1])}` : 'any'}`,
      )
      .join('\n')}`,
  );
  if (ctx.dayShape) L.push(`THE DAY, AS THE CONTEXT READS IT: ${trim(ctx.dayShape, 240)}`);
  if (ctx.claims?.length)
    L.push(
      `WHAT HAS A REAL CLAIM ON TODAY: ${ctx.claims.map((c) => `${trim(c.title, 80)}: ${trim(c.why, 120)}`).join('; ')}`,
    );
  if (ctx.reach) L.push(`WHY THE SUGGESTION IS WORTH DOING TODAY: ${trim(ctx.reach.why, 200)}`);
  if (ctx.reaction) L.push(ctx.reaction);
  if (req.mode === 'edit') {
    const byId = new Map(req.pool.map((p) => [p.id, p]));
    L.push(
      `THE PLAN ON SCREEN (ref | time | title):\n${
        req.live
          .map((x) => {
            const p = byId.get(x.id);
            return p ? `${p.ref} | ${clockTime(x.start)} | ${p.title}` : null;
          })
          .filter(Boolean)
          .join('\n') || '(empty)'
      }`,
    );
    L.push(`WHAT THEY TYPED: "${req.text}"`);
  }
  return L.join('\n');
}

const PICK_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          after: { type: 'string' },
          before: { type: 'string' },
          minutes: { type: 'integer' },
          reason: { type: 'string' },
        },
        required: ['ref', 'after', 'before', 'minutes', 'reason'],
      },
    },
  },
  required: ['intro', 'picks'],
};

const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    is_plan_change: { type: 'boolean' },
    ops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['remove', 'add', 'move'] },
          ref: { type: 'string' },
          after: { type: 'string', nullable: true },
          before: { type: 'string', nullable: true },
        },
        required: ['op', 'ref', 'after', 'before'],
      },
    },
  },
  required: ['is_plan_change', 'ops'],
};

function pickSystem(person) {
  return {
    fixed: `You help Gremly, a warm, shame-free companion, suggest a light plan for the rest of someone's day. Code places each item at an exact time afterwards, so you only choose what goes in and roughly when.

${CARE_RULES}

WHAT YOU RETURN
- picks: a few candidates worth doing today, most important first, chosen only from CANDIDATES by ref. Prefer what has a real claim on today, then habits behind for the week, then what is simply due. The suggestion from what they said goes in only when the reason for it fits today. Leave at least half of the time between PLANNING FROM and 10pm empty once meetings are counted, so the day has room if it runs over. Fewer is better than crowded.
- after and before: the time-of-day window each pick fits, as 24-hour HH:MM, inside the planning hours. Use the usual time of day when one is given, and common sense for the rest (exercise not straight after a large block of meetings, errands while shops are open, winding-down habits in the evening).
- minutes: how long it takes. Use the minutes given; when unknown, estimate a realistic length.
- reason: a few words on why it is in the plan, taken from why it is a candidate. Never invent a fact.
- intro: one or two short chat sentences in Gremly's voice that come before the plan card, about the plan only: what it makes room for, the suggestion from what they said with its reason if you picked it, and that the rest is kept light. Mention no times and no meetings, and do not list the items; the card shows them. Talk about a todo or habit the way a person would say it, rather than pasting its title in as a noun.

VOICE
Warm, plain and brief. Suggest, never instruct. Never use the word should.

${PRIVATE_RULES}

${WRITING_RULES}`,
    varying: personBlock(person),
  };
}

function editSystem(person) {
  return {
    fixed: `A plan for the rest of someone's day is on screen in their chat with Gremly, and they typed a message. Decide whether the message asks to change that plan, and if so, how.

WHAT YOU RETURN
- is_plan_change: true only when the message asks to take something out of the plan, put something in, or move something to another time. Anything else (a question, a correction about their life, small talk) is false, with no ops.
- ops: one entry per change, naming the item by ref from CANDIDATES. remove takes it out. add puts in a candidate that is not in the plan. move keeps it in the plan at another time. after and before give the window they asked for as 24-hour HH:MM (after only, before only, or both); leave both empty when they gave no time, and for remove.
- Never name anything that is not in CANDIDATES.`,
    varying: personBlock(person),
  };
}

/** Picks whose refs are in the pool, with windows inside the planning hours. */
export function checkPicks(output, req) {
  const byRef = new Map(req.pool.map((p) => [p.ref, p]));
  const seen = new Set();
  const picks = [];
  const dropped = [];
  for (const p of output.picks || []) {
    const item = byRef.get(p?.ref);
    if (!item || seen.has(item.id)) {
      dropped.push(p?.ref ?? null);
      continue;
    }
    seen.add(item.id);
    let from = parseHHMM(p.after) ?? req.from;
    let to = parseHHMM(p.before) ?? DAY_END;
    from = Math.max(req.from, Math.min(from, DAY_END));
    to = Math.min(DAY_END, Math.max(to, from));
    if (to - from < 15) {
      from = req.from;
      to = DAY_END;
    }
    const minutes = item.minutes ?? Math.min(240, Math.max(5, Math.round(Number(p.minutes) || 30)));
    picks.push({
      id: item.id,
      window: [from, to],
      minutes,
      estimated: item.minutes ? false : true,
      reason: noDashes(stripRefs(trim(p.reason, 80))) || item.why || null,
    });
  }
  return { picks, dropped };
}

export function checkOps(output, req) {
  if (!output?.is_plan_change) return { isPlanChange: false, ops: [] };
  const byRef = new Map(req.pool.map((p) => [p.ref, p]));
  const ops = [];
  for (const o of output.ops || []) {
    const item = byRef.get(o?.ref);
    if (!item || !['remove', 'add', 'move'].includes(o.op)) continue;
    const after = parseHHMM(o.after);
    const before = parseHHMM(o.before);
    ops.push({
      op: o.op,
      id: item.id,
      window:
        o.op === 'remove' || (after === null && before === null)
          ? null
          : [Math.max(req.from, after ?? req.from), Math.min(DAY_END, before ?? DAY_END)],
    });
  }
  return { isPlanChange: ops.length > 0, ops };
}

async function planContext(env, userId, forDay) {
  const tz = await userTimezone(env, userId);
  const today = localDate(tz);
  if (forDay && forDay !== today) {
    // tomorrow's plan: today's claims and reach are not about that day
    const person = await personIdentity(env, userId);
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(`${forDay}T12:00:00Z`),
    );
    return {
      person,
      dayShape: null,
      claims: [],
      reach: null,
      reaction: null,
      otherDay: `${weekday} ${forDay}`,
    };
  }
  const [rows, person] = await Promise.all([
    db(env).select(`user_daily_state?user_id=eq.${userId}&date=eq.${today}&select=dco`),
    personIdentity(env, userId),
  ]);
  const dco = rows?.[0]?.dco || {};
  const brief = dco.brief || {};
  return {
    person,
    dayShape: brief.day_shape || null,
    claims: Array.isArray(brief.claims) ? brief.claims : [],
    reach: brief.reach || null,
    reaction: null,
  };
}

/** The model step, given the request and its context (the corpus calls this directly). */
export async function runPlanPick(env, req, ctx) {
  const input = renderPlanInput(req, ctx);
  if (req.mode === 'edit') {
    const { output, model } = await jsonCall(env, {
      primary: modelFor(env, 'planPick'),
      fallback: modelFor(env, 'planPickFallback'),
      system: editSystem(ctx.person),
      user: input,
      schema: EDIT_SCHEMA,
      maxTokens: 1500,
      effort: 'low',
      thinking: 'low',
    });
    return { ...checkOps(output, req), model, input, prompt_version: PLAN_PICK_PROMPT_VERSION };
  }
  const { output, model } = await jsonCall(env, {
    primary: modelFor(env, 'planPick'),
    fallback: modelFor(env, 'planPickFallback'),
    system: pickSystem(ctx.person),
    user: input,
    schema: PICK_SCHEMA,
    maxTokens: 2500,
    effort: 'low',
    thinking: 'low',
  });
  const { picks, dropped } = checkPicks(output, req);
  return {
    intro: noDashes(stripRefs(trim(output.intro, 300))) || null,
    picks,
    dropped: dropped.length,
    model,
    input,
    prompt_version: PLAN_PICK_PROMPT_VERSION,
  };
}

export async function pickPlan(env, userId, body) {
  const req = readRequest(body);
  if (!req.pool.length) return { picks: [], intro: null, reason: 'empty pool' };
  const ctx = await planContext(env, userId, req.forDay);
  const { input: _input, ...result } = await runPlanPick(env, req, ctx);
  if (result.dropped) {
    console.warn(
      `[ALERT][PlanPick] dropped ${result.dropped} pick(s) not in the pool for ${userId}`,
    );
  }
  return result;
}

export async function handlePlanPickApi(request, env, corsResponse) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.user_id === 'string' ? body.user_id : null;
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return corsResponse({ error: 'user_id is required' }, 400);
    }
    return corsResponse(await pickPlan(env, userId, body));
  } catch (e) {
    console.error('[PlanPick] API error:', e);
    return corsResponse({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
}

export { toHHMM };
