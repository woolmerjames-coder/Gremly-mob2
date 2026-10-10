/**
 * Relate replay: the "already have it?" check on real past drops, one model
 * variant per run. Same prompt, same input, same checks as the Worker
 * (MINDDROP_RELATE_PROMPT, buildRelateInput, decideRelation); only the model
 * changes. Input: real/drops.jsonl and real/items.jsonl (gitignored, real data).
 * Output: results/<variant>-<run>.jsonl, one line per drop.
 *
 * --deadlines: the request a build that understands deadlines sends
 * (deadlines: true, final check item 6): the deadline prompt, each todo with
 * its planned day and its deadline, and a deadline change allowed. Reads
 * real/items-deadlines.jsonl, the same rows with target_date and
 * scheduled_date added for todos.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  relatePromptFor,
  RELATE_ITEMS_MAX,
  RELATE_LOG_WINDOW_DAYS,
  addDays,
  shapeItems,
  withKeys,
  buildRelateInput,
  parseJson,
  decideRelation,
} from '../../workers/cortex/minddropRelate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const VARIANT = arg('variant', 'gemini');
const RUN = arg('run', '1');
const LIMIT = Number(arg('limit', '0')) || Infinity;
const CONC = Number(arg('conc', '6'));
const DEADLINES = args.includes('--deadlines');

const keys = {};
const kf = join(ROOT, '.audit-keys.local');
if (existsSync(kf))
  for (const line of readFileSync(kf, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) keys[m[1]] = m[2];
  }
const OPENAI = process.env.OPENAI_API_KEY || keys.OPENAI_API_KEY;
const GEMINI = process.env.GEMINI_TEST_API_KEY || keys.GEMINI_TEST_API_KEY;

// Prices per 1M tokens, Standard tier, October 2026 (Google and OpenAI pricing pages).
const PRICE = {
  gemini: { in: 0.75, out: 3.75, jan_in: 1.5, jan_out: 7.5 },
  luna: { in: 0.1, cached: 0.01, out: 0.5 },
};

const VARIANTS = {
  gemini: { provider: 'gemini', model: 'gemini-3.8-flash', thinking: 'low' },
  'luna-none': { provider: 'openai', model: 'gpt-6-luna', effort: 'none' },
  'luna-low': { provider: 'openai', model: 'gpt-6-luna', effort: 'low' },
};
const V = VARIANTS[VARIANT];
if (!V) throw new Error(`unknown variant ${VARIANT}`);

const drops = readFileSync(join(HERE, 'real/drops.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const ITEMS_FILE = DEADLINES ? 'real/items-deadlines.jsonl' : 'real/items.jsonl';
const rawItems = readFileSync(join(HERE, ITEMS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
// item row: [owner, key8, type, title, due, time, habitKind, frequency, logs, created, gone, updated]
// items-deadlines.jsonl adds [..., target_date, scheduled_date] for todos
const items = rawItems.map((r) => ({
  o: r[0], id: r[1], type: r[2], title: r[3], due: r[4], time: r[5], kind: r[6], freq: r[7], logs: r[8] || [],
  c: r[9], g: r[10], u: r[11], target: r[12] ?? null, scheduled: r[13] ?? null,
}));
const PROMPT = relatePromptFor(DEADLINES);

/** What the Worker would have read for this person at the moment of the drop. */
function itemsAt(owner, at, day) {
  const live = items.filter((i) => i.o === owner && i.c < at && (i.g == null || i.g > at));
  const byNew = (a, b) => b.c - a.c;
  const todos = live.filter((i) => i.type === 'todo').sort(byNew).slice(0, 300)
    .map((i) => ({
      id: i.id, name: i.title, due_day: i.due, due_time: i.time,
      ...(DEADLINES ? { target_date: i.target, scheduled_date: i.scheduled } : {}),
    }));
  const since = addDays(day, -RELATE_LOG_WINDOW_DAYS);
  const logged = new Map();
  const habits = live.filter((i) => i.type === 'habit').sort(byNew).slice(0, 100).map((i) => {
    logged.set(i.id, new Set(i.logs.filter((d) => d >= since && d <= day)));
    return { id: i.id, name: i.title, subtype: i.kind === 'break' ? 'break_habit' : 'start_habit', frequency: i.freq };
  });
  const notes = live.filter((i) => i.type === 'note').sort(byNew).slice(0, 300)
    .map((i) => ({ id: i.id, title: i.title, target_date: i.due, event_time: i.time, subtype: 'note', views: {} }));
  return shapeItems({ todos, habits, notes, logged });
}

