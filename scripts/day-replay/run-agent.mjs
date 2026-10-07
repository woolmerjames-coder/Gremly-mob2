/**
 * The day turn's replay suite run against the agent on today's thread
 * (workers/cortex/agent/brief.js), with real models and the same scenarios
 * and checks, so the two can be compared before the thread moves over.
 *
 *   scripts/day-replay/run-agent.sh                         every scenario, Gemini and Luna
 *   scripts/day-replay/run-agent.sh --only three-asks --models gemini
 *   scripts/day-replay/run-agent.sh --repeat 3              each scenario three times
 *   scripts/day-replay/run-agent.sh --set week              only the weekly review's scenarios
 *   scripts/day-replay/run-agent.sh --set day --with-week   the day's scenarios with the week's tools on
 *   scripts/day-replay/run-agent.sh --with-ease             every scenario as an app build that can pause a habit sends it
 *
 * The weekly review's scenarios (week-scenarios.mjs) run with the day's: the
 * request carries the person's week, as an app build that knows it sends it,
 * and their checks look at what was proposed, held and offered, never at the
 * reply's words. --with-week gives every scenario that has no week of its own
 * a plain one (this week's review done, nothing under way), to show the day's
 * scenarios pass with the week's tools and changes on as well as without.
 * --with-ease goes one further: every scenario is sent a week with the habits
 * eased now (none, unless the scenario says), which is what turns on pausing a
 * habit or giving it a lighter version (the change model's ease).
 *
 * Keys come from .audit-keys.local (scripts/chat-audit/keys.mjs). Nothing
 * touches a database: the person's items in each scenario stand in for it.
 * Output goes to scripts/day-replay/out/agent-<time>/results.json (gitignored).
 *
 * The agent's card is in the change model's shape; each row is read back as
 * the day turn's kind of change so the scenario checks apply unchanged. Two
 * checks read differently: the agent answers every message (it has no "not
 * about the day"), so that scenario passes with a reply and no card; and its
 * task list says needs_answer when it asked something it must know, while a
 * request it cannot do (a calendar meeting) passes with no card.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { WEEK_SCENARIOS, plainWeek } from './week-scenarios.mjs';
import { checkTurn } from './checks.mjs';
import { bodyFor } from './body.mjs';
import { runBriefTurn, BRIEF_AGENT_VERSION } from '../../workers/cortex/agent/brief.js';
import { configureModels } from '../../workers/cortex/models.js';
import { runTool } from '../../workers/cortex/agent/tools/index.js';
import { costUsd } from '../../workers/shared/aiUsage.js';
import { AsyncLocalStorage } from 'node:async_hooks';

// Tokens and list price of every model call, per turn: the model's own usage
// figures, read from each reply as it passes.
const turnUsage = new AsyncLocalStorage();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const res = await realFetch(url, init);
  const u = String(url);
  const calls = turnUsage.getStore();
  if (calls && (u.includes('generativelanguage') || u.includes('api.openai.com'))) {
    try {
      const j = await res.clone().json();
      if (j.usageMetadata) {
        const m = j.usageMetadata;
        const cached = m.cachedContentTokenCount || 0;
        calls.push({ model: j.modelVersion || 'gemini-3.8-flash', input: (m.promptTokenCount || 0) - cached, cached, cacheWrite: 0, output: (m.candidatesTokenCount || 0) + (m.thoughtsTokenCount || 0) });
      } else if (j.usage) {
        const cached = j.usage.input_tokens_details?.cached_tokens || j.usage.prompt_tokens_details?.cached_tokens || 0;
        const input = j.usage.input_tokens ?? j.usage.prompt_tokens ?? 0;
        calls.push({ model: j.model || 'gpt-6-luna', input: input - cached, cached, cacheWrite: 0, output: j.usage.output_tokens ?? j.usage.completion_tokens ?? 0 });
      }
    } catch {
      // usage is only for the report
    }
  }
  return res;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = { gemini: 'gemini-3.8-flash', openai: 'gpt-6-luna' };
const models = (flag('--models') || 'gemini,openai').split(',').filter((m) => MODELS[m]);
const only = flag('--only');
// how much the model thinks before each step: none, low (the default), medium
const thinking = flag('--thinking');
const repeat = Math.max(1, Number(flag('--repeat') || 1));
const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';

// which scenarios: the day's, the weekly review's, or both
const set = flag('--set') || 'all';
const withEase = args.includes('--with-ease');
const withWeek = withEase || args.includes('--with-week');
const ALL = [...(set === 'week' ? [] : SCENARIOS), ...(set === 'day' ? [] : WEEK_SCENARIOS)]
  .map((s) => (withWeek && !s.week ? { ...s, week: plainWeek(s.today) } : s))
  // a scenario that says a build is too old to know of pauses keeps its week as it is
  .map((s) => (withEase && s.week && !s.week.eased && !s.noEase ? { ...s, week: { ...s.week, eased: [] } } : s));
const scenarios = only ? ALL.filter((s) => only.split(',').includes(s.id)) : ALL;

/** Each scenario's short ids as the uuids real items have, and back. */
function idsFor(s) {
  const to = new Map();
  (s.items || []).forEach((x, i) => to.set(x.id, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`));
  return { to, back: new Map([...to].map(([a, b]) => [b, a])) };
}

/** The week block with the scenario's short ids as uuids. */
function weekWithUuids(week, id) {
  const u = week.under_way;
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    ...week,
    ...(week.intention?.id ? { intention: { ...week.intention, id: id(week.intention.id) } } : {}),
    ...(week.eased ? { eased: week.eased.map((e) => ({ ...e, habit_id: id(e.habit_id) })) } : {}),
    ...(u
      ? {
          under_way: {
            ...u,
            picks: list(u.picks).map((p) => ({ ...p, item_ids: list(p.item_ids).map(id) })),
            settled: list(u.settled).map((s) => ({
              ...s,
              ...(s.id ? { id: id(s.id) } : {}),
              ...(s.item_ids ? { item_ids: s.item_ids.map(id) } : {}),
            })),
            habit_days: list(u.habit_days).map((h) => ({ ...h, id: id(h.id) })),
            ...(u.placed ? { placed: u.placed.map((p) => ({ ...p, id: id(p.id) })) } : {}),
            ...(u.later ? { later: u.later.map((p) => ({ ...p, id: id(p.id) })) } : {}),
            ...(u.about ? { about: { ...u.about, item_ids: list(u.about.item_ids).map(id) } } : {}),
          },
        }
      : {}),
  };
}

function withUuids(body, to) {
  const id = (v) => to.get(v) || v;
  return {
    ...body,
    ...(body.week ? { week: weekWithUuids(body.week, id) } : {}),
    items: body.items.map((x) => ({ ...x, id: id(x.id) })),
    plan: body.plan ? { ...body.plan, items: body.plan.items.map((x) => ({ ...x, id: id(x.id) })) } : null,
    ...(body.wrap
      ? {
          wrap: {
            ...body.wrap,
            decisions: (body.wrap.decisions || []).map((d) => (d.id ? { ...d, id: id(d.id) } : d)),
            ...(body.wrap.answering?.item
              ? {
                  answering: {
                    ...body.wrap.answering,
                    item: { ...body.wrap.answering.item, id: id(body.wrap.answering.item.id) },
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

/** A stand-in for the database: the scenario's items, answered as the tools ask. */
function dbFor(s, to) {
  const todos = (s.items || [])
    .filter((x) => x.kind === 'todo')
    .map((x) => ({
      id: to.get(x.id),
      name: x.title,
      title: x.title,
      body: '',
      due_day: x.due_day || null,
      due_time: x.due_time ? `${x.due_time}:00` : null,
      time_estimate_minutes: x.minutes || null,
      completed_at: null,
      archived: !!x.archived,
      reminders_json: [],
      // put off for later, with the day it comes back
      resurface_at: x.back_on || null,
    }));
  // the habit days saved (the weekly review)
  const plans = (s.plans || []).map(([habit, day]) => ({ habit_id: to.get(habit), planned_date: day }));
  const habits = (s.items || [])
    .filter((x) => x.kind === 'habit')
    .map((x) => ({
      id: to.get(x.id),
      name: x.title,
      title: x.title,
      frequency: 'daily',
      // daily unless the scenario says how many times a week
      cadence: x.per_week ? 'weekly' : 'daily',
      target_per_period: x.per_week || 1,
      days_active: null,
      time_estimate_minutes: x.minutes || null,
      archived: false,
      reminders_json: [],
      notes: '',
    }));
  const all = [
    ...todos.map((r) => ({ type: 'todo', row: r, day: r.due_day, time: r.due_time })),
    ...habits.map((r) => ({ type: 'habit', row: r, day: null, time: null })),
  ];
  // Gremly's questions in the scenario, each fact with an id of its own
  const asked = (s.asked || []).map((q, i) => ({
    question: q.question,
    fact: { id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, ...q.fact },
  }));
  return {
    select: async (path) => {
      const [table, query = ''] = path.split('?');
      const idEq = /(?:^|&)id=eq\.([^&]+)/.exec(query)?.[1];
      if (table === 'todos' && idEq) return todos.filter((r) => r.id === idEq);
      if (table === 'habits' && idEq) return habits.filter((r) => r.id === idEq);
      // the week board's reads (get_week) and a habit's days (propose_changes)
      const idIn = /(?:^|&)(?:habit_)?id=in\.\(([^)]*)\)/.exec(query)?.[1]?.split(',');
      const from = /(?:due_day|planned_date)=gte\.([0-9-]+)/.exec(query)?.[1];
      const until = /(?:due_day|planned_date)=lte\.([0-9-]+)/.exec(query)?.[1];
      if (table === 'habit_plans') {
        return plans.filter(
          (p) => (!idIn || idIn.includes(p.habit_id)) && (!from || p.planned_date >= from) && (!until || p.planned_date <= until),
        );
      }
      if (table === 'todos' && idIn) return todos.filter((r) => idIn.includes(r.id));
      if (table === 'todos' && from && until) return todos.filter((r) => r.due_day && r.due_day >= from && r.due_day <= until);
      if (table === 'todos' && query.includes('resurface_at=gt.')) {
        const day = /resurface_at=gt\.([0-9-]+)/.exec(query)[1];
        return todos.filter((r) => r.resurface_at && r.resurface_at > day);
      }
      // put off until a day: no day of its own, and that is the day it comes back (get_day)
      if (table === 'todos' && query.includes('resurface_at=eq.')) {
        const day = /resurface_at=eq\.([0-9-]+)/.exec(query)[1];
        return todos.filter((r) => !r.due_day && r.resurface_at === day);
      }
      if (table === 'todos' && query.includes('due_day=eq.')) {
        const day = /due_day=eq\.([0-9-]+)/.exec(query)[1];
        return todos.filter((r) => r.due_day === day);
      }
      if (table === 'todos' && query.includes('due_day=lt.')) {
        const day = /due_day=lt\.([0-9-]+)/.exec(query)[1];
        return todos.filter((r) => r.due_day && r.due_day < day);
      }
      if (table === 'habits') return habits;
      // their connected calendar on the days of the week (get_week, get_day): timed entries only
      if (table === 'synced_calendar_events') {
        if (query.includes('is_all_day=eq.true')) return [];
        // the scenarios are in Los Angeles in October, seven hours behind UTC
        const at = (day, time) => new Date(`${day}T${time}:00-07:00`).toISOString();
        return (s.calendar || []).map(([day, from, until, title], i) => ({
          id: `cal-${i + 1}`,
          title,
          start_at: at(day, from),
          end_at: at(day, until),
          is_all_day: false,
        }));
      }
      // the day's picture the brief is written from, when the scenario has one
      if (table === 'user_daily_state') return s.dco ? [{ dco: s.dco }] : [];
      // Gremly's own questions, each with the fact it was written about, when the scenario has them
      if (table === 'gremly_questions') return asked.map((q) => ({ question: q.question, about_fact_id: q.fact.id }));
      return [];
    },
    rpc: async (fn, a) => {
      // what Gremly remembers (recall), and where a question's fact came from
      if (fn === 'recall_life') return s.memories || [];
      if (fn === 'fact_sources') return asked.map((q) => q.fact).filter((f) => (a.p_fact_ids || []).includes(f.id));
      if (fn !== 'find_items') return [];
      const words = String(a.p_query || '')
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2)
        .map((w) => w.slice(0, 4));
      return all
        .filter((i) => !a.p_types || a.p_types.includes(i.type))
        .filter((i) => !words.length || words.some((w) => i.row.name.toLowerCase().includes(w)))
        .map((i) => ({ type: i.type, id: i.row.id, title: i.row.name, day: i.day, time: i.time, state: 'open', detail: null, snippet: '' }));
    },
  };
}

/** The agent's card row as the day turn's kind of change, for the scenario checks. */
export function asDayChange(c, back) {
  const id = c.id ? back.get(c.id) || c.id : undefined;
  const toMin = (t) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  if (c.op === 'plan') {
    const p = c.plan || {};
    return { kind: p.kind, id: p.id ? back.get(p.id) || p.id : id, title: c.title, start: p.start ?? null, after: p.after ?? null, travel: p.travel === true };
  }
  const f = c.fields || {};
  switch (c.op) {
    // the week's own changes (the weekly review)
    case 'later':
      return { kind: 'later', id, title: c.title, day: f.back_on };
    case 'habit_days':
      return { kind: 'habit_days', id, title: c.title, days: c.days };
    case 'week_shape':
      return { kind: 'week_shape', busy_days: c.shape?.busy_days, hours: c.shape?.hours };
    case 'intention':
      return { kind: 'intention', title: f.text };
    case 'milestone':
      return { kind: 'milestone', title: c.title, day: c.milestone?.date, steps: c.milestone?.steps };
    case 'weekly_day':
      return { kind: 'weekly_day', weekday: f.weekday };
    case 'priority':
      return { kind: 'priority', title: f.text };
    case 'add':
      return {
        kind: 'create_todo',
        type: c.type,
        title: c.title,
        start: toMin(f.time),
        day: f.day ?? f.deadline ?? null,
        bothDates: !!(f.day && f.deadline),
      };
    case 'change':
      if ('time' in f) return { kind: 'retime', id, title: c.title, start: toMin(f.time), day: f.day ?? null };
      if ('day' in f) return { kind: 'move_day', id, title: c.title, day: f.day };
      // the day turn has no deadline; for the date checks it counts as the day it is due by
      if ('deadline' in f) return { kind: 'deadline', id, title: c.title, day: f.deadline };
      if ('name' in f) return { kind: 'rename', id, title: f.name };
      return { kind: 'change', id, title: c.title };
    case 'done':
    case 'log':
      return { kind: 'complete', id, title: c.title };
    case 'archive':
      return { kind: 'cancel', id, title: c.title };
    case 'skip_today':
      return { kind: 'skip_habit', id, title: c.title };
    // a habit paused, given a lighter version or set back to usual: day is its first day
    case 'ease':
      return { kind: 'ease', id, title: c.title, mode: c.ease?.mode, day: c.ease?.first, until: c.ease?.last, note: c.ease?.note || '' };
    default:
      return { kind: c.op, id, title: c.title };
  }
}

const STATUS = { proposed: 'proposed', needs_answer: 'needs_answer', not_possible: 'not_possible', done: 'noted' };

function checkAgent(s, r, back) {
  const changes = (r.card || []).map((c) => asDayChange(c, back));
  const checklist = (r.tasks || []).filter((t) => STATUS[t.status]).map((t) => ({ ask: t.ask, status: STATUS[t.status] }));
  const reply = r.reply || '';
  // what the reply told the app, and the tools the turn used (the weekly review's checks)
  const told = { hold: !!r.hold, offer: !!r.offer, tools: r.tools || [] };
  if (s.expect.aboutDay === false) {
    // the agent answers everything: here, a short reply and nothing on the card
    const checks = checkTurn({ ...s, expect: { aboutDay: true, maxChanges: 0 } }, { about_day: true, changes, checklist, reply, ...told });
    checks.push({ level: 'fail', name: 'Answers with a reply', ok: !!reply.trim(), detail: reply });
    return { checks, changes, checklist };
  }
  const expect = { ...s.expect, status: (s.expect.status || []).filter((st) => st === 'needs_answer') };
  const checks = checkTurn({ ...s, expect }, { about_day: true, changes, checklist, reply, ...told });
  return { checks, changes, checklist };
}

async function runOne(s, modelKey) {
  const { to, back } = idsFor(s);
  const env = { GOOGLE_API_KEY: keys.gemini, OPENAI_API_KEY: keys.openai };
  const calls = [];
  const started = Date.now();
  try {
    const r = await runBriefTurn({
      env,
      userId: USER,
      body: { ...withUuids(bodyFor(s), to), timezone: 'America/Los_Angeles' },
      useAgent: true,
      dayTurn: null,
      deps: {
        person: { first_name: 'Alex', pronouns: null, identity: {} },
        // when their day ends (3am unless the scenario says otherwise)
        dayEndHour: s.dayEnd ?? 3,
        ctx: { env, userId: USER, timezone: 'America/Los_Angeles', cache: new Map(), db: dbFor(s, to) },
        models: { model: MODELS[modelKey], fallback: MODELS[modelKey], thinking: thinking || undefined },
        // every tool call and what it said back, for the results file
        agent: {
          runTool: async (ctx, name, input) => {
            const t = await runTool(ctx, name, input);
            calls.push({ name, input, said: t.text });
            return t;
          },
        },
      },
    });
    const ms = Date.now() - started;
    if (r.engine !== 'agent') return { model: modelKey, ms, error: `the agent did not finish: ${r.agent_error || r.error}` };
    return { model: modelKey, ms, out: r, calls, ...checkAgent(s, r, back) };
  } catch (err) {
    return { model: modelKey, ms: Date.now() - started, error: String(err?.message || err) };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

configureModels({});
const jobs = scenarios.flatMap((s) => models.flatMap((m) => Array.from({ length: repeat }, () => ({ s, m }))));
console.log(`Running ${jobs.length} agent turns (${scenarios.length} messages × ${models.join(', ')} × ${repeat})…`);
const done = await pool(jobs, 4, async ({ s, m }) => {
  const usage = [];
  const r = await turnUsage.run(usage, () => runOne(s, m));
  r.usage = {
    calls: usage.length,
    input: usage.reduce((a, c) => a + c.input + c.cached, 0),
    cached: usage.reduce((a, c) => a + c.cached, 0),
    output: usage.reduce((a, c) => a + c.output, 0),
    usd: usage.reduce((a, c) => a + (costUsd(c) || 0), 0),
  };
  if (r.checks && s.expect.maxModelCalls) {
    r.checks.push({
      level: 'warn',
      name: `At most ${s.expect.maxModelCalls} model calls`,
      ok: r.usage.calls <= s.expect.maxModelCalls,
      detail: String(r.usage.calls),
    });
  }
  const fails = r.checks ? r.checks.filter((c) => c.level === 'fail' && !c.ok) : [];
  const warns = r.checks ? r.checks.filter((c) => c.level === 'warn' && !c.ok) : [];
  console.log(
    `${r.error ? 'ERROR' : fails.length ? 'FAIL ' : 'ok   '} ${s.id} · ${m} · ${r.ms}ms${
      r.error ? ` · ${r.error.slice(0, 160)}` : fails.length ? ` · ${fails.map((f) => f.name).join('; ')}` : ''
    }${warns.length ? ` · warn: ${warns.map((w) => w.name).join('; ')}` : ''}`,
  );
  if (r.out) {
    console.log(`      reply: ${r.out.reply}`);
    console.log(`      card: ${JSON.stringify(r.changes)}  tools: ${(r.out.tools || []).join(', ') || 'none'}  tasks: ${JSON.stringify(r.out.tasks)}${r.out.hold ? `  hold: ${r.out.hold.question}` : ''}${r.out.offer ? '  offer: week' : ''}`);
  }
  return { id: s.id, ...r };
});

console.log('\nBy model (passes every rule · median time · slowest · calls and cost per message):');
for (const m of models) {
  const runs = done.filter((d) => d.model === m);
  const pass = runs.filter((d) => !d.error && d.checks.every((c) => c.level !== 'fail' || c.ok)).length;
  const ms = runs.map((d) => d.ms).sort((a, b) => a - b);
  const cents = runs.map((d) => (d.usage?.usd || 0) * 100).sort((a, b) => a - b);
  const calls = runs.map((d) => d.usage?.calls || 0).sort((a, b) => a - b);
  console.log(
    `  ${m.padEnd(8)} ${pass} of ${runs.length} · ${ms[Math.floor(ms.length / 2)] ?? 0}ms · ${ms.at(-1) ?? 0}ms · ${calls[Math.floor(calls.length / 2)]} model calls · ${cents[Math.floor(cents.length / 2)].toFixed(2)} cents typical, ${cents.at(-1).toFixed(2)} most`,
  );
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'out', `agent-${stamp}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'results.json'),
  JSON.stringify({ meta: { stamp, version: BRIEF_AGENT_VERSION, models: models.map((m) => MODELS[m]), repeat }, results: done }, null, 2),
);
console.log(`Results: ${join(outDir, 'results.json')}`);
