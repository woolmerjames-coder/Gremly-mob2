// The designs under test. Each design takes a drop and returns
// { norm, route, calls, ms } where norm is the normalised classification
// (same shape as the Worker's classify-v3 response) and calls lists every
// model call with its cost and time. Sequential steps add their times;
// parallel steps take the slowest.
import { readFileSync } from 'node:fs';
import { MODELS, callCost } from '../models.mjs';
import { callOpenAI, callAnthropic, callGemini } from '../providers.mjs';
import { buildClassifyV3Prompt, normalizeClassifyV3, parseModelJson, formatDropMessage } from './prompts/v3.5b.js';
import { buildV4Prompt, buildV41Prompt, applyGates } from './classifyV4.mjs';
import { habitSpecialistPrompt, multiSpecialistPrompt, questionSpecialistPrompt } from './specialists.mjs';

const { keys } = await import('../keys.mjs');
const CTX = { currentDate: '2026-09-29', dayOfWeek: 'Tuesday' };
const P = {
  v35: buildClassifyV3Prompt(),
  v4: buildV4Prompt(),
  v41: buildV41Prompt(),
  habit: habitSpecialistPrompt(),
  multi: multiSpecialistPrompt(),
  question: questionSpecialistPrompt(),
};

async function call(modelKey, system, user) {
  const spec = MODELS[modelKey];
  const args = { model: spec.model, system, user, maxTokens: spec.maxTokens || 1500 };
  const r = spec.provider === 'openai' ? await callOpenAI({ ...args, key: keys.openai, effort: spec.effort })
    : spec.provider === 'gemini' ? await callGemini({ ...args, key: keys.gemini, thinking: spec.thinking })
    : await callAnthropic({ ...args, key: keys.anthropic, thinking: spec.thinking });
  const parsed = r.ok ? parseModelJson(r.content) : null;
  return { modelKey, ok: r.ok, parsed, ms: r.ms, usage: r.usage || null, cost: r.usage ? callCost(spec, r.usage) : 0, error: r.ok ? null : r.error };
}

// One classification call. prompt: 'v35' (current) or 'v4' (checklist + gates).
async function classify(modelKey, prompt, text, { gates = true } = {}) {
  const c = await call(modelKey, P[prompt], formatDropMessage(text, CTX));
  let norm = null;
  if (c.parsed) norm = prompt === 'v4' && gates ? applyGates(c.parsed, text) : normalizeClassifyV3(c.parsed, text);
  if (norm && prompt === 'v4' && !gates) norm = { ...norm, gate: null };
  return { norm, call: c };
}

const isHabit = (n) => n && !n.is_multi && n.bucket === 'habit';
const sameLabel = (a, b) => {
  const l = (n) => (!n ? 'FAIL' : n.is_multi ? 'multi' : n.is_ambiguous ? 'ambiguous' : n.bucket === 'habit' ? `habit/${n.habitSubtype}` : n.bucket === 'todo' ? 'todo' : `log/${n.subtype}`);
  return l(a) === l(b);
};

