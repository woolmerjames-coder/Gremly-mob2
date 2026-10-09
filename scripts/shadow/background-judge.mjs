/**
 * Side by side on real weeks, read blind (James, 18 Oct): the narrower
 * writers run in the shadow under several settings (the Life Map as
 * background off and on, thinking harder, another model), then every item one
 * setting wrote is put beside the same item from the base setting, in an order
 * no judge can read, and two judges from different model families say which
 * shows more understanding of the person's life and what each says that its
 * records do not hold. The records each judge is given are those the writer
 * was given in the base setting, so the background is never evidence.
 *
 *   scripts/shadow/background-compare.sh   runs the settings and then this
 *   node <bundle> --root <dir> --conds off,on,... --users <ids> --jobs words,...
 *        [--base off] [--judges anthropic:claude-sonnet-5-5,openai:gpt-6-sol]
 *
 * <root>/<cond>/ holds each setting's shadow runs (SHADOW_OUT), made with
 * SHADOW_KEEP_PROMPTS=1. The report is written to <root>/report.md and
 * <root>/report.json: it holds real words, so <root> lives outside the repo.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const ROOT = flag('--root');
const CONDS = String(flag('--conds', '')).split(',').filter(Boolean);
const BASE = flag('--base', CONDS[0]);
const USERS = String(flag('--users', '')).split(',').filter(Boolean);
const JOBS = String(flag('--jobs', '')).split(',').filter(Boolean);
const JUDGES = String(flag('--judges', 'anthropic:claude-sonnet-5-5,openai:gpt-6-sol')).split(',').filter(Boolean);
if (!ROOT || CONDS.length < 2 || !USERS.length || !JOBS.length) {
  console.error('needs --root, --conds (two or more), --users and --jobs');
  process.exit(1);
}

const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY || process.env.GEMINI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

// ── reading a setting's run ──────────────────────────────────────────────

/** The writer's own calls, told apart by how its instructions begin. */
const WRITER = {
  words: 'You write the words under a World or a Chapter',
  'person-words': "You write the line Gremly keeps about someone",
  memories: 'You write the memory of a Chapter',
  review: 'You look over the ledger of facts',
  'person-question': "You choose and write Gremly's questions about the people",
  'chapter-questions': "You write Gremly's questions about Chapters",
};
const BACKGROUND = "GREMLY'S READ OF THEIR LIFE, NEVER A RECORD";

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => p?.text || '').join('');
  return '';
}

/** What a model call was told, whichever provider it went to. */
function promptOf(req) {
  if (!req || typeof req !== 'object') return { system: '', user: '' };
  if (Array.isArray(req.messages) && req.messages.some((m) => m.role === 'system'))
    return {
      system: req.messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n'),
      user: req.messages.filter((m) => m.role === 'user').map((m) => textOf(m.content)).join('\n'),
    };
  if (req.messages)
    return { system: textOf(req.system), user: req.messages.filter((m) => m.role === 'user').map((m) => textOf(m.content)).join('\n') };
  if (req.contents)
    return {
      system: textOf(req.systemInstruction?.parts),
      user: (req.contents || []).map((c) => textOf(c.parts)).join('\n'),
    };
  return { system: '', user: '' };
}

function runDir(cond, job, user) {
  const dir = join(ROOT, cond);
  if (!existsSync(dir)) return null;
  const hits = readdirSync(dir)
    // the stamp ends in Z, so one job's name inside another's never matches
    .filter((n) => n.endsWith(`Z-${job}-${user.slice(0, 8)}`))
    .sort();
  return hits.length ? join(dir, hits[hits.length - 1]) : null;
}

function readRun(cond, job, user) {
  const dir = runDir(cond, job, user);
  if (!dir || !existsSync(join(dir, 'record.json'))) return null;
  const record = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8'));
  const summary = existsSync(join(dir, 'summary.json')) ? JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) : {};
  const writerCalls = (record.calls || [])
    .filter((c) => c.status === 200 && c.request)
    .map((c) => promptOf(c.request))
    .filter((p) => p.system.includes(WRITER[job]) && !p.system.includes('\nONCE AGAIN\n'));
  const cost = (record.usage || []).reduce((s, u) => s + (Number(u.cost_usd) || 0), 0);
  return { dir, record, summary: summary.summary || summary, writerCalls, cost };
}

/** The records a writer was given, without the background. */
const recordsOf = (user) => String(user || '').split(`\n\n${BACKGROUND}`)[0];

/**
 * Each setting's items, keyed so the same item lines up across settings: a
 * line per World, Chapter or person, or the whole set of questions. Items that
 * made a call take the writer calls in turn.
 */
