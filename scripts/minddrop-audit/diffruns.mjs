// Per drop changes between two runs of the same model (dev only).
import { RESULTS } from './paths.mjs';
import { readFileSync } from 'node:fs';
import { loadGold } from './score.mjs';
const DIR = RESULTS;
const [a, b] = process.argv.slice(2);
const gold = loadGold();
const A = Object.fromEntries(JSON.parse(readFileSync(`${DIR}${a}.json`, 'utf8')).rows.map((r) => [r.id, r]));
const B = Object.fromEntries(JSON.parse(readFileSync(`${DIR}${b}.json`, 'utf8')).rows.map((r) => [r.id, r]));
let fixed = 0, broke = 0;
for (const id of Object.keys(A).sort()) {
  const g = gold[id];
  const ra = A[id], rb = B[id];
  if (!rb) continue;
  const oa = g.acceptable.includes(ra.label), ob = g.acceptable.includes(rb.label);
  if (oa === ob) continue;
  ob ? fixed++ : broke++;
  console.log(`${ob ? 'FIXED' : 'BROKE'} ${id} gold=${g.primary} (${g.acceptable.join(',')}) ${ra.label} -> ${rb.label} | ${ra.raw.replace(/\s+/g, ' ').slice(0, 100)}`);
}
console.log({ fixed, broke });
