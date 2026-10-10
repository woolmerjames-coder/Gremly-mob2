// Stage 3 of the Mind Drop rethink: scores Worker runs on the design set or the locked
// test set, then lists for the last run every gold multi drop (clear or unsure, the drop
// as one, the pieces) and every single drop it split, and every drop whose answer changed
// from the first run. Counting only.
//   node round2/split-report.mjs <design|test> <tagA> [tagB]
import { readFileSync } from 'node:fs';
import { MODELS } from '../models.mjs';
import { loadGold2, scoreRows2 } from './score2.mjs';

const [set, ...tags] = process.argv.slice(2);
const file = set === 'design' ? 'design' : 'test2';
const gold = loadGold2(set === 'design' ? 'design' : 'test');
const R1 = new URL('../results/', import.meta.url).pathname;
const byModel = Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [v.model, k]));
const load = (tag) =>
  JSON.parse(readFileSync(`${R1}v3w_${tag}_${file}.json`, 'utf8')).rows.map((r) => ({
    ...r,
    calls: (r.calls || []).map((c) => ({ modelKey: byModel[c.model] || c.model, usage: c.usage, cost: c.cost })),
  }));
const runs = tags.map((t) => [t, load(t)]);

console.log(`| Run | Accuracy | Wrong without asking | Needless questions | Multi found | Pieces right | Fully right | False multi | Typical | p90 |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|`);
for (const [t, rows] of runs) {
  const s = scoreRows2(rows, gold);
  console.log(`| ${t} | ${(s.accuracy * 100).toFixed(1)}% | ${s.silent_wrong} | ${s.needless_question} | ${s.multi.detected}/${s.multi.gold} | ${s.multi.pieces_right}/${s.multi.pieces} | ${s.multi.fully_right} | ${s.multi.false_multi} | ${(s.p50_ms / 1000).toFixed(1)}s | ${(s.p90_ms / 1000).toFixed(1)}s |`);
}

const [lastTag, last] = runs[runs.length - 1];
const pieces = (r) => (r.segments || []).map((x) => `${x.label}: ${x.text}${x.question ? ` [asks: ${x.question}]` : ''}`).join(' | ');
console.log(`\nGold multi drops in ${lastTag}:`);
for (const r of last) {
  const g = gold[r.id];
  if (g.primary !== 'multi') continue;
  console.log(`- ${r.id} ${r.label === 'multi' ? `split ${r.split ?? 'none'}, as one ${r.as_one ?? 'none'}` : `NOT SPLIT (${r.label})`} | ${JSON.stringify(r.raw).slice(0, 140)}${r.label === 'multi' ? `\n    ${pieces(r)}` : ''}`);
}
console.log(`\nSingle drops ${lastTag} split (gold is not multi):`);
for (const r of last) {
  const g = gold[r.id];
  if (r.label !== 'multi' || g.primary === 'multi') continue;
  console.log(`- ${r.id} split ${r.split ?? 'none'}, as one ${r.as_one ?? 'none'}, gold ${g.primary} (accepts ${g.acceptable.join(', ')}) | ${JSON.stringify(r.raw).slice(0, 140)}\n    ${pieces(r)}`);
}
if (runs.length > 1) {
  const first = new Map(runs[0][1].map((r) => [r.id, r]));
  console.log(`\nAnswers that changed from ${runs[0][0]} to ${lastTag}:`);
  for (const r of last) {
    const a = first.get(r.id);
    if (!a || a.label === r.label) continue;
    const g = gold[r.id];
    const mark = (L) => (g.acceptable.includes(L) ? 'right' : 'wrong');
    console.log(`- ${r.id} ${a.label} (${mark(a.label)}) -> ${r.label} (${mark(r.label)}), gold ${g.primary} | ${JSON.stringify(r.raw).slice(0, 120)}`);
  }
}
