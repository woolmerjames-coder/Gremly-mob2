/**
 * The wrap up replay (agent plan step 10): Gremly's own words for each moment
 * of the evening wrap up, written by the model and path that ship
 * (workers/cortex/wrap/words.js through helperFetch, job wrap_words), next to
 * the fixed sentence the app says today, with the rules every line keeps.
 *
 *   scripts/wrap-replay/run.sh [--only id,id] [--repeat n] [--model gpt-6-luna]
 *
 * Made up evenings are in scenarios.mjs. Real ones, built from someone's own
 * data, go in fixtures/*.json (never committed) and are read when present.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENINGS, ENTRIES, QUESTIONS } from './scenarios.mjs';
import { configureModels } from '../../workers/cortex/models.js';
import { helperFetch } from '../../workers/cortex/helperClient.js';
import {
  factsFrom,
  wrapPrompt,
  readWrapWords,
  WRAP_WORDS_VERSION,
} from '../../workers/cortex/wrap/words.js';
import {
  WRAP_COPY,
  clearLine,
  closeLine,
  missedLine,
  offerLine,
  openerLine,
  partWords,
} from '../../lib/wrapup/words.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const only = flag('--only')?.split(',') || null;
const repeat = Math.max(1, Number(flag('--repeat') || 2));
const model = flag('--model') || 'gpt-6-luna';

configureModels({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  HELPER_MODEL: model,
  HELPER_FALLBACK_MODEL: 'gemini-3.8-flash',
});

// real evenings, when this machine has them
const FIX = join(HERE, 'fixtures');
const real = { evenings: [], entries: [], questions: [] };
if (existsSync(FIX)) {
  for (const f of readdirSync(FIX).filter((x) => x.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(join(FIX, f), 'utf8'));
    real.evenings.push(...(r.evenings || []));
    real.entries.push(...(r.entries || []));
    real.questions.push(...(r.questions || []));
  }
}
const evenings = [...EVENINGS, ...real.evenings];
const byId = new Map(evenings.map((e) => [e.id, e]));

// ── the fixed sentences the app says today ───────────────────────────────────
function wrapDay(f) {
  return {
    weekday: f.weekday,
    tomorrow: f.tomorrow_word || 'tomorrow',
    late: f.part === 'late',
    early: f.part === 'early',
  };
}
function fixedLine(moment, f) {
  const d = wrapDay(f);
  const name = null;
  if (moment === 'open') {
    const out = [openerLine(d, name, f.part !== 'early')];
    if (f.recap?.missed?.length) out.push(missedLine(f.recap.missed.map((m) => m.title)));
    out.push(f.cards > 0 ? offerLine(f.cards, d) : clearLine(f.recap?.planned ?? null, d));
    return out.join(' ');
  }
  if (moment === 'journal_ask') return partWords(d.early).journalAsk;
  if (moment === 'journal_reply') return WRAP_COPY.journalSaved;
  if (moment === 'close') return closeLine(d, f.next?.meetings?.length || 0, f.next?.lined || []);
  return '';
}

// ── the rules every line keeps ───────────────────────────────────────────────
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
const DASH = /\s[-–—]\s|[–—]/;
const NIGHT = /\b(tonight|night|sleep|bed)\b/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function checks(moment, f, out, expect = {}) {
  const c = [];
  const add = (name, ok, detail = '') => c.push({ name, ok: !!ok, detail });
  if (!out) {
    add('An answer', false);
    return c;
  }
  if (moment === 'questions') {
    const ids = out.ask.map((q) => q.id);
    add(`At most ${expect.most ?? 2}`, ids.length <= (expect.most ?? 2), ids.join(', '));
    if (expect.notAsked) add('Nothing settled tonight', !ids.some((id) => expect.notAsked.includes(id)), ids.join(', '));
    for (const q of out.ask) {
      add(`No dashes: ${q.id}`, !DASH.test(q.question), q.question);
      add(`A question: ${q.id}`, /\?$/.test(q.question), q.question);
    }
    return c;
  }
  if (moment === 'journal_reply') {
    add('Knows a journal entry', out.journal === expect.journal, String(out.journal));
    if (!out.journal) return c;
    // the moods it carries: the app's own, two at most, one of those that fit when the entry shows how they feel
    const moods = out.moods || [];
    add('Two moods at most, the app\'s own', moods.length <= 2, moods.join(', '));
    if (expect.moods) add('Moods that fit', moods.length > 0 && moods.every((m) => expect.moods.includes(m)), moods.join(', '));
  }
  const text = out.line ?? out.reply ?? '';
  add('No dashes', !DASH.test(text), text);
  add('No emoji', !EMOJI.test(text), text);
  const cap = { open: 40, journal_ask: 18, journal_reply: 38, close: 42 }[moment] ?? 40;
  add(`Short (${cap} words)`, words(text) <= cap + 3, words(text));
  if (moment === 'journal_ask') add('Asks one question', (text.match(/\?/g) || []).length === 1, text);
  else add('Asks nothing', !/\?/.test(text), text);
  if (f.part === 'early') add('Nothing about tonight', !NIGHT.test(text), text);
  if (f.part === 'late' && moment !== 'journal_reply') add('Names the next day', !/\btomorrow\b/i.test(text), text);
  if (moment === 'close') add('No goodnight', !/good ?night|sleep well/i.test(text), text);
  if (moment === 'journal_reply') add('Says it is saved', /journal|saved/i.test(text), text);
  return c;
}

// ── the jobs ─────────────────────────────────────────────────────────────────
const jobs = [];
for (const e of evenings) {
  if (only && !only.includes(e.id)) continue;
  for (const moment of e.moments || []) jobs.push({ id: `${e.id}:${moment}`, e, moment, f: { ...e.facts, moment } });
}
for (const x of [...ENTRIES, ...real.entries]) {
  if (only && !only.includes(x.id) && !only.includes(x.evening)) continue;
  const e = byId.get(x.evening);
  jobs.push({ id: `${x.id}:journal_reply`, e, moment: 'journal_reply', f: { ...e.facts, moment: 'journal_reply', entry: x.entry, tonight: { ...e.facts.tonight, journal: null } }, expect: x.expect });
}
for (const x of [...QUESTIONS, ...real.questions]) {
  if (only && !only.includes(x.id) && !only.includes(x.evening)) continue;
  const e = byId.get(x.evening);
  jobs.push({ id: `${x.id}:questions`, e, moment: 'questions', f: { ...e.facts, moment: 'questions', questions: x.questions }, expect: x.expect });
}

async function runOne(job) {
  // as the Worker reads the app's request
  const f = factsFrom(job.f);
  const p = wrapPrompt(f, { person: job.e.person, dco: job.e.dco });
  const t0 = Date.now();
  try {
    const res = await helperFetch('wrap_words', {
      messages: [
        { role: 'system', content: p.system },
        { role: 'user', content: p.user },
      ],
      max_tokens: p.json ? 300 : 160,
      temperature: 0.7,
      ...(p.json ? { response_format: { type: 'json_object' } } : {}),
    });
    const ms = Date.now() - t0;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const out = res.ok ? readWrapWords(job.moment, text, f) : null;
    const usage = data.usage || {};
    return { ms, out, raw: text, usage, checks: checks(job.moment, job.f, out, job.expect) };
  } catch (err) {
    return { ms: Date.now() - t0, out: null, error: String(err?.message || err), checks: [{ name: 'An answer', ok: false }] };
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

const runs = jobs.flatMap((j) => Array.from({ length: repeat }, () => j));
console.log(`Running ${runs.length} calls (${jobs.length} moments × ${repeat}) on ${model}, ${WRAP_WORDS_VERSION}…`);
const results = await pool(runs, 4, async (job) => ({ job, r: await runOne(job) }));

let pass = 0;
const times = [];
for (const job of jobs) {
  console.log(`\n${job.id}  (${job.e.kind})`);
  if (job.moment !== 'questions') console.log(`  now:    ${fixedLine(job.moment, job.f)}`);
  if (job.f.entry) console.log(`  entry:  ${job.f.entry}`);
  for (const { r } of results.filter((x) => x.job === job)) {
    times.push(r.ms);
    const fails = r.checks.filter((c) => !c.ok);
    if (!fails.length) pass += 1;
    const said = !r.out
      ? `(nothing${r.error ? `: ${r.error}` : ''})`
      : job.moment === 'questions'
        ? JSON.stringify(r.out.ask)
        : job.moment === 'journal_reply' && !r.out.journal
          ? '(not a journal entry: goes to Gremly)'
          : `${r.out.line ?? r.out.reply}${job.moment === 'journal_reply' ? `  {moods: ${(r.out.moods || []).join(', ') || 'none'}}` : ''}`;
    console.log(`  ${fails.length ? 'FAIL' : 'ok  '}   ${said}  [${r.ms}ms]${fails.length ? `  ✗ ${fails.map((f) => f.name).join('; ')}` : ''}`);
  }
}
times.sort((a, b) => a - b);
console.log(`\n${pass} of ${runs.length} pass every rule · ${times[Math.floor(times.length / 2)]}ms typical · ${times.at(-1)}ms slowest`);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(
  join(HERE, 'out', `wrap-${stamp}.json`),
  JSON.stringify({ version: WRAP_WORDS_VERSION, model, results: results.map(({ job, r }) => ({ id: job.id, moment: job.moment, ...r })) }, null, 2),
);
