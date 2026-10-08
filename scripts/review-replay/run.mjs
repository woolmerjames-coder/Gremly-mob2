/**
 * The ledger review replay (data fabric stage 4f): a made up person's ledger
 * with things planted in it, looked over by the review that ships
 * (workers/inngest-jobs/context/review.js), in shadow, so nothing is written.
 * Every name and fact here is made up.
 *
 *   scripts/review-replay/run.sh [--repeat n] [--label name]
 *
 * What is planted, and what is checked, by the facts each question rests on:
 * - an occasion on two days (a birthday kept from a trip around it, and the
 *   day itself): a question that rests on both, that needs an answer;
 * - someone with two places in their life: a question that rests on both;
 * - work meetings and an entry made to try the app: a tidy up may set them
 *   aside, and only them;
 * - plans whose days passed with nothing to say what happened: a tidy up may
 *   ask whether they happened, and only about plans, never one about a todo
 *   or calendar entry they keep, which says itself how it stands;
 * - what must never be in a tidy up: their people, an occasion, work they
 *   care about, anything private or about health.
 *
 * The bar, set before the runs: the occasion on two days found every run,
 * nothing that must never be set aside ever in a tidy up, nothing private in
 * anything, and no more questions than the caps.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment;
 * CONTEXT_MODEL_REVIEW=provider:model tries another model.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeDb, LIFE_SUPABASE_URL } from '../life-replay/fakeDb.mjs';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { reviewLedger, REVIEW_CAPS, REVIEW_PROMPT_VERSION } from '../../workers/inngest-jobs/context/review.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 1));
const label = flag('--label') || REVIEW_PROMPT_VERSION;
const USER = 'review-replay-user';
const TZ = 'America/New_York';

// the clock: Thursday 12 November 2026
const RealDate = globalThis.Date;
const offset = RealDate.parse('2026-11-12T15:00:00Z') - RealDate.now();
class ReplayDate extends RealDate {
  constructor(...a) {
    if (a.length) super(...a);
    else super(RealDate.now() + offset);
  }
  static now() {
    return RealDate.now() + offset;
  }
}
globalThis.Date = ReplayDate;

const MODEL_HOSTS = ['api.openai.com', 'generativelanguage.googleapis.com', 'api.anthropic.com'];
const realFetch = globalThis.fetch.bind(globalThis);
let current = null;
const usage = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.startsWith(LIFE_SUPABASE_URL)) {
    if (new URL(url).pathname.endsWith('/ai_usage')) {
      try {
        const body = JSON.parse(init.body);
        usage.push(...(Array.isArray(body) ? body : [body]));
      } catch {
        // nothing to keep
      }
      return new Response('', { status: 201 });
    }
    return current.handle(url, init);
  }
  if (MODEL_HOSTS.includes(new URL(url).host)) return realFetch(input, init);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
installAiUsageLogging();

const env = {
  SUPABASE_URL: LIFE_SUPABASE_URL,
  SUPABASE_SERVICE_KEY: 'replay',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('CONTEXT_MODEL_'))),
};

let n = 0;
const fact = (key, statement, over = {}) => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  key,
  user_id: USER,
  statement,
  kind: 'event',
  timing: 'day',
  state: 'current',
  about_date: null,
  about_date_end: null,
  private: false,
  health: false,
  source_table: 'scope_chat_messages',
  last_confirmed_at: '2026-10-01T09:00:00Z',
  ...over,
});

/**
 * The ledger. groups: which planted thing each fact belongs to. never: a fact
 * that must never be in a tidy up.
 */
