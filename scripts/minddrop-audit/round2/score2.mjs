// Scoring for round 2: gold from three blind labellers (plus James's review),
// with multi drops scored piece by piece and questions scored on whether the
// answers offered include what the user meant.
import { readFileSync, existsSync } from 'node:fs';
import { MODELS, TRAFFIC_HIT_RATE } from '../models.mjs';
import { CLARIFY_TYPE_CONFIGS } from './prompts/v3.5b.js';

const ND = new URL('./data/', import.meta.url).pathname;
export function loadGold2(split) {
  if (split === 'design') return JSON.parse(readFileSync(ND + 'design_gold.json', 'utf8'));
  const f = existsSync(ND + 'test_gold.json') ? 'test_gold.json' : 'test_gold_pre_review.json';
  return JSON.parse(readFileSync(ND + f, 'utf8'));
}
export function loadItems(split) {
  if (split === 'design') {
    const A = new URL('../data/', import.meta.url).pathname;
    return [...JSON.parse(readFileSync(A + 'dev.json', 'utf8')), ...JSON.parse(readFileSync(A + 'holdout.json', 'utf8'))].map((x) => ({ id: x.id, raw: x.raw }));
  }
  return JSON.parse(readFileSync(new URL('../data/test2.json', import.meta.url), 'utf8')).map((x) => ({ id: x.id, raw: x.raw }));
}

export const labelOf = (n) => (!n ? 'FAIL' : n.is_multi ? 'multi' : n.is_ambiguous ? 'ambiguous' : n.bucket === 'habit' ? `habit/${n.habitSubtype || 'start_habit'}` : n.bucket === 'todo' ? 'todo' : `log/${n.subtype || 'general'}`);
export const segLabel = (s) => (s.bucket === 'habit' ? `habit/${s.habitSubtype || 'start_habit'}` : s.bucket === 'todo' ? 'todo' : `log/${s.subtype || 'general'}`);
export const optLabel = (o) => (o.bucket === 'habit' ? `habit/${o.habitSubtype || 'start_habit'}` : o.bucket === 'todo' ? 'todo' : `log/${o.subtype || 'general'}`);

const toks = (s) => new Set(String(s).toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || []);
const jac = (a, b) => { const u = new Set([...a, ...b]); let i = 0; for (const x of a) if (b.has(x)) i++; return u.size ? i / u.size : 0; };

function scoreSegments(goldSegs, predSegs) {
  const used = new Set();
  let correct = 0;
  for (const g of goldSegs) {
    const gt = toks(g.text);
    let best = -1, bs = 0.3;
    predSegs.forEach((p, j) => { if (used.has(j)) return; const s = jac(gt, toks(p.text)); if (s >= bs) { bs = s; best = j; } });
    if (best >= 0) { used.add(best); if (g.acceptable.includes(predSegs[best].label)) correct++; }
  }
  return correct;
}

function realCallCost(spec, u) {
  if (!spec || !u) return 0;
  const p = spec.price, h = TRAFFIC_HIT_RATE[spec.ttlKey] ?? TRAFFIC_HIT_RATE['5m'];
  const c = (u.cachedInput || 0) + (u.cacheWrite || 0);
  return (Math.max(0, u.input - c) * p.in + h * c * p.cached + (1 - h) * c * (p.write || p.in) + u.output * p.out) / 1e6;
}

export function scoreRows2(rows, gold, { labelKey = 'label' } = {}) {
  const n = rows.length;
  let ok = 0, strict = 0, silent = 0, needless = 0, asked = 0, failed = 0;
  let gm = 0, gmDetected = 0, gmSegs = 0, gmSegsOk = 0, gmFull = 0, multiFP = 0;
  let justifiedAsks = 0, covered = 0, needlessRecoverable = 0;
  let real = 0, test = 0, calls = 0;
  for (const r of rows) {
    const g = gold[r.id];
    const L = r[labelKey];
    for (const c of r.calls || []) { test += c.cost || 0; real += realCallCost(MODELS[c.modelKey], c.usage); calls++; }
    if (L === 'FAIL') { failed++; continue; }
    if (g.acceptable.includes(L)) ok++;
    if (g.primary === L) strict++;
    if (L === 'ambiguous') {
      asked++;
      // What each answer does comes from the current fixed options for the
      // question type, so a change to those mappings rescores every run.
      const cfg = CLARIFY_TYPE_CONFIGS[r.ambiguity_type];
      const offered = new Set((r.options || []).map((o, i) => (cfg && cfg.options[i] && cfg.options[i].bucket !== 'habit' ? optLabel(cfg.options[i]) : o.label)));
      if (!g.acceptable.includes('ambiguous')) { needless++; if (offered.has(g.primary)) needlessRecoverable++; }
      else {
        const G = g.acceptable.filter((x) => x !== 'ambiguous' && x !== 'multi');
        if (G.length) { justifiedAsks++; if (G.some((x) => offered.has(x))) covered++; }
      }
    } else if (!g.acceptable.includes(L)) silent++;
    if (L === 'multi' && !g.acceptable.includes('multi')) multiFP++;
    if (g.primary === 'multi' && g.segments) {
      gm++;
      gmSegs += g.segments.length;
      if (L === 'multi') {
        gmDetected++;
        const pred = (r.segments || []).map((s) => ({ text: s.text, label: s.label }));
        const c = scoreSegments(g.segments, pred);
        gmSegsOk += c;
        if (c === g.segments.length && pred.length === g.segments.length) gmFull++;
      }
    }
  }
  const lat = rows.filter((r) => r.ms != null && r[labelKey] !== 'FAIL').map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : null);
  return {
    n, accuracy: +(ok / n).toFixed(3), strict: +(strict / n).toFixed(3), silent_wrong: silent, needless_question: needless, asked, failed,
    p50_ms: q(0.5), p90_ms: q(0.9), p99_ms: q(0.99),
    multi: { gold: gm, detected: gmDetected, pieces: gmSegs, pieces_right: gmSegsOk, fully_right: gmFull, false_multi: multiFP },
    questions: { justified_with_alternatives: justifiedAsks, answers_cover_intent: covered, needless_but_right_answer_offered: needlessRecoverable },
    cost_test_per_1k: +((test / n) * 1000).toFixed(3), cost_real_per_1k: +((real / n) * 1000).toFixed(3), calls_per_drop: +(calls / n).toFixed(2),
  };
}
