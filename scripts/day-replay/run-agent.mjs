/**
 * The day turn's replay suite run against the agent on today's thread
 * (workers/cortex/agent/brief.js), with real models and the same scenarios
 * and checks, so the two can be compared before the thread moves over.
 *
 *   scripts/day-replay/run-agent.sh                         every scenario, Gemini and Luna
 *   scripts/day-replay/run-agent.sh --only three-asks --models gemini
 *   scripts/day-replay/run-agent.sh --repeat 3              each scenario three times
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

const scenarios = only ? SCENARIOS.filter((s) => only.split(',').includes(s.id)) : SCENARIOS;

/** Each scenario's short ids as the uuids real items have, and back. */
function idsFor(s) {
  const to = new Map();
  (s.items || []).forEach((x, i) => to.set(x.id, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`));
  return { to, back: new Map([...to].map(([a, b]) => [b, a])) };
}

function withUuids(body, to) {
  const id = (v) => to.get(v) || v;
  return {
    ...body,
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
    }));
  const habits = (s.items || [])
    .filter((x) => x.kind === 'habit')
    .map((x) => ({
      id: to.get(x.id),
      name: x.title,
      title: x.title,
      frequency: 'daily',
      cadence: 'daily',
      target_per_period: 1,
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
  return {
    select: async (path) => {
      const [table, query = ''] = path.split('?');
      const idEq = /(?:^|&)id=eq\.([^&]+)/.exec(query)?.[1];
      if (table === 'todos' && idEq) return todos.filter((r) => r.id === idEq);
      if (table === 'habits' && idEq) return habits.filter((r) => r.id === idEq);
      if (table === 'todos' && query.includes('due_day=eq.')) {
        const day = /due_day=eq\.([0-9-]+)/.exec(query)[1];
        return todos.filter((r) => r.due_day === day);
      }
      if (table === 'todos' && query.includes('due_day=lt.')) {
        const day = /due_day=lt\.([0-9-]+)/.exec(query)[1];
        return todos.filter((r) => r.due_day && r.due_day < day);
      }
      if (table === 'habits') return habits;
      // the day's picture the brief is written from, when the scenario has one
      if (table === 'user_daily_state') return s.dco ? [{ dco: s.dco }] : [];
      return [];
    },
    rpc: async (fn, a) => {
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
    default:
      return { kind: c.op, id, title: c.title };
  }
}

const STATUS = { proposed: 'proposed', needs_answer: 'needs_answer', not_possible: 'not_possible', done: 'noted' };

function checkAgent(s, r, back) {
  const changes = (r.card || []).map((c) => asDayChange(c, back));
  const checklist = (r.tasks || []).filter((t) => STATUS[t.status]).map((t) => ({ ask: t.ask, status: STATUS[t.status] }));
  const reply = r.reply || '';
  if (s.expect.aboutDay === false) {
    // the agent answers everything: here, a short reply and nothing on the card
    const checks = checkTurn({ ...s, expect: { aboutDay: true, maxChanges: 0 } }, { about_day: true, changes, checklist, reply });
    checks.push({ level: 'fail', name: 'Answers with a reply', ok: !!reply.trim(), detail: reply });
    return { checks, changes, checklist };
  }
  const expect = { ...s.expect, status: (s.expect.status || []).filter((st) => st === 'needs_answer') };
  const checks = checkTurn({ ...s, expect }, { about_day: true, changes, checklist, reply });
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
    console.log(`      card: ${JSON.stringify(r.changes)}  tools: ${(r.out.tools || []).join(', ') || 'none'}  tasks: ${JSON.stringify(r.out.tasks)}`);
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
