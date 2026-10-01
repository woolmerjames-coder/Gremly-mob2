// Sum audit spend from every results file (cost is computed from the token
// usage each provider reported and the official prices in models.mjs).
import { RESULTS } from './paths.mjs';
import { readdirSync, readFileSync } from 'node:fs';
const DIR = RESULTS;
let total = 0;
const rows = [];
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json') && /^v[23]_/.test(f))) {
  const s = JSON.parse(readFileSync(DIR + f, 'utf8')).summary || {};
  total += s.cost_total || 0;
  rows.push([f, s.n, s.cost_total]);
}
for (const r of rows) console.log(r[0].padEnd(64), String(r[1]).padStart(4), '$' + (r[2] || 0).toFixed(4));
console.log('TOTAL'.padEnd(69), '$' + total.toFixed(4), '(cap $30)');