function itemsOf(job, run) {
  if (!run) return [];
  const s = run.summary || {};
  const out = [];
  const takeCalls = (list, keyOf, textOfItem, made) => {
    let i = 0;
    for (const x of list) {
      const call = made(x) ? run.writerCalls[i++] : null;
      out.push({ key: keyOf(x), text: textOfItem(x) || null, outcome: x.outcome || (x.error ? 'error' : null), records: call ? recordsOf(call.user) : null });
    }
  };
  if (job === 'words')
    takeCalls(s.lines || [], (l) => `${l.table}:${l.id}`, (l) => l.words, (l) => l.outcome && l.outcome !== 'empty' && !l.error);
  else if (job === 'person-words')
    takeCalls(s.lines || [], (l) => `person:${l.id}`, (l) => l.text, (l) => l.outcome && l.outcome !== 'empty' && !l.error);
  else if (job === 'memories')
    takeCalls(s.memories || [], (m) => `chapter:${m.id}`, (m) => m.memory, (m) => m.outcome && m.outcome !== 'empty' && !m.error);
  else {
    const rows =
      job === 'review'
        ? run.record.output?.rows || []
        : job === 'person-question'
          ? s.questions || []
          : [...(s.welcome?.rows || []), ...(s.close?.rows || [])];
    const text = rows.length
      ? rows
          .map((r, i) => `${i + 1}. ${r.question}${Array.isArray(r.choices) && r.choices.length ? ` (answers: ${r.choices.join(' / ')})` : ''}`)
          .join('\n')
      : null;
    out.push({ key: 'the set', text, outcome: rows.length ? 'asked' : typeof s.skipped === 'string' ? s.skipped : 'none asked', records: run.writerCalls[0] ? recordsOf(run.writerCalls[0].user) : null });
  }
  return out;
}

// ── the judges ───────────────────────────────────────────────────────────

const JUDGE_RULES = `You compare two pieces of writing that Gremly, a warm companion app, made for one person from the same records. You are given the records, then the two pieces as first and second. Neither is known to be better, and the order says nothing.

Judge two things.
- Understanding: which shows the truer and deeper understanding of this person's life as the records show it: what this part of their life is, why it matters to them, and how it connects to the rest of their life and the people in it. Writing that is general, or that could be said of almost anyone, shows less. Anything a piece says that the records do not hold counts against it. A blank piece shows none, and is better than one that says what is not so. When they are questions, judge the set: whether each is worth this person's time, whether it asks what the records already answer, and whether it takes as given anything the records do not hold. Say first, second or same.
- Untrue: for each piece, every statement it makes, or a question takes as given, that the records do not hold or that they contradict, each as the words it uses and what the records hold instead. Leave the list empty when there is none.

Answer in JSON only.`;

const VERDICT = {
  type: 'object',
  properties: {
    understanding: { type: 'string', enum: ['first', 'second', 'same'] },
    why: { type: 'string' },
    first_untrue: { type: 'array', items: { type: 'object', properties: { words: { type: 'string' }, records_hold: { type: 'string' } }, required: ['words', 'records_hold'] } },
    second_untrue: { type: 'array', items: { type: 'object', properties: { words: { type: 'string' }, records_hold: { type: 'string' } }, required: ['words', 'records_hold'] } },
  },
  required: ['understanding', 'why', 'first_untrue', 'second_untrue'],
};

const spec = (s) => {
  const [provider, ...rest] = s.split(':');
  return { provider, model: rest.join(':') };
};

/** One pair, read blind: the order comes from the item and the pair, never the setting's name. */
async function judgePair({ records, base, other, key, judge }) {
  const swap = createHash('sha256').update(`${key}|${judge}`).digest()[0] % 2 === 1;
  const [first, second] = swap ? [other, base] : [base, other];
  const user = `RECORDS:\n${records}\n\nFIRST:\n${first || '(left blank)'}\n\nSECOND:\n${second || '(left blank)'}`;
  const { output } = await jsonCall(env, {
    primary: spec(judge),
    fallback: null,
    system: JUDGE_RULES,
    user,
    schema: VERDICT,
    maxTokens: 16000,
    effort: 'medium',
    thinking: 'medium',
  });
  const pick = output?.understanding;
  const better = pick === 'same' || !pick ? 'same' : (pick === 'first') !== swap ? 'base' : 'other';
  return {
    judge,
    better,
    why: String(output?.why || '').slice(0, 600),
    base_untrue: (swap ? output?.second_untrue : output?.first_untrue) || [],
    other_untrue: (swap ? output?.first_untrue : output?.second_untrue) || [],
  };
}

async function pool(tasks, n = 6) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        try {
          out[i] = await tasks[i]();
        } catch (err) {
          out[i] = { error: String(err?.message || err).slice(0, 300) };
        }
      }
    }),
  );
  return out;
}

// ── the run ──────────────────────────────────────────────────────────────

