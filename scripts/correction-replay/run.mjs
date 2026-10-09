/**
 * The answer replay (data fabric stage 4f): a made up person answers one of
 * Gremly's questions, and the correction path that ships
 * (workers/inngest-jobs/context/corrections.js applyCorrection) applies it to
 * a ledger held in memory. Every name and fact here is made up.
 *
 *   scripts/correction-replay/run.sh [--repeat n] [--only id,id] [--label name]
 *
 * Checked by the facts each answer leaves, never by wording: an occasion's day
 * kept as a date, the fact put right marked so, and an answer that bears out
 * what the ledger holds adding nothing beside it.
 *
 * The bar, set before the runs: every check on every run.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeDb, LIFE_SUPABASE_URL } from '../life-replay/fakeDb.mjs';
import { applyCorrection } from '../../workers/inngest-jobs/context/corrections.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const only = flag('--only')?.split(',') || null;
const label = flag('--label') || 'answers';
const USER = '00000000-0000-4000-8000-0000000000aa';
const TZ = 'America/New_York';

// the clock: Thursday 8 October 2026
const RealDate = globalThis.Date;
const offset = RealDate.parse('2026-10-08T15:00:00Z') - RealDate.now();
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
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.startsWith(LIFE_SUPABASE_URL)) {
    if (new URL(url).pathname.endsWith('/ai_usage')) return new Response('', { status: 201 });
    return current.handle(url, init);
  }
  if (MODEL_HOSTS.includes(new URL(url).host)) return realFetch(input, init);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const env = {
  SUPABASE_URL: LIFE_SUPABASE_URL,
  SUPABASE_SERVICE_KEY: 'replay',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
};

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const fact = (key, statement, over = {}) => ({
  id: uuid(),
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
  last_confirmed_at: '2026-09-01T09:00:00Z',
  ...over,
});

const SCENARIOS = [
  {
    id: 'own-birthday',
    look: 'Two days for their birthday; they tap the right one: the wrong one is put right, and their birthday is kept with its day.',
    facts: [
      fact('b25', "Noor's birthday is on 25 April.", { timing: 'yearly', about_date: '2026-04-25', source_table: 'notes' }),
      fact('b30', 'Noor turned 35 on 30 April.', { state: 'happened', about_date: '2026-04-30' }),
    ],
    question: 'Is your birthday on 25 April or 30 April?',
    restsOn: ['b25', 'b30'],
    said: '30 April',
    check: ({ added, state }) => [
      { name: 'the wrong day put right', ok: state('b25') === 'corrected' },
      { name: 'what happened on the day left as it is', ok: state('b30') === 'happened' },
      { name: 'their birthday kept on 30 April, with its day', ok: added.some((f) => String(f.about_date || '').slice(5, 10) === '04-30') },
    ],
  },
  {
    id: 'bears-out',
    look: "Their answer bears out the day the ledger already holds for someone's birthday: nothing is added beside it.",
    facts: [
      fact('e27', "Eli's birthday is on 27 April.", { timing: 'yearly', state: 'planned', about_date: '2026-04-27' }),
      fact('brunch', 'Noor planned a birthday brunch with Eli on 25 April.', { state: 'planned', about_date: '2026-04-25', source_table: 'notes' }),
    ],
    question: "Is Eli's birthday on 25 April or 27 April?",
    restsOn: ['e27', 'brunch'],
    said: '27 April',
    check: ({ added, state }) => [
      { name: 'the day the ledger holds left as it is', ok: state('e27') === 'planned' },
      { name: 'nothing added beside it', ok: added.length === 0 },
    ],
  },
  {
    id: 'their-own-words',
    look: 'They answer in their own words with a third day: the old day is put right, and the new one kept with its day.',
    facts: [fact('a06', "Noor and Eli's anniversary is on 6 November.", { timing: 'yearly', about_date: '2025-11-06' })],
    question: 'Is your anniversary on 6 November?',
    restsOn: ['a06'],
    said: "Neither, it's the 14th of November",
    check: ({ added, state }) => [
      { name: 'the old day put right', ok: state('a06') === 'corrected' },
      { name: 'the anniversary kept on 14 November, with its day', ok: added.some((f) => String(f.about_date || '').slice(5, 10) === '11-14') },
    ],
  },
];

async function runOne(s, i) {
  const keyOf = new Map(s.facts.map((f) => [f.id, f.key]));
  const idOf = new Map(s.facts.map((f) => [f.key, f.id]));
  const qid = uuid();
  const cid = uuid();
  current = fakeDb({
    life_facts: s.facts.map(({ key, ...f }) => ({ ...f })),
    life_fact_changes: [],
    gremly_questions: [
      {
        id: qid,
        user_id: USER,
        kind: 'fact',
        question: s.question,
        status: 'open',
        about_fact_id: idOf.get(s.restsOn[0]),
        rests_on: s.restsOn.map((k) => ({ table: 'life_facts', id: idOf.get(k) })),
        created_at: '2026-10-08T09:00:00Z',
      },
    ],
    user_corrections: [
      { id: cid, user_id: USER, said: s.said, surface: 'question', target_ref: { id: qid }, status: 'received', created_at: '2026-10-08T14:55:00Z' },
    ],
    life_people: [],
    life_fact_people: [],
    cortex_preferences: [{ owner_id: USER, day_boundary_hour: 3 }],
    notification_preferences: [{ user_id: USER, timezone: TZ }],
    user_profiles: [{ user_id: USER, timezone: TZ }],
  }, { person_identity: () => [{ first_name: 'Noor', pronouns: 'she/her', identity: {} }] });
  const started = RealDate.now();
  try {
    const result = await applyCorrection(env, cid, `answer-replay-${s.id}-${i}`);
    const facts = current.mem.tables.life_facts;
    const added = facts.filter((f) => !keyOf.has(f.id));
    const state = (key) => facts.find((f) => f.id === idOf.get(key))?.state;
    const checks = s.check({ added, state });
    return { id: s.id, i, ms: RealDate.now() - started, ok: checks.every((c) => c.ok), checks, result, added };
  } catch (err) {
    return { id: s.id, i, ok: false, error: String(err?.message || err).slice(0, 300), checks: [] };
  }
}

const chosen = only ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;
const runs = [];
// one at a time: every run has the clock and the fetch to itself
for (const s of chosen) for (let i = 1; i <= repeat; i++) runs.push(await runOne(s, i));

const L = [`# Answer replay (${label}), ${repeat} runs each`, ''];
for (const r of runs) {
  L.push(`- ${r.ok ? 'ok  ' : 'FAIL'} ${r.id} ${r.i}${r.error ? `: ERROR ${r.error}` : ''}`);
  for (const c of r.checks) if (!c.ok) L.push(`    missed: ${c.name}`);
  for (const f of r.added || []) L.push(`    added: ${f.about_date || 'no date'} | ${f.statement}`);
}
L.push('', `${runs.filter((r) => r.ok).length} of ${runs.length} pass every check`);
const dir = join(HERE, 'out');
mkdirSync(dir, { recursive: true });
const file = join(dir, `report-${label}-${new RealDate().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`);
writeFileSync(file, L.join('\n'));
console.log(L.join('\n'));
console.log(`report: ${file}`);
