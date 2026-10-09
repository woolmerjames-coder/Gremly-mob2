// Merges a run made in parts of 100 (run-v3-worker.mjs <set>pNN <tag>pNN, run one after
// another so each fits a three minute call) into results/v3w_<tag>_<set>.json, the file
// round2/test-report.mjs and round2/split-report.mjs read.
//   node merge-parts.mjs <set: test2|design> <tag>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { RESULTS } from './paths.mjs';

const [set, tag] = process.argv.slice(2);
const want = JSON.parse(readFileSync(new URL(`./data/${set}.json`, import.meta.url), 'utf8')).length;
const files = readdirSync(RESULTS).filter((f) => new RegExp(`^v3w_${tag}p\\d\\d_${set}p\\d\\d\\.json$`).test(f)).sort();
let rows = [];
let summary = null;
let cost = 0;
let fallbacks = 0;
for (const f of files) {
  const d = JSON.parse(readFileSync(RESULTS + f, 'utf8'));
  rows = rows.concat(d.rows);
  summary = summary || d.summary;
  cost += d.summary.cost_total || 0;
  fallbacks += d.summary.fallbacks || 0;
}
rows.sort((a, b) => a.id.localeCompare(b.id));
if (rows.length !== want || new Set(rows.map((r) => r.id)).size !== want) {
  console.error(`expected ${want} drops, have ${rows.length} from ${files.length} parts`);
  process.exit(1);
}
const out = `${RESULTS}v3w_${tag}_${set}.json`;
writeFileSync(out, JSON.stringify({ summary: { ...summary, split: set, tag, fallbacks, cost_total: +cost.toFixed(4), note: `merged from ${files.length} parts run one after another` }, rows }, null, 1));
console.log(`${rows.length} drops, ${rows.filter((r) => r.label === 'FAIL').length} failed, ${fallbacks} backup answers, $${cost.toFixed(2)} -> ${out}`);