const pairs = [];
const costs = {};
const outcomes = {};
for (const job of JOBS)
  for (const user of USERS) {
    const runs = Object.fromEntries(CONDS.map((c) => [c, readRun(c, job, user)]));
    for (const c of CONDS) {
      costs[job] ||= {};
      costs[job][c] ||= { runs: 0, usd: 0 };
      if (runs[c]) {
        costs[job][c].runs += 1;
        costs[job][c].usd += runs[c].cost;
      }
    }
    const items = Object.fromEntries(CONDS.map((c) => [c, new Map(itemsOf(job, runs[c]).map((x) => [x.key, x]))]));
    for (const c of CONDS) {
      outcomes[job] ||= {};
      outcomes[job][c] ||= {};
      for (const x of items[c].values()) outcomes[job][c][x.outcome || 'none'] = (outcomes[job][c][x.outcome || 'none'] || 0) + 1;
    }
    for (const [key, b] of items[BASE]) {
      for (const c of CONDS.filter((x) => x !== BASE)) {
        const o = items[c].get(key);
        if (!o) continue;
        const records = b.records || o.records;
        if (!records) continue;
        if (!b.text && !o.text) {
          pairs.push({ job, user: user.slice(0, 8), key, cond: c, both_blank: true });
          continue;
        }
        pairs.push({ job, user: user.slice(0, 8), key, cond: c, records, base: b.text, other: o.text });
      }
    }
  }

const toJudge = pairs.filter((p) => !p.both_blank);
console.log(`${toJudge.length} pairs to judge, ${pairs.length - toJudge.length} blank on both sides, by ${JUDGES.length} judges`);
const verdicts = await pool(
  toJudge.flatMap((p) => JUDGES.map((judge) => () => judgePair({ records: p.records, base: p.base, other: p.other, key: `${p.job}|${p.user}|${p.key}|${p.cond}`, judge }).then((v) => ({ ...v, pair: p })))),
  8,
);

// ── the report ───────────────────────────────────────────────────────────

const tally = {};
for (const v of verdicts) {
  if (!v || v.error) continue;
  const p = v.pair;
  const t = ((tally[p.job] ||= {})[p.cond] ||= { other: 0, base: 0, same: 0, base_untrue: 0, other_untrue: 0, verdicts: 0, items: new Set() });
  t[v.better] += 1;
  t.base_untrue += v.base_untrue.length;
  t.other_untrue += v.other_untrue.length;
  t.verdicts += 1;
  t.items.add(`${p.user}|${p.key}`);
}
const failed = verdicts.filter((v) => !v || v.error);

const L = [`# Side by side, read blind`, '', `Base setting: ${BASE}. Judges: ${JUDGES.join(', ')}. Each item from each setting is put beside the same item from ${BASE}; the judges are given the records the writer was given in ${BASE}, never the background.`, ''];
for (const job of JOBS) {
  L.push(`## ${job}`, '', `| Setting | Items judged | Judged better than ${BASE} | Worse | Same | Untrue statements, setting / ${BASE} | Outcomes | Cost a run |`, '| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const c of CONDS) {
    const t = tally[job]?.[c];
    const cost = costs[job]?.[c];
    const usd = cost?.runs ? `$${(cost.usd / cost.runs).toFixed(4)}` : 'n/a';
    const oc = Object.entries(outcomes[job]?.[c] || {})
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    if (c === BASE) L.push(`| ${c} (base) | | | | | | ${oc} | ${usd} |`);
    else if (!t) L.push(`| ${c} | 0 | | | | | ${oc} | ${usd} |`);
    else L.push(`| ${c} | ${t.items.size} | ${t.other} | ${t.base} | ${t.same} | ${t.other_untrue} / ${t.base_untrue} | ${oc} | ${usd} |`);
  }
  L.push('');
}
if (failed.length) L.push(`${failed.length} verdicts could not be had: ${[...new Set(failed.map((f) => f?.error))].slice(0, 3).join('; ')}`, '');
L.push('## Every pair', '');
for (const v of verdicts) {
  if (!v || v.error) continue;
  const p = v.pair;
  L.push(
    `- ${p.job} ${p.user} ${p.key}, ${p.cond} beside ${BASE}, ${v.judge}: ${v.better === 'other' ? p.cond : v.better === 'base' ? BASE : 'same'}`,
    `  - ${BASE}: ${p.base || '(left blank)'}`,
    `  - ${p.cond}: ${p.other || '(left blank)'}`,
    `  - why: ${v.why}`,
    ...v.base_untrue.map((u) => `  - untrue in ${BASE}: ${u.words} (records: ${u.records_hold})`),
    ...v.other_untrue.map((u) => `  - untrue in ${p.cond}: ${u.words} (records: ${u.records_hold})`),
  );
}
writeFileSync(join(ROOT, 'report.md'), L.join('\n'));
writeFileSync(
  join(ROOT, 'report.json'),
  JSON.stringify({ base: BASE, conds: CONDS, judges: JUDGES, costs, outcomes, tally: JSON.parse(JSON.stringify(tally, (k, v) => (v instanceof Set ? v.size : v))), verdicts: verdicts.map((v) => (v?.pair ? { ...v, pair: { ...v.pair, records: undefined } } : v)) }, null, 2),
);
console.log(L.slice(0, L.indexOf('## Every pair')).join('\n'));
console.log(`report: ${join(ROOT, 'report.md')}`);