export const DESIGNS = {
  // Baselines: one call, current prompt
  single_v35: (m) => async (text) => {
    const r = await classify(m, 'v35', text);
    return { norm: r.norm, route: 'single', calls: [r.call], ms: r.call.ms };
  },
  // Ordered steps and extra rules, no checklist (shorter output)
  plain41: (m) => async (text) => {
    const r = await classify(m, 'v41', text);
    return { norm: r.norm, route: 'single', calls: [r.call], ms: r.call.ms };
  },
  // Design 1: one call with checklist, product owner's rules enforced in code
  checklist: (m) => async (text) => {
    const r = await classify(m, 'v4', text);
    return { norm: r.norm, route: r.norm?.gate || 'single', calls: [r.call], ms: r.call.ms };
  },
  // Design 2: fast gate (Flash-Lite, checklist prompt), then specialists
  specialists: (strong) => async (text) => {
    const first = await classify('gemini-3.1-flash-lite', 'v4', text);
    const calls = [first.call];
    let ms = first.call.ms;
    const n = first.norm;
    const f = n?.facts || {};
    let route = 'fast';
    let prompt = null;
    if (!n) { route = 'fallback'; prompt = 'v4'; }
    else if (n.is_multi || Number(f.separate_items) >= 2) { route = 'multi'; prompt = 'multi'; }
    else if (isHabit(n.pre_gate || n) || f.repetition_stated === true) { route = 'habit'; prompt = 'habit'; }
    else if (n.is_ambiguous) { route = 'question'; prompt = 'question'; }
    if (!prompt) return { norm: n, route, calls, ms };
    const s = await call(strong, P[prompt], formatDropMessage(text, CTX));
    calls.push(s);
    ms += s.ms;
    let norm = null;
    if (s.parsed) norm = prompt === 'v4' ? applyGates(s.parsed, text) : normalizeClassifyV3(s.parsed, text);
    return { norm: norm || n, route: norm ? route : `${route}_failed`, calls, ms };
  },
  // Design 2b: same fast gate, but the risky ones go to the strong model with
  // the ordinary checklist prompt (is specialisation itself worth it?)
  cascade: (strong) => async (text) => {
    const first = await classify('gemini-3.1-flash-lite', 'v4', text);
    const calls = [first.call];
    let ms = first.call.ms;
    const n = first.norm;
    const f = n?.facts || {};
    const risky = !n || n.is_multi || Number(f.separate_items) >= 2 || isHabit(n.pre_gate || n) || f.repetition_stated === true || n.is_ambiguous;
    if (!risky) return { norm: n, route: 'fast', calls, ms };
    const s = await classify(strong, 'v4', text);
    calls.push(s.call);
    ms += s.call.ms;
    return { norm: s.norm || n, route: 'escalated', calls, ms };
  },
  // Design 3: two opinions in parallel, blind referee when they disagree
  referee: (referee) => async (text) => {
    const [a, b] = await Promise.all([classify('gpt-6-luna-low', 'v4', text), classify('gemini-3.1-flash-lite', 'v4', text)]);
    const calls = [a.call, b.call];
    let ms = Math.max(a.call.ms || 0, b.call.ms || 0);
    if (a.norm && b.norm && sameLabel(a.norm, b.norm)) return { norm: a.norm, route: 'agreed', calls, ms };
    const r = await classify(referee, 'v4', text);
    calls.push(r.call);
    ms += r.call.ms;
    return { norm: r.norm || a.norm || b.norm, route: 'referee', calls, ms };
  },
  // Same, with Luna on the shorter prompt (no checklist, faster)
  second_opinion41: (second) => async (text) => {
    const a = await classify('gpt-6-luna-low', 'v41', text);
    const calls = [a.call];
    let ms = a.call.ms;
    if (!a.norm || !a.norm.is_ambiguous) return { norm: a.norm, route: 'luna', calls, ms };
    const s = await call(second, P.question, formatDropMessage(text, CTX));
    calls.push(s);
    ms += s.ms;
    const norm = s.parsed ? normalizeClassifyV3(s.parsed, text) : null;
    return { norm: norm || a.norm, route: 'second_opinion', calls, ms };
  },
  // Banked idea: Luna, with a second opinion only when it wants to ask
  second_opinion: (second) => async (text) => {
    const a = await classify('gpt-6-luna-low', 'v4', text);
    const calls = [a.call];
    let ms = a.call.ms;
    if (!a.norm || !a.norm.is_ambiguous) return { norm: a.norm, route: 'luna', calls, ms };
    const s = await call(second, P.question, formatDropMessage(text, CTX));
    calls.push(s);
    ms += s.ms;
    const norm = s.parsed ? normalizeClassifyV3(s.parsed, text) : null;
    return { norm: norm || a.norm, route: 'second_opinion', calls, ms };
  },
};

// Name like "checklist:gemini-3.8-flash" or "single_v35:gpt-6-luna-low"
export function makeDesign(name) {
  const [d, arg] = name.split(':');
  if (!DESIGNS[d]) throw new Error(`unknown design ${d}`);
  return DESIGNS[d](arg);
}

export const PROMPTS = P;
