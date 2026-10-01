// Run one design over the design set (450) or the locked test set (1,000).
// Usage: node run-design.mjs <design:model> <design|test> <tag> [concurrency]
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { makeDesign } from './designs.mjs';
import { loadGold2, loadItems, scoreRows2, labelOf, segLabel, optLabel } from './score2.mjs';

const [name, split, tag = 'r1', conc = '3'] = process.argv.slice(2);
const run = makeDesign(name);
const items = loadItems(split).slice(0, Number(process.env.LIMIT || 1e9));
const gold = loadGold2(split);
const OUT = new URL(`./results/${name.replace(':', '__')}_${split}_${tag}.json`, import.meta.url).pathname;
mkdirSync(new URL('./results/', import.meta.url).pathname, { recursive: true });

const rows = [];
let i = 0;
async function worker() {
  while (i < items.length) {
    const it = items[i++];
    let r;
    try { r = await run(it.raw); } catch (err) { r = { norm: null, route: 'error', calls: [], ms: null, error: String(err) }; }
    const n = r.norm;
    rows.push({
      id: it.id, raw: it.raw, label: labelOf(n), pre_gate_label: n?.pre_gate ? labelOf(n.pre_gate) : labelOf(n), gate: n?.gate || null,
      route: r.route, ms: n ? r.ms : null,
      segments: n?.is_multi ? n.segments.map((s) => ({ text: s.text, label: segLabel(s) })) : null,
      question: n?.clarification_question || null, ambiguity_type: n?.ambiguity_type || null,
      options: n?.clarification_options ? n.clarification_options.map((o) => ({ label: optLabel(o), text: o.label })) : null,
      clar_source: n?.clarification_source || null, facts: n?.facts || null,
      calls: r.calls.map((c) => ({ modelKey: c.modelKey, ok: c.ok, ms: c.ms, usage: c.usage, cost: c.cost, error: c.error ? String(c.error).slice(0, 200) : null })),
    });
  }
}
const t0 = Date.now();
await Promise.all(Array.from({ length: Number(conc) }, worker));
rows.sort((a, b) => a.id.localeCompare(b.id));
const s = scoreRows2(rows, gold);
const sPre = scoreRows2(rows, gold, { labelKey: 'pre_gate_label' });
const routes = {};
for (const r of rows) routes[r.route] = (routes[r.route] || 0) + 1;
const summary = { design: name, split, tag, ...s, without_gates_accuracy: sPre.accuracy, routes, wall_s: Math.round((Date.now() - t0) / 1000) };
writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary));