async function callGemini(system, user) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 1200, thinkingConfig: { thinkingLevel: V.thinking }, responseMimeType: 'application/json' },
    systemInstruction: { parts: [{ text: system }] },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${V.model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  const j = await res.json();
  const parts = j.candidates?.[0]?.content?.parts || [];
  const content = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
  const u = j.usageMetadata || {};
  const inTok = u.promptTokenCount || 0, outTok = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  return {
    ok: true, content, usage: { in: inTok, cached: u.cachedContentTokenCount || 0, out: outTok },
    cost: (inTok * PRICE.gemini.in + outTok * PRICE.gemini.out) / 1e6,
    cost_jan: (inTok * PRICE.gemini.jan_in + outTok * PRICE.gemini.jan_out) / 1e6,
  };
}

async function callOpenAI(system, user) {
  const body = {
    model: V.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_completion_tokens: 1200,
    reasoning_effort: V.effort,
    response_format: { type: 'json_object' },
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  const j = await res.json();
  const u = j.usage || {};
  const cached = u.prompt_tokens_details?.cached_tokens || 0;
  const inTok = u.prompt_tokens || 0, outTok = u.completion_tokens || 0;
  const cost = ((inTok - cached) * PRICE.luna.in + cached * PRICE.luna.cached + outTok * PRICE.luna.out) / 1e6;
  return { ok: true, content: j.choices?.[0]?.message?.content || '', usage: { in: inTok, cached, out: outTok }, cost, cost_jan: cost };
}

const call = V.provider === 'gemini' ? callGemini : callOpenAI;

async function one(idx) {
  const [owner, at, day, pieces, text] = drops[idx];
  const candidates = withKeys(itemsAt(owner, at, day), RELATE_ITEMS_MAX);
  // the Worker asks nothing when there is nothing to compare against
  if (!candidates.length || !String(text || '').trim())
    return { i: idx, owner, items: 0, ok: true, skipped: true, error: null, ms: 0, usage: null, cost: 0, cost_jan: 0, answer: null, asks: false, kind: null, intent: null, entity: null, candidates: null, change: null };
  const user = buildRelateInput({ todayIso: day, text, candidates, deadlines: DEADLINES });
  let r, ms;
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    try {
      r = await call(PROMPT, user);
    } catch (e) {
      r = { ok: false, error: String(e).slice(0, 200) };
    }
    ms = Date.now() - t0;
    if (r.ok || (r.status && r.status < 429 && r.status !== 408)) break;
    await new Promise((s) => setTimeout(s, 2000 * (attempt + 1)));
  }
  const answer = r.ok ? parseJson(r.content) : null;
  const rel = answer ? decideRelation(answer, candidates, day, { deadlines: DEADLINES }) : null;
  return {
    i: idx, owner, items: candidates.length, deadlines: DEADLINES, ok: !!r.ok, error: r.ok ? null : r.error, ms,
    usage: r.usage || null, cost: r.cost || 0, cost_jan: r.cost_jan || 0,
    answer,
    asks: !!rel,
    kind: rel?.kind || null, intent: rel?.intent || null,
    entity: rel?.entity?.id ? String(rel.entity.id).slice(0, 8) : null,
    candidates: rel?.candidates ? rel.candidates.map((c) => String(c.id).slice(0, 8)) : null,
    change: rel?.change || null,
  };
}

const outDir = join(HERE, 'results');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${VARIANT}-${RUN}.jsonl`);
const done = new Set();
if (existsSync(outFile))
  for (const l of readFileSync(outFile, 'utf8').split('\n').filter(Boolean)) {
    const o = JSON.parse(l);
    if (o.ok) done.add(o.i);
  }
const todo = drops.map((_, i) => i).filter((i) => !done.has(i)).slice(0, LIMIT);
console.log(
  `[relate-replay] ${VARIANT} run ${RUN}${DEADLINES ? ' (deadlines)' : ''}: ${todo.length} drops to run (${done.size} already done)`,
);
let next = 0, finished = 0;
async function worker() {
  while (next < todo.length) {
    const idx = todo[next++];
    const res = await one(idx);
    appendFileSync(outFile, JSON.stringify(res) + '\n');
    if (++finished % 50 === 0) console.log(`[relate-replay] ${finished}/${todo.length}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`[relate-replay] done ${VARIANT} run ${RUN}`);
