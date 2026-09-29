// Paired comparison of two runs on the same drops: accuracy difference with
// a 95% bootstrap interval and McNemar's exact test.
import { RESULTS } from './paths.mjs';
import { readFileSync } from 'node:fs';
import { loadGold } from './score.mjs';
const DIR = RESULTS;
const gold = loadGold();
const load = (f) => Object.fromEntries(JSON.parse(readFileSync(`${DIR}${f}.json`, 'utf8')).rows.map((r) => [r.id, r]));
const [fa, fb] = process.argv.slice(2);
const A = load(fa), B = load(fb);
const ids = Object.keys(A).filter((id) => B[id]);
const ok = (r, id) => (gold[id].acceptable.includes(r.label) ? 1 : 0);
const pairs = ids.map((id) => [ok(A[id], id), ok(B[id], id)]);
const onlyA = pairs.filter(([a, b]) => a && !b).length, onlyB = pairs.filter(([a, b]) => !a && b).length;
// exact two-sided binomial on discordant pairs
const n = onlyA + onlyB; let p = 0;
const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
for (let k = 0; k <= Math.min(onlyA, onlyB); k++) p += C(n, k) / 2 ** n;
p = Math.min(1, 2 * p);
const rnd = (() => { let a = 7 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(); // mulberry32
const diffs = [];
for (let b = 0; b < 4000; b++) { let s = 0; for (let i = 0; i < pairs.length; i++) { const [a, bb] = pairs[Math.floor(rnd() * pairs.length)]; s += bb - a; } diffs.push(s / pairs.length); }
diffs.sort((x, y) => x - y);
const mean = pairs.reduce((s, [a, b]) => s + b - a, 0) / pairs.length;
console.log(`${fb} vs ${fa}: n=${pairs.length} diff=${(mean * 100).toFixed(1)} pts [${(diffs[100] * 100).toFixed(1)}, ${(diffs[3899] * 100).toFixed(1)}] only_new_right=${onlyB} only_old_right=${onlyA} McNemar p=${p.toFixed(4)}`);