const LEDGER = [
  // an occasion on two days
  fact('bday-trip', "Noor's birthday is on 25 April.", { timing: 'yearly', about_date: '2026-04-25', source_table: 'todos' }),
  fact('bday-day', 'Noor turned 35 on 30 April.', { state: 'happened', about_date: '2026-04-30' }),
  // someone in two places
  fact('mira-sister', 'Mira is Noor\'s sister.', { kind: 'relationship', timing: 'standing' }),
  fact('mira-cousin', 'Mira is Noor\'s cousin, who she grew up with.', { kind: 'relationship', timing: 'standing', last_confirmed_at: '2026-10-20T09:00:00Z' }),
  // not about their life
  fact('meet-sync', 'Noor has a weekly team sync on Mondays.', { kind: 'routine', timing: 'standing', source_table: 'synced_calendar_events', item_table: 'synced_calendar_events' }),
  fact('meet-status', 'Noor has a project status call on 2 October.', { state: 'planned', about_date: '2026-10-02', source_table: 'synced_calendar_events', item_table: 'synced_calendar_events' }),
  fact('meet-budget', 'Noor has a budget review meeting on 29 September.', { state: 'planned', about_date: '2026-09-29', source_table: 'synced_calendar_events', item_table: 'synced_calendar_events' }),
  fact('app-test', 'Noor added a todo called test test 123.', { state: 'current', source_table: 'todos' }),
  // plans whose days passed, nothing to say what happened
  fact('plan-bank', 'Noor plans to call the bank about the mortgage on 1 October.', { state: 'planned', about_date: '2026-10-01' }),
  fact('plan-jacket', 'Noor plans to return the jacket by 25 September.', { state: 'planned', about_date: '2026-09-25', source_table: 'todos', item_table: 'todos' }),
  fact('plan-tiles', 'Noor plans to pick up the bathroom tiles on 26 September.', { state: 'planned', about_date: '2026-09-26' }),
  fact('plan-sam', 'Noor plans dinner with Sam on 3 October.', { state: 'planned', about_date: '2026-10-03' }),
  // never in a tidy up
  fact('mum-70', "Noor's mum turns 70 on 20 November.", { state: 'planned', about_date: '2026-11-20' }),
  fact('eli-kit', 'Eli wants a proper glaze kit of his own.', { kind: 'preference', timing: 'standing' }),
  fact('hartley', 'Noor leads the Hartley account for her manager Priya.', { kind: 'situation', timing: 'standing' }),
  fact('grant', 'Noor expects to hear about the grant decision by 13 November.', { state: 'planned', about_date: '2026-11-13' }),
  fact('physio', 'Noor has a physio appointment for her knee on 20 September.', { state: 'planned', about_date: '2026-09-20', health: true, source_table: 'synced_calendar_events' }),
  fact('journal-private', 'Noor has been sleeping badly with the work prep.', { kind: 'situation', timing: 'standing', private: true }),
  // ordinary life, for the review to leave alone
  fact('swim', 'Noor swims before work.', { kind: 'routine', timing: 'standing' }),
  fact('veg', 'Noor is vegetarian.', { kind: 'preference', timing: 'standing' }),
  fact('anniv', "Noor and Eli's anniversary is on 12 November.", { timing: 'yearly', about_date: '2025-11-12' }),
  fact('lisbon', 'Noor has a work trip to Lisbon from 17 to 20 November.', { timing: 'span', state: 'planned', about_date: '2026-11-17', about_date_end: '2026-11-20' }),
];
const keyOf = new Map(LEDGER.map((f) => [f.id, f.key]));
const NEVER_TIDY = ['mum-70', 'eli-kit', 'hartley', 'grant', 'physio', 'journal-private', 'swim', 'veg', 'anniv', 'lisbon', 'mira-sister', 'mira-cousin', 'bday-trip', 'bday-day'];
const PRIVATE = ['physio', 'journal-private'];
const NOT_LIFE = ['meet-sync', 'meet-status', 'meet-budget', 'app-test'];
// plans about an item they keep, or from their calendar: the item says how it stands
const ITEM_PLANS = ['meet-status', 'meet-budget', 'plan-jacket'];

function freshDb() {
  return fakeDb(
    {
      life_facts: LEDGER.map(({ key, ...f }) => ({ ...f })),
      gremly_questions: [],
      cortex_preferences: [{ owner_id: USER, day_boundary_hour: 3 }],
      notification_preferences: [{ user_id: USER, timezone: TZ }],
      user_profiles: [{ user_id: USER, timezone: TZ }],
    },
    { person_identity: () => [{ first_name: 'Noor', pronouns: 'she/her', identity: {} }] },
  );
}

