/**
 * The writer test for Gremly's wrap up words: the same evenings written by
 * each candidate writer, through the path that ships (wrap/words.js through
 * helperFetch, job wrap_words), each evening's moments in order as the app
 * asks for them, then judged blind by two judges from other model families.
 *
 *   scripts/wrap-replay/writers.sh --write luna [--repeat 2] [--only id,id] [--merge]
 *   scripts/wrap-replay/writers.sh --judge sol|pro [--writers luna,luna-low,flash]
 *   scripts/wrap-replay/writers.sh --report
 *
 * Writing and judging are separate runs, each saved under out/ (gitignored),
 * so each fits in one go. Made up evenings come from scenarios.mjs; real ones
 * from fixtures/*.json (never committed). Keys from the environment:
 * OPENAI_API_KEY, GEMINI_TEST_API_KEY.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENINGS } from './scenarios.mjs';
import { checks } from './checks.mjs';
import { configureModels } from '../../workers/cortex/models.js';
import { helperFetch } from '../../workers/cortex/helperClient.js';
import {
  factsFrom,
  wrapPrompt,
  readWrapWords,
  wrapWordsBody,
  WRAP_WORDS_VERSION,
} from '../../workers/cortex/wrap/words.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

// price per 1M tokens: in, out (workers/shared/aiUsage.js)
const WRITERS = {
  luna: { model: 'gpt-6-luna', price: [0.1, 0.5], label: 'Luna, least thinking (today)' },
  'luna-low': { model: 'gpt-6-luna', effort: 'low', price: [0.1, 0.5], label: 'Luna, low thinking' },
  flash: { model: 'gemini-3.8-flash', price: [0.75, 3.75], label: 'Gemini 3.8 Flash' },
};

// ── the evenings, every moment the app would ask for, in order ──────────────
const real = [];
const FIX = join(HERE, 'fixtures');
if (existsSync(FIX)) {
  for (const f of readdirSync(FIX).filter((x) => x.endsWith('.json'))) {
    real.push(...(JSON.parse(readFileSync(join(FIX, f), 'utf8')).evenings || []));
  }
}
const only = flag('--only')?.split(',') || null;
const evenings = [...EVENINGS, ...real].filter((e) => !only || only.includes(e.id));

// in the order the wrap up comes to them
function momentsOf(e) {
  const f = e.facts;
  const t = f.tonight || {};
  const out = ['open'];
  if (f.cards > 0 && t.path === 'cards') out.push('sorted');
  if ((t.logged || []).length || (t.held || []).length || (t.not_held || []).length) out.push('habits');
  out.push('journal_ask', 'close', 'night');
  return out;
}

// what has happened in the wrap up by each moment, as the app would send it
function tonightAt(moment, t = {}) {
  const cards = { decisions: t.decisions, path: t.path, fed_by_cards: t.fed_by_cards };
  const habits = { logged: t.logged, held: t.held, not_held: t.not_held, streak: t.streak };
  if (moment === 'open') return {};
  if (moment === 'sorted') return cards;
  if (moment === 'habits' || moment === 'journal_ask') return { ...cards, ...habits };
  return t;
}

async function writeEvening(e, w) {
  const said = [];
  const lines = [];
  for (const moment of momentsOf(e)) {
    const f = factsFrom({
      ...e.facts,
      moment,
      tonight: tonightAt(moment, e.facts.tonight),
      ...(said.length ? { said: [...said] } : {}),
    });
    const p = wrapPrompt(f, { person: e.person, dco: e.dco, life: e.life || null });
    const t0 = Date.now();
    let out = null;
    let usage = {};
    try {
      const res = await helperFetch('wrap_words', wrapWordsBody(p, { effort: w.effort ?? null }));
      const data = await res.json();
      usage = data.usage || {};
      out = res.ok ? readWrapWords(moment, data.choices?.[0]?.message?.content || '', f) : null;
    } catch {
      out = null;
    }
    const ms = Date.now() - t0;
    const line = out?.line || '';
    if (line) said.push(line);
    const fails = checks(moment, { ...e.facts, moment }, out, e.expect?.[moment])
      .filter((c) => !c.ok)
      .map((c) => c.name);
    const cost = ((usage.prompt_tokens || 0) * w.price[0] + (usage.completion_tokens || 0) * w.price[1]) / 1e6;
    lines.push({ moment, line, ms, fails, cost });
  }
  return lines;
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

// ── write ───────────────────────────────────────────────────────────────────
async function write(key) {
  const w = WRITERS[key];
  if (!w) throw new Error(`no writer ${key}`);
  configureModels({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
    HELPER_MODEL: w.model,
    // no other model steps in, so what is judged is this writer's
    HELPER_FALLBACK_MODEL: w.model,
  });
  const repeat = Math.max(1, Number(flag('--repeat') || 2));
  const runs = evenings.flatMap((e) => Array.from({ length: repeat }, (_, k) => ({ e, k })));
  console.log(`${w.label}: ${runs.length} evenings, ${WRAP_WORDS_VERSION}…`);
  const done = await pool(runs, 4, async ({ e, k }) => ({ id: e.id, k, lines: await writeEvening(e, w) }));
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `writer-${key}.json`);
  // --merge adds these evenings to an earlier run's, for a writer too slow to write them all in one go
  const kept =
    args.includes('--merge') && existsSync(file)
      ? JSON.parse(readFileSync(file, 'utf8')).runs.filter((r) => !done.some((d) => d.id === r.id && d.k === r.k))
      : [];
  writeFileSync(file, JSON.stringify({ key, version: WRAP_WORDS_VERSION, runs: [...kept, ...done] }, null, 2));
  const all = done.flatMap((r) => r.lines);
  const pass = all.filter((l) => !l.fails.length).length;
  const ms = all.map((l) => l.ms).sort((a, b) => a - b);
  console.log(`${pass} of ${all.length} lines keep every rule · ${ms[Math.floor(ms.length / 2)]}ms typical · ${ms.at(-1)}ms slowest`);
  for (const r of done.filter((x) => x.k === 0)) {
    console.log(`\n${r.id}`);
    for (const l of r.lines) console.log(`  ${l.moment.padEnd(12)} ${l.fails.length ? `✗ ${l.fails.join('; ')} ` : ''}${l.line}`);
  }
}

// ── judge ───────────────────────────────────────────────────────────────────
const JUDGES = {
  sol: { provider: 'openai', model: 'gpt-6-sol', effort: 'low' },
  pro: { provider: 'gemini', model: 'gemini-pro-latest' },
};

const JUDGE_SYSTEM = `You judge what Gremly says to a person in a companion app as they wrap up their day. Gremly is meant to sound like a warm friend who knows their day and is glad to be there, with a playful spark, never a report or a template. He must never invent anything or get a fact wrong, must do what each moment is for, and must never make the person feel behind.

You are given the facts of the person's day as the app holds them, and several versions of everything Gremly said that evening, in order, each under a letter. Each version comes from a different writer, in a random order. Judge each version as a whole, then compare them.

What each moment is for:
open: his first words, looking back on the day; it leaves out everything waiting in the cards, since the cards bring those up next.
journal_ask: one open question for their journal about the day as a whole or how they are now, never built on one event, item, place or person.
sorted: his reaction once every card has a place, naming no item and no count.
habits: his reaction to the habits they just checked in on, and to nothing else.
close: their day is wrapped up and what their next day holds, calendar and todos together; it says how many todos when there are more than a few, and says plainly and kindly when it is more than one day can hold.
night: his goodnight, or goodbye for now before the evening, without going over the day again.

Score each version from 1 to 10 on each of these:
warmth: a friend who knows them is talking, with feeling and some personality.
accuracy: every fact matches the facts given. An invented or wrong fact (an item, a person, a time, a count, a habit said to hold when it did not) costs heavily.
jobs: each moment does what it is for, and no line goes back over another.
natural: it reads like one person talking across the evening, varied, with no stock phrase or opening repeated from line to line.
overall: how good this evening's words are for the person, all of that weighed together.
Return only JSON: {"versions": {"<letter>": {"warmth": n, "accuracy": n, "jobs": n, "natural": n, "overall": n, "note": "one short sentence on what most decided its score"}}, "best": "<letter>"}`;

function factsForJudge(e) {
  const f = factsFrom({ ...e.facts, moment: 'close' });
  const p = wrapPrompt(f, { person: e.person, dco: e.dco, life: e.life || null });
  const cards = (e.facts.card_titles || []).length
    ? `\n\nWAITING IN THE CARDS WHEN IT OPENED\n${e.facts.card_titles.join('; ')}`
    : '';
  const who = e.person?.first_name ? `Their first name is ${e.person.first_name}.\n\n` : '';
  return `${who}${p.user}${cards}`;
}

// a fixed shuffle per evening and judge, so a rerun judges the same order
function shuffled(items, seed) {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) >>> 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function callJudge(j, system, user) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let text = '';
    let status = 0;
    if (j.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: j.model,
          reasoning_effort: j.effort,
          max_completion_tokens: 6000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      status = res.status;
      const data = await res.json().catch(() => ({}));
      text = data.choices?.[0]?.message?.content || '';
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${j.model}:generateContent?key=${process.env.GEMINI_TEST_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000 },
          }),
        },
      );
      status = res.status;
      const data = await res.json().catch(() => ({}));
      text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    }
    try {
      return JSON.parse(text);
    } catch {
      if (status === 429 || status >= 500 || !text) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      return null;
    }
  }
  return null;
}

async function judge(key) {
  const j = JUDGES[key];
  if (!j) throw new Error(`no judge ${key}`);
  const keys = (flag('--writers') || Object.keys(WRITERS).join(',')).split(',');
  const written = Object.fromEntries(
    keys.map((k) => [k, JSON.parse(readFileSync(join(OUT, `writer-${k}.json`), 'utf8')).runs]),
  );
  const byId = new Map(evenings.map((e) => [e.id, e]));
  const tasks = [];
  for (const r of written[keys[0]]) {
    const e = byId.get(r.id);
    if (!e) continue;
    const versions = keys.map((k) => ({ k, run: written[k].find((x) => x.id === r.id && x.k === r.k) }));
    if (versions.some((v) => !v.run)) continue;
    tasks.push({ e, k: r.k, versions });
  }
  console.log(`Judge ${j.model}: ${tasks.length} evenings × ${keys.length} writers…`);
  const out = await pool(tasks, 4, async ({ e, k, versions }) => {
    const order = shuffled(versions, `${e.id}:${k}:${key}`);
    const letters = order.map((_, i) => String.fromCharCode(65 + i));
    const text = order
      .map(
        (v, i) =>
          `VERSION ${letters[i]}\n${v.run.lines.map((l) => `${l.moment}: ${l.line || '(nothing came, the app says its fixed line)'}`).join('\n')}`,
      )
      .join('\n\n');
    const user = `THE FACTS OF THEIR DAY\n${factsForJudge(e)}\n\n${text}`;
    const verdict = await callJudge(j, JUDGE_SYSTEM, user);
    const scores = {};
    for (let i = 0; i < order.length; i++) scores[order[i].k] = verdict?.versions?.[letters[i]] || null;
    const best = verdict?.best ? order[letters.indexOf(verdict.best)]?.k || null : null;
    return { id: e.id, k, scores, best };
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `judge-${key}.json`), JSON.stringify({ judge: j.model, writers: keys, out }, null, 2));
  report();
}

// ── report ──────────────────────────────────────────────────────────────────
function report() {
  const keys = Object.keys(WRITERS).filter((k) => existsSync(join(OUT, `writer-${k}.json`)));
  const rows = [];
  for (const k of keys) {
    const runs = JSON.parse(readFileSync(join(OUT, `writer-${k}.json`), 'utf8')).runs;
    const lines = runs.flatMap((r) => r.lines);
    const ms = lines.map((l) => l.ms).sort((a, b) => a - b);
    const perEvening = runs.map((r) => r.lines.reduce((s, l) => s + l.cost, 0));
    rows.push({
      k,
      rules: `${lines.filter((l) => !l.fails.length).length}/${lines.length}`,
      typical: ms[Math.floor(ms.length / 2)],
      slow: ms[Math.floor(ms.length * 0.9)],
      cents: (perEvening.reduce((a, b) => a + b, 0) / perEvening.length) * 100,
    });
  }
  const judges = Object.keys(JUDGES).filter((j) => existsSync(join(OUT, `judge-${j}.json`)));
  for (const jk of judges) {
    const { out } = JSON.parse(readFileSync(join(OUT, `judge-${jk}.json`), 'utf8'));
    for (const row of rows) {
      const s = out.map((o) => o.scores[row.k]).filter(Boolean);
      const mean = (f) => (s.length ? (s.reduce((a, x) => a + (Number(x[f]) || 0), 0) / s.length).toFixed(1) : '-');
      row[jk] = {
        overall: mean('overall'),
        warmth: mean('warmth'),
        accuracy: mean('accuracy'),
        jobs: mean('jobs'),
        natural: mean('natural'),
        wins: out.filter((o) => o.best === row.k).length,
        of: out.length,
      };
    }
  }
  console.log('\nwriter       rules    typical  90th    cents/evening  ' + judges.map((j) => `${j}: overall warmth accuracy jobs natural wins`).join('   '));
  for (const r of rows) {
    console.log(
      `${r.k.padEnd(12)} ${r.rules.padEnd(8)} ${String(r.typical).padEnd(8)} ${String(r.slow).padEnd(7)} ${r.cents.toFixed(3).padEnd(14)} ` +
        judges
          .map((j) => (r[j] ? `${r[j].overall} ${r[j].warmth} ${r[j].accuracy} ${r[j].jobs} ${r[j].natural} ${r[j].wins}/${r[j].of}` : ''))
          .join('   '),
    );
  }
}

if (flag('--write')) await write(flag('--write'));
else if (flag('--judge')) await judge(flag('--judge'));
else report();
