/**
 * The morning replay (data fabric stage 3): the daily picture of this tree,
 * made by the models that ship, for each made up sample day (days.mjs), with
 * the database answered from the day's rows and nothing written.
 *
 *   scripts/morning-replay/run.sh [--repeat n] [--only id,id] [--label name]
 *
 * Scored by code, never by wording:
 * - every number written in digits in what Gremly wrote is one it was given
 *   (an hour may be on either clock);
 * - where the tree keeps what each line rests on, no line seen at a glance
 *   rests on a fact the day says never to show there;
 * - what the check sent back and left out, the cost and the time.
 *
 * Run it in a tree before a change and after, and review.mjs puts the two
 * side by side for a person to read. OPENAI_API_KEY and GEMINI_TEST_API_KEY
 * come from the environment, and CONTEXT_MODEL_DAILY (provider:model) tries
 * another model for the day.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAYS, PERSON } from './days.mjs';
import { answer, REPLAY_SUPABASE_URL } from './fakeDb.mjs';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import * as daily from '../../workers/inngest-jobs/context/daily.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 1));
const only = flag('--only');
const label = flag('--label') || daily.DCO_PROMPT_VERSION;
const days = only ? DAYS.filter((d) => only.split(',').includes(d.id)) : DAYS;

// Each run has its own day and clock, so the runs can go side by side.
const run = new AsyncLocalStorage();
const RealDate = globalThis.Date;
class ReplayDate extends RealDate {
  constructor(...a) {
    if (a.length) super(...a);
    else super(RealDate.now() + (run.getStore()?.offset || 0));
  }
  static now() {
    return RealDate.now() + (run.getStore()?.offset || 0);
  }
}
globalThis.Date = ReplayDate;

const MODEL_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com'];
const realFetch = globalThis.fetch.bind(globalThis);
const jsonRes = (v, status = 200) =>
  new Response(v === undefined ? null : JSON.stringify(v), {
    status,
    headers: { 'content-type': 'application/json' },
  });
globalThis.fetch = async (input, init = {}) => {
  const s = run.getStore();
  const url = typeof input === 'string' ? input : input?.url || String(input);
  const u = new URL(url);
  const method = String(init.method || 'GET').toUpperCase();
  if (url.startsWith(REPLAY_SUPABASE_URL)) {
    const rest = u.pathname.replace(/^\/rest\/v1\//, '');
    if (rest.startsWith('rpc/')) {
      const fn = rest.slice(4);
      if (fn === 'absence_snapshot') return jsonRes(s.day.absence || null);
      if (fn === 'usage_rollup') return jsonRes(s.day.usage || null);
      if (fn === 'person_identity') return jsonRes([PERSON]);
      return jsonRes(null);
    }
    const table = rest.split('/')[0];
    if (method === 'GET') return jsonRes(answer(s.day, table, decodeURIComponent(u.search)));
    let body = null;
    try {
      body = JSON.parse(init.body);
    } catch {
      body = null;
    }
    if (table === 'ai_usage') s.usage.push(...(Array.isArray(body) ? body : [body]));
    else s.writes.push(table);
    return jsonRes(method === 'POST' ? (Array.isArray(body) ? body : [body]) : []);
  }
  if (MODEL_HOSTS.includes(u.host)) {
    const started = RealDate.now();
    const res = await realFetch(input, init);
    s.calls.push({ host: u.host, status: res.status, ms: RealDate.now() - started, request: typeof init.body === 'string' ? init.body : '' });
    return res;
  }
  s.effects.push(u.host);
  return jsonRes({ ok: true, replay: true });
};

installAiUsageLogging();

const env = {
  SUPABASE_URL: REPLAY_SUPABASE_URL,
  SUPABASE_SERVICE_KEY: 'replay',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  // a model to try in place of the one that ships, as provider:model
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('CONTEXT_MODEL_'))),
};

/** The day's lines as the app and the brief read them, field by field. */
function linesOf(dco) {
  if (!dco) return {};
  const out = {
    headline: dco.brief_headline,
    day_shape: dco.brief?.day_shape,
    lead_what: dco.lead_story?.what,
    lead_why_today: dco.lead_story?.why_today,
    reach_why: dco.brief?.reach?.why,
    return_note: dco.brief?.return?.note,
  };
  (dco.today_focus || []).forEach((t, i) => (out[`today_focus_${i}`] = t));
  (dco.also_matters || []).forEach((t, i) => (out[`also_matters_${i}`] = t));
  (dco.brief?.claims || []).forEach((c, i) => (out[`claims_${i}`] = `${c.title}${c.why ? `: ${c.why}` : ''}`));
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}

/** Every number the model was given for the day, with each hour on both clocks. */
function givenNumbers(calls) {
  const draft = calls.find((c) => c.request.includes('YOUR JOB'));
  if (!draft) return null;
  const text = draft.request;
  const nums = new Set((text.match(/\d+(?:\.\d+)?/g) || []).map(Number));
  for (const m of text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    const h = Number(m[1]);
    nums.add(h % 12 || 12);
  }
  return nums;
}