async function runOnce(i) {
  current = freshDb();
  const started = RealDate.now();
  const spent = usage.length;
  let out = null;
  let error = null;
  try {
    out = await aiContext.run({ env, worker: 'replay', job: 'review-replay', userId: USER }, () =>
      reviewLedger(env, USER, { shadow: true, runId: `review-replay-${i}` }),
    );
  } catch (err) {
    error = String(err?.message || err).slice(0, 300);
  }
  await new Promise((r) => setTimeout(r, 300));
  const cost = usage.slice(spent).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const rows = out?.rows || [];
  const keys = (r) => (r.rests_on || []).map((x) => keyOf.get(x.id) || x.id);
  const conflicts = rows.filter((r) => r.kind === 'fact');
  const tidy = rows.filter((r) => r.kind === 'tidy');
  const has = (r, a, b) => keys(r).includes(a) && keys(r).includes(b);
  const checks = [
    {
      name: 'the occasion on two days is asked, and needs an answer',
      ok: conflicts.some((r) => has(r, 'bday-trip', 'bday-day') && r.weight === 'needs'),
    },
    { name: 'someone in two places is asked', ok: conflicts.some((r) => has(r, 'mira-sister', 'mira-cousin')), soft: true },
    { name: 'nothing that must stay is in a tidy up', ok: tidy.every((r) => keys(r).every((k) => !NEVER_TIDY.includes(k))) },
    { name: 'a set aside holds only what is not about their life', ok: tidy.filter((r) => r.proposed_change?.type === 'set_aside').every((r) => keys(r).every((k) => NOT_LIFE.includes(k))) },
    { name: 'nothing private anywhere', ok: rows.every((r) => keys(r).every((k) => !PRIVATE.includes(k))) },
    { name: 'no plan about an item they keep is asked whether it happened', ok: tidy.filter((r) => r.proposed_change?.type === 'happened').every((r) => keys(r).every((k) => !ITEM_PLANS.includes(k))) },
    { name: 'no fact in two questions', ok: new Set(rows.flatMap(keys)).size === rows.flatMap(keys).length },
    { name: 'within the caps', ok: conflicts.length <= REVIEW_CAPS.conflicts && tidy.length <= REVIEW_CAPS.set_aside + REVIEW_CAPS.passed },
    { name: 'the work meetings are offered to set aside', ok: tidy.some((r) => r.proposed_change?.type === 'set_aside' && keys(r).some((k) => k.startsWith('meet-'))), soft: true },
    { name: 'passed plans are asked about', ok: tidy.some((r) => r.proposed_change?.type === 'happened'), soft: true },
  ];
  return { i, ms: RealDate.now() - started, error, out, rows, keys: rows.map(keys), checks, cost };
}

const runs = [];
for (let i = 1; i <= repeat; i++) {
  const r = await runOnce(i);
  runs.push(r);
  console.log(
    `run ${i}: ${r.error ? `ERROR ${r.error}` : `${r.rows.length} questions; ${r.checks.map((c) => `${c.ok ? 'ok' : c.soft ? 'miss' : 'FAIL'} ${c.name}`).join('; ')}`}`,
  );
}

const hard = runs.reduce((s, r) => s + r.checks.filter((c) => !c.soft && !c.ok).length, 0);
const L = [
  `# Ledger review replay (${label}), ${runs.length} runs`,
  '',
  `Hard checks failed: ${hard}. Cost a run $${(runs.reduce((s, r) => s + r.cost, 0) / runs.length).toFixed(4)}. Meets the bar: ${hard === 0 && runs.every((r) => !r.error) ? 'yes' : 'no'}.`,
  '',
];
for (const r of runs) {
  L.push(`## Run ${r.i} (${(r.ms / 1000).toFixed(1)}s)`, '');
  if (r.error) L.push(`Error: ${r.error}`, '');
  L.push(`Found: ${JSON.stringify(r.out?.found || {})}; skipped ${JSON.stringify(r.out?.skipped || {})}`, '');
  r.rows.forEach((row, k) =>
    L.push(
      `- ${row.kind}${row.proposed_change?.type ? ` (${row.proposed_change.type})` : ''}${row.weight ? `, ${row.weight}` : ''}: "${row.question}" [${row.choices.join(' / ')}] on ${r.keys[k].join(', ')}`,
    ),
  );
  L.push('', ...r.checks.map((c) => `- ${c.ok ? 'ok' : c.soft ? 'miss' : 'FAIL'}: ${c.name}`), '');
}
const dir = join(HERE, 'out');
mkdirSync(dir, { recursive: true });
const stamp = new RealDate().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = join(dir, `report-${label}-${stamp}.md`);
writeFileSync(file, L.join('\n'));
console.log(`report: ${file}`);
