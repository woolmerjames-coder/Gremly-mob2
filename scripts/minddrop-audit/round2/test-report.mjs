// Round 2 results on the locked test set (1,000 new random drops), plus
// paired comparisons against today's live setup, and a breakdown by kind of
// drop so it is visible where each design wins.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { MODELS } from '../models.mjs';
import { loadGold2, scoreRows2 } from './score2.mjs';

const R2 = new URL('./results/', import.meta.url).pathname;
const R1 = new URL('../results/', import.meta.url).pathname;
const gold = loadGold2('test');
const byModel = Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [v.model, k]));

function loadV2() {
  // today's v2 chain on the same drops: run-v2.mjs test2 prod gpt-4.1-nano (see ../README.md)
  const name = existsSync(R1) && readdirSync(R1).find((x) => /^v2_.*_gpt-4\.1-nano_test2_.*\.json$/.test(x));
  if (!name) return null;
  const f = R1 + name;
  const { rows } = JSON.parse(readFileSync(f, 'utf8'));
  return rows.map((r) => ({
    id: r.id, label: r.label, ms: r.ms, route: 'v2',
    segments: r.label === 'multi' && r.segments ? r.segments.map((s) => { const i = s.indexOf(': '); return { label: s.slice(0, i), text: s.slice(i + 2) }; }) : null,
    options: null, ambiguity_type: r.ambiguity_type || null,
    calls: (r.calls || []).map((c) => ({ modelKey: byModel[c.model] || c.model, usage: c.usage, cost: c.cost })),
  }));
}

const runs = {};
const v2 = loadV2();
if (v2) runs['Today: v2 chain, gpt-4.1-nano'] = [v2];
// End to end runs through the real Worker route (run-v3-worker.mjs test2 <tag> ...)
for (const f of existsSync(R1) ? readdirSync(R1).filter((x) => /^v3w_.+_test2\.json$/.test(x)) : []) {
  const { rows } = JSON.parse(readFileSync(R1 + f, 'utf8'));
  runs[`Worker: ${f.replace(/^v3w_/, '').replace(/_test2\.json$/, '')}`] = [rows.map((r) => ({ ...r, calls: (r.calls || []).map((c) => ({ modelKey: byModel[c.model] || c.model, usage: c.usage, cost: c.cost })) }))];
}
for (const f of readdirSync(R2).filter((f) => /_test_r\d\.json$/.test(f))) {
  const name = f.replace(/_test_r\d\.json$/, '').replace('__', ':');
  (runs[name] ||= []).push(JSON.parse(readFileSync(R2 + f, 'utf8')).rows);
}

const pct = (x) => (x * 100).toFixed(1);
console.log('| Setup | Runs | Accuracy | Wrong without asking | Needless questions | Multi found | Pieces right | Answers cover intent | Typical | p90 | p99 | Cost per 1,000 | Calls per drop |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const scored = {};
for (const [name, list] of Object.entries(runs)) {
  const S = list.map((rows) => scoreRows2(rows, gold));
  scored[name] = { S, list };
  const r = (k, f = (x) => x) => { const v = S.map((s) => (typeof k === 'function' ? k(s) : s[k])); if (typeof v[0] === 'string') return [...new Set(v)].join(' / '); const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? f(lo) : `${f(lo)} to ${f(hi)}`; };
  const avg = (k) => S.reduce((a, s) => a + s[k], 0) / S.length;
  console.log(`| ${name} | ${S.length} | ${r('accuracy', pct)}% | ${r('silent_wrong')} | ${r('needless_question')} | ${r((s) => `${s.multi.detected}/${s.multi.gold}`)} | ${r((s) => `${s.multi.pieces_right}/${s.multi.pieces}`)} | ${r((s) => (s.questions.justified_with_alternatives ? `${s.questions.answers_cover_intent}/${s.questions.justified_with_alternatives}` : 'n/a'))} | ${(avg('p50_ms') / 1000).toFixed(1)}s | ${(avg('p90_ms') / 1000).toFixed(1)}s | ${(avg('p99_ms') / 1000).toFixed(1)}s | $${avg('cost_real_per_1k').toFixed(2)} | ${avg('calls_per_drop').toFixed(1)} |`);
}

// Paired comparisons (first run of each) against today's live setup
function paired(A, B) {
  const a = Object.fromEntries(A.map((r) => [r.id, r])), b = Object.fromEntries(B.map((r) => [r.id, r]));
  const ids = Object.keys(a).filter((id) => b[id]);
  const ok = (r, id) => (gold[id].acceptable.includes(r.label) ? 1 : 0);
  const pairs = ids.map((id) => [ok(a[id], id), ok(b[id], id)]);
  const onlyA = pairs.filter(([x, y]) => x && !y).length, onlyB = pairs.filter(([x, y]) => !x && y).length;
  const n = onlyA + onlyB; let p = 0;
  const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  for (let k = 0; k <= Math.min(onlyA, onlyB); k++) p += C(n, k) / 2 ** n;
  p = Math.min(1, 2 * p);
  const rnd = (() => { let a = 11 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(); // mulberry32
  const d = []; for (let i = 0; i < 4000; i++) { let s = 0; for (let j = 0; j < pairs.length; j++) { const [x, y] = pairs[Math.floor(rnd() * pairs.length)]; s += y - x; } d.push(s / pairs.length); }
  d.sort((x, y) => x - y);
  const mean = pairs.reduce((s, [x, y]) => s + y - x, 0) / pairs.length;
  return `${(mean * 100).toFixed(1)} pts [${(d[100] * 100).toFixed(1)}, ${(d[3899] * 100).toFixed(1)}], p=${p.toFixed(4)}`;
}
const base = scored['Today: v2 chain, gpt-4.1-nano'];
if (base) {
  console.log('\nPaired against today (first run each):');
  for (const [name, { list }] of Object.entries(scored)) if (!name.startsWith('Today')) console.log(`  ${name}: ${paired(base.list[0], list[0])}`);
}
if (process.argv[2]) {
  const [x, y] = process.argv.slice(2);
  if (scored[x] && scored[y]) console.log(`\n${y} vs ${x}: ${paired(scored[x].list[0], scored[y].list[0])}`);
}

// Breakdown by kind of drop (gold primary), first run each
const kinds = { todo: (g) => g.primary === 'todo', habit: (g) => g.primary.startsWith('habit'), journal: (g) => g.primary === 'log/journal', 'idea, event or reference': (g) => ['log/idea', 'log/event', 'log/general'].includes(g.primary), 'unclear (ask)': (g) => g.primary === 'ambiguous', multi: (g) => g.primary === 'multi' };
console.log('\nAccuracy by kind of drop (first run):');
console.log('| Setup | ' + Object.keys(kinds).map((k) => `${k} (${Object.values(gold).filter(kinds[k]).length})`).join(' | ') + ' |');
console.log('|---|' + Object.keys(kinds).map(() => '---').join('|') + '|');
for (const [name, { list }] of Object.entries(scored)) {
  const rows = list[0];
  const cells = Object.values(kinds).map((fn) => { const rs = rows.filter((r) => fn(gold[r.id])); const ok = rs.filter((r) => gold[r.id].acceptable.includes(r.label)).length; return `${pct(ok / Math.max(1, rs.length))}%`; });
  console.log(`| ${name} | ${cells.join(' | ')} |`);
}
