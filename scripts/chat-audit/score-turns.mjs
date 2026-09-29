// Score triage runs against the gold answers.
// Usage: node score-turns.mjs <set> <tag1> [tag2 ...]   (first tag is the baseline for the paired test)
import { readFileSync } from 'node:fs';
import { RESULTS, DATA } from './paths.mjs';
import { turnGold, FIELDS } from './gold.mjs';

const [set, ...tags] = process.argv.slice(2);
const gold = turnGold();
const turns = JSON.parse(readFileSync(`${DATA}turns_${set}.json`, 'utf8'));
const ids = turns.map((t) => t.id).filter((id) => gold[id]);
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + '%' : 'n/a');
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };

// Exact two sided sign test on discordant pairs (right for one, wrong for the other).
function signTest(b, c) {
  const n = b + c; if (!n) return 1;
  const k = Math.min(b, c);
  let p = 0; for (let i = 0; i <= k; i++) p += choose(n, i);
  return Math.min(1, 2 * p / 2 ** n);
}
function choose(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }

const runs = tags.map((tag) => ({ tag, ...JSON.parse(readFileSync(`${RESULTS}turns_${set}_${tag}.json`, 'utf8')) }));
const perTurnOk = {};
console.log(`set ${set}: ${ids.length} turns with gold (${Object.values(gold).filter((g) => g.mode.by === 'james').length} reviewed by James)\n`);
const header = ['run', 'model', 'variant', 'all 4 right', 'mode', 'depth', 'search', 'personal', 'fallback', 'p50', 'p90', '$/1000 turns'];
const lines = [header];
for (const run of runs) {
  const rows = Object.fromEntries(run.rows.map((r) => [r.id, r]));
  const acc = {}; let all4 = 0, all4loose = 0, fb = 0;
  perTurnOk[run.tag] = {};
  for (const f of FIELDS) acc[f] = { strict: 0, loose: 0 };
  for (const id of ids) {
    const r = rows[id]; const g = gold[id];
    let okAll = true, okAllLoose = true;
    for (const f of FIELDS) {
      const v = r?.[f];
      const strict = g[f].both.includes(v), loose = g[f].either.includes(v);
      if (strict) acc[f].strict++; else okAll = false;
      if (loose) acc[f].loose++; else okAllLoose = false;
    }
    if (okAll) all4++; if (okAllLoose) all4loose++;
    perTurnOk[run.tag][id] = okAll;
    if (r && (r.fallback.mode || r.fallback.search || r.fallback.depth || r.fallback.personal)) fb++;
  }
  const ms = ids.map((id) => rows[id]?.turn_ms || 0);
  const cost = ids.reduce((s, id) => s + (rows[id]?.calls || []).reduce((a, c) => a + (c.cost || 0), 0), 0);
  lines.push([run.tag, run.modelKey, run.variant, `${pct(all4, ids.length)} (${pct(all4loose, ids.length)} loose)`, ...FIELDS.map((f) => `${pct(acc[f].strict, ids.length)} (${pct(acc[f].loose, ids.length)})`), pct(fb, ids.length), q(ms, 0.5) + 'ms', q(ms, 0.9) + 'ms', '$' + ((1000 * cost) / ids.length).toFixed(2)]);
}
const widths = header.map((_, i) => Math.max(...lines.map((l) => String(l[i]).length)));
for (const l of lines) console.log(l.map((c, i) => String(c).padEnd(widths[i])).join('  '));
console.log('\nstrict = answer accepted by both labellers (loose = by either). p50/p90 = time for the slowest of the parallel calls in a turn.');
if (runs.length > 1) {
  console.log(`\nPaired against ${runs[0].tag} (all four right per turn, exact sign test):`);
  for (const run of runs.slice(1)) {
    let b = 0, c = 0;
    for (const id of ids) { const x = perTurnOk[runs[0].tag][id], y = perTurnOk[run.tag][id]; if (x && !y) b++; if (!x && y) c++; }
    console.log(`  ${run.tag}: better on ${c}, worse on ${b}, p = ${signTest(b, c).toFixed(4)}`);
  }
}
// Where each run misses most, by field and by the gold answer it missed.
for (const run of runs) {
  const rows = Object.fromEntries(run.rows.map((r) => [r.id, r]));
  const miss = {};
  for (const id of ids) for (const f of FIELDS) {
    const v = rows[id]?.[f]; const g = gold[id][f];
    if (!g.both.includes(v)) { const k = `${f}: said ${v}, gold ${g.primary || g.both.join('/') || g.either.join('/')}`; miss[k] = (miss[k] || 0) + 1; }
  }
  const top = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`\n${run.tag} most common misses:`); for (const [k, n] of top) console.log(`  ${n}  ${k}`);
}
