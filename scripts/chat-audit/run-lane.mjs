// Replay of triage as the Worker runs it after step 6 of the agent plan: the
// one call, which in Ask Gremly also returns the lane, against today's two
// calls. Prompts and the reading of the answer come from the Worker itself
// (workers/cortex/triage.js), so the replay tests exactly what ships.
//
// Usage:
//   node run-lane.mjs <modelKey> <set> <one-call|two-call> <tag> [concurrency] [from] [to]
//
// Sets: turns_dev, turns_test (the audit's turns, with mode, depth and search
// answers) and lane_dev, lane_test, lane_extra (Ask Gremly and today's thread
// turns from data/lane_turns.json, with lane answers). The lane is asked for
// on Ask Gremly and today's thread turns only, as in the Worker.
// from/to cut the set by position, so a long run can go in parts; the parts
// are joined by tag when scored.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DATA, RESULTS, WORKER, url } from './paths.mjs';
import { MODELS } from './models.mjs';
import { callModel, pool, setBudget, budgetUsed } from './call.mjs';
import { keys } from './keys.mjs';
import { VALID, FALLBACK, SETTINGS, parseJson, classifierInputFor, messageCountFor } from './triage-jobs.mjs';

const triage = await import(url(WORKER + 'triage.js'));
const { MODE_SYSTEM_PROMPT, buildSignalsSystemPrompt, buildOneCallSystemPrompt, readOneCall } = triage;

const [modelKey, set, variant, tag, concArg, fromArg, toArg] = process.argv.slice(2);
const SETS = ['turns_dev', 'turns_test', 'lane_dev', 'lane_test', 'lane_extra'];
if (!MODELS[modelKey] || !SETS.includes(set) || !['one-call', 'two-call'].includes(variant) || !tag) {
  console.error('Usage: node run-lane.mjs <modelKey> <set> <one-call|two-call> <tag> [concurrency] [from] [to]');
  console.error('models:', Object.keys(MODELS).join(', '), '| sets:', SETS.join(', '));
  process.exit(1);
}
if (MODELS[modelKey].provider === 'openai' && !keys.openai) throw new Error('no OPENAI_API_KEY');
if (MODELS[modelKey].provider === 'gemini' && !keys.gemini) throw new Error('no Gemini key');
const concurrency = Number(concArg || 8);
setBudget(5000);

function load(name) {
  if (name.startsWith('turns_')) return JSON.parse(readFileSync(`${DATA}${name}.json`, 'utf8'));
  const which = name.slice('lane_'.length);
  return JSON.parse(readFileSync(`${DATA}lane_turns.json`, 'utf8')).filter((t) => t.set === which);
}
const all = load(set);
const from = Number(fromArg || 0);
const to = Number(toArg || all.length);
const turns = all.slice(from, to);
// Ask Gremly turns are 'general'; today's thread turns that reached chat are 'daily'.
const wantsLane = (t) => t.type === 'general' || t.type === 'daily';

function pick(obj, field) {
  const v = obj && typeof obj[field] === 'string' ? obj[field] : null;
  return VALID[field].includes(v) ? { value: v, fallback: false } : { value: FALLBACK[field], fallback: true };
}
function strip(r) {
  return {
    ok: r.ok,
    status: r.status,
    ms: r.ms,
    attempts: r.attempts,
    usage: r.usage || null,
    cost: r.cost || 0,
    finish: r.finish || null,
    content: (r.content || '').slice(0, 200),
    error: r.error || null,
  };
}

async function runTurn(turn) {
  const input = classifierInputFor(turn);
  const mc = messageCountFor(turn);
  const lane = wantsLane(turn);
  const row = { id: turn.id, type: turn.type, variant, asked_lane: variant === 'one-call' && lane, calls: [] };
  if (variant === 'two-call') {
    const [m, s] = await Promise.all([
      callModel(modelKey, { system: MODE_SYSTEM_PROMPT, user: input, ...SETTINGS.triage_mode }),
      callModel(modelKey, { system: buildSignalsSystemPrompt([], '', mc), user: input, ...SETTINGS.triage_signals }),
    ]);
    const mj = m.ok ? parseJson(m.content) : null;
    const sj = s.ok ? parseJson(s.content) : null;
    const mode = pick(mj, 'mode');
    const search = pick(sj, 'search');
    const personal = pick(sj, 'personal');
    const depth = pick(sj, 'depth');
    Object.assign(row, {
      mode: mode.value,
      search: search.value,
      personal: personal.value,
      depth: depth.value,
      fell_back: ['mode', 'search', 'personal', 'depth'].filter((f) => ({ mode, search, personal, depth })[f].fallback),
      turn_ms: Math.max(m.ms || 0, s.ms || 0),
      calls: [
        { job: 'triage_mode', ...strip(m) },
        { job: 'triage_signals', ...strip(s) },
      ],
    });
    return row;
  }
  const system = buildOneCallSystemPrompt([], '', mc, { lane });
  const r = await callModel(modelKey, { system, user: input, ...SETTINGS.triage_one_call });
  const { fellBack, ...decision } = readOneCall(r.ok ? r.content : '', { lane });
  Object.assign(row, decision, { fell_back: fellBack, call_failed: !r.ok, turn_ms: r.ms || 0, calls: [{ job: 'triage_one_call', ...strip(r) }] });
  return row;
}

const t0 = Date.now();
let done = 0;
const rows = await pool(turns, concurrency, runTurn, () => {
  done++;
  if (done % 100 === 0) console.error(`${done}/${turns.length} ${Math.round((Date.now() - t0) / 1000)}s`);
});
mkdirSync(RESULTS, { recursive: true });
const part = fromArg || toArg ? `_${from}-${to}` : '';
const out = {
  modelKey,
  model: MODELS[modelKey].model,
  set,
  tag,
  variant,
  from,
  to,
  concurrency,
  ran_at: new Date().toISOString(),
  wall_s: Math.round((Date.now() - t0) / 1000),
  calls: budgetUsed(),
  rows,
};
writeFileSync(`${RESULTS}lane_${set}_${tag}${part}.json`, JSON.stringify(out));
const failed = rows.filter((r) => r.calls.some((c) => !c.ok)).length;
const fb = rows.filter((r) => r.fell_back.length).length;
const cost = rows.reduce((s, r) => s + r.calls.reduce((a, c) => a + c.cost, 0), 0);
const ms = rows.map((r) => r.turn_ms).sort((a, b) => a - b);
console.log(
  `${modelKey} ${variant} ${set}${part}: ${rows.length} turns, failed calls on ${failed}, fell back on ${fb}, p50 ${ms[Math.floor(ms.length / 2)]}ms p90 ${ms[Math.floor(ms.length * 0.9)]}ms, $${cost.toFixed(4)}, ${Math.round((Date.now() - t0) / 1000)}s`,
);
