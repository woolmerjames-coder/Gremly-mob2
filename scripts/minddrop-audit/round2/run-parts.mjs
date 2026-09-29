// Part tests on the design set.
//   multi:    drops that are multi (gold) or that any run split. Compares the
//             one call split, the multi specialist on a given model, and
//             "pieces alone" (the old v2 way: split, then classify each piece
//             on its own without the rest of the drop).
//   question: drops where asking is acceptable (gold) or that any run asked
//             about. Compares question writers (the question specialist on a
//             given model): does it still ask, and do the answers offered
//             cover what the user meant.
// Usage: node run-parts.mjs <multi|question> <modelKey> <tag>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { MODELS, callCost } from '../models.mjs';
import { callOpenAI, callAnthropic, callGemini } from '../providers.mjs';
import { normalizeClassifyV3, parseModelJson, formatDropMessage } from './prompts/v3.5b.js';
import { applyGates } from './classifyV4.mjs';
import { PROMPTS } from './designs.mjs';
import { loadGold2, loadItems, labelOf, segLabel, optLabel } from './score2.mjs';

const [mode, modelKey, tag = 'p1'] = process.argv.slice(2);
const R2 = new URL('./results/', import.meta.url).pathname;
const { keys } = await import('../keys.mjs');
const CTX = { currentDate: '2026-09-29', dayOfWeek: 'Tuesday' };
const gold = loadGold2('design');
const items = Object.fromEntries(loadItems('design').map((x) => [x.id, x.raw]));
const runs = readdirSync(R2).filter((f) => f.endsWith('_design_r1.json')).map((f) => JSON.parse(readFileSync(R2 + f, 'utf8')));

async function call(mk, system, user) {
  const spec = MODELS[mk];
  const args = { model: spec.model, system, user, maxTokens: spec.maxTokens || 1500 };
  const r = spec.provider === 'openai' ? await callOpenAI({ ...args, key: keys.openai, effort: spec.effort })
    : spec.provider === 'gemini' ? await callGemini({ ...args, key: keys.gemini, thinking: spec.thinking })
    : await callAnthropic({ ...args, key: keys.anthropic, thinking: spec.thinking });
  return { parsed: r.ok ? parseModelJson(r.content) : null, ms: r.ms, usage: r.usage, cost: r.usage ? callCost(spec, r.usage) : 0 };
}

async function pool(list, fn, conc = 3) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (i < list.length) { const x = list[i++]; out.push(await fn(x)); } }));
  return out;
}

let rows = [];
if (mode === 'multi') {
  const ids = new Set(Object.keys(gold).filter((id) => gold[id].primary === 'multi'));
  for (const run of runs) for (const r of run.rows) if (r.label === 'multi') ids.add(r.id);
  rows = await pool([...ids], async (id) => {
    const text = items[id];
    const spec = await call(modelKey, PROMPTS.multi, formatDropMessage(text, CTX));
    const n = spec.parsed ? normalizeClassifyV3(spec.parsed, text) : null;
    // pieces alone: split with the specialist, then classify each piece on its own
    let alone = null;
    if (n?.is_multi) {
      alone = await Promise.all(n.segments.map(async (s) => {
        const c = await call('gemini-3.1-flash-lite', PROMPTS.v4, formatDropMessage(s.text, CTX));
        const g = c.parsed ? applyGates(c.parsed, s.text) : null;
        return { text: s.text, label: g && !g.is_ambiguous && !g.is_multi ? segLabel(g) : 'ambiguous', cost: c.cost };
      }));
    }
    return {
      id, raw: text, label: labelOf(n), ms: spec.ms, cost: spec.cost + (alone ? alone.reduce((a, x) => a + x.cost, 0) : 0),
      segments: n?.is_multi ? n.segments.map((s) => ({ text: s.text, label: segLabel(s) })) : null,
      alone: alone ? alone.map(({ text, label }) => ({ text, label })) : null,
    };
  });
} else {
  const ids = new Set(Object.keys(gold).filter((id) => gold[id].acceptable.includes('ambiguous')));
  for (const run of runs) for (const r of run.rows) if (r.label === 'ambiguous') ids.add(r.id);
  rows = await pool([...ids], async (id) => {
    const text = items[id];
    const c = await call(modelKey, PROMPTS.question, formatDropMessage(text, CTX));
    const n = c.parsed ? normalizeClassifyV3(c.parsed, text) : null;
    return {
      id, raw: text, label: labelOf(n), ms: c.ms, cost: c.cost, ambiguity_type: n?.ambiguity_type || null,
      question: n?.clarification_question || null,
      labels: n?.clarification_options ? n.clarification_options.map((o) => o.label) : null,
      options: n?.clarification_options ? n.clarification_options.map((o) => ({ label: optLabel(o), text: o.label })) : null,
      clar_source: n?.clarification_source || null,
    };
  });
}
rows.sort((a, b) => a.id.localeCompare(b.id));
const cost = rows.reduce((a, r) => a + (r.cost || 0), 0);
writeFileSync(`${R2}part_${mode}_${modelKey}_${tag}.json`, JSON.stringify({ summary: { mode, modelKey, n: rows.length, cost_total: +cost.toFixed(4) }, rows }, null, 1));
console.log(JSON.stringify({ mode, modelKey, n: rows.length, cost_total: +cost.toFixed(4) }));