const GLANCEABLE = /^(headline|day_shape|lead_what|lead_why_today|today_focus_\d+|reach_why)$/;

function score(day, built, calls) {
  const lines = linesOf(built?.dco);
  const given = givenNumbers(calls);
  const invented = [];
  if (given)
    for (const [field, text] of Object.entries(lines))
      for (const n of (String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number))
        if (!given.has(n)) invented.push({ field, number: n });
  // what each kept line rests on, where the tree keeps it
  const kept = built?.kept || null;
  const shown = [];
  if (kept) {
    for (const k of kept) {
      if (!GLANCEABLE.test(k.key)) continue;
      for (const id of k.ids)
        if (day.truth.glanceableNever.includes(id))
          shown.push({ field: k.key, id, why: 'never at a glance' });
    }
  }
  return { invented, glanceable: kept ? shown : null };
}

async function runOne(day) {
  const store = { day, offset: RealDate.parse(day.now) - RealDate.now(), calls: [], usage: [], writes: [], effects: [] };
  const started = RealDate.now();
  let built = null;
  let error = null;
  await run.run(store, async () => {
    try {
      built = await aiContext.run(
        { env, worker: 'replay', job: 'morning-replay', userId: 'replay-user', runId: `replay-${day.id}-${started}` },
        () => daily.buildDcoV4(env, 'replay-user', { tz: day.tz }),
      );
    } catch (err) {
      error = String(err?.stack || err).slice(0, 1500);
    }
  });
  // the usage rows are written after each call returns
  await new Promise((r) => setTimeout(r, 2000));
  const cents = store.usage.reduce((s, r) => s + (Number(r?.cost_usd) || 0), 0) * 100;
  return {
    day: day.id,
    about: day.about,
    ms: RealDate.now() - started,
    error,
    cents: Math.round(cents * 1000) / 1000,
    calls: store.calls.length,
    failed_calls: store.calls.filter((c) => c.status >= 400).length,
    writes: store.writes,
    lines: linesOf(built?.dco),
    anchors: (built?.dco?.named_anchors || []).map((a) => `${a.date} ${a.short_label || a.label}`),
    check: built?.check?.counts || null,
    // what the check did, with the words of each try where the tree keeps them
    flags:
      built?.check?.details?.map((d) => ({
        field: d.key,
        outcome: d.outcome,
        problem: [...(d.first || []), ...(d.second || [])].map((x) => x.say ?? x).join('; '),
        texts: d.texts || [],
        refs: d.refs || [],
      })) ||
      built?.dco?.review_flags ||
      built?.problems ||
      [],
    attempts: built?.attempts ?? null,
    score: score(day, built, store.calls),
  };
}

console.log(`${label}: ${days.length} days, ${repeat} each`);
const runs = await Promise.all(days.flatMap((d) => Array.from({ length: repeat }, () => runOne(d))));
let clean = 0;
for (const r of runs) {
  const ok = !r.error && !r.score.invented.length && !(r.score.glanceable || []).length;
  if (ok) clean++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${r.day} · ${r.ms}ms · ${r.cents} cents · ${r.calls} calls${r.check ? ` · checked ${r.check.checked}, sent back ${r.check.sent_back}, left out ${r.check.left_out}` : ` · ${r.flags.length} flagged, ${r.attempts} drafts`}`,
  );
  if (r.error) console.log(`      error: ${r.error.split('\n')[0]}`);
  for (const i of r.score.invented) console.log(`      a number it was not given: ${i.number} in ${i.field}`);
  for (const g of r.score.glanceable || []) console.log(`      ${g.field} rests on ${g.id} (${g.why})`);
  for (const [field, text] of Object.entries(r.lines)) console.log(`      ${field} | ${text}`);
  for (const f of r.flags) {
    console.log(`      flagged ${f.field}${f.outcome ? ` (${f.outcome})` : ''}: ${String(f.problem || '').slice(0, 220)}`);
    (f.texts || []).forEach((t, i) => {
      if (t) console.log(`        tried: ${t} [${(f.refs?.[i] || []).join(', ')}]`);
    });
  }
}
const total = runs.reduce((s, r) => s + r.cents, 0);
const checked = runs.reduce((s, r) => s + (r.check?.checked || 0), 0);
const leftOut = runs.reduce((s, r) => s + (r.check?.left_out || 0), 0);
console.log(
  `\n${clean} of ${runs.length} runs clean · ${Math.round((total / runs.length) * 1000) / 1000} cents a morning${checked ? ` · ${leftOut} of ${checked} sentences left out` : ''}`,
);
const dir = join(HERE, 'out', `${new RealDate().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${label}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'results.json'), JSON.stringify({ label, runs }, null, 2));
console.log(`Results: ${join(dir, 'results.json')}`);
