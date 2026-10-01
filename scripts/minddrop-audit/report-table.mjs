// Markdown tables for the audit report, computed straight from result files.
import { RESULTS } from './paths.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { MODELS, TRAFFIC_HIT_RATE } from './models.mjs';
import { loadGold, scoreRows } from './score.mjs';
const DIR = RESULTS;
const gold = loadGold();
const BY_ID = Object.fromEntries(Object.values(MODELS).map((m) => [m.model, m]));
function realCost(spec, u) {
  if (!spec || !u) return 0;
  const p = spec.price, h = TRAFFIC_HIT_RATE[spec.ttlKey] ?? TRAFFIC_HIT_RATE['5m'];
  const c = (u.cachedInput || 0) + (u.cacheWrite || 0);
  return ((Math.max(0, u.input - c)) * p.in + h * c * p.cached + (1 - h) * c * (p.write || p.in) + u.output * p.out) / 1e6;
}
function stats(file, modelKey) {
  const { rows } = JSON.parse(readFileSync(`${DIR}${file}.json`, 'utf8'));
  const s = scoreRows(rows, gold);
  let real = 0;
  for (const r of rows) {
    if (r.calls) for (const c of r.calls) real += realCost(BY_ID[c.model] || Object.values(MODELS).find((m) => c.model?.startsWith(m.model)), c.usage);
    else real += realCost(MODELS[modelKey], r.usage);
  }
  return { ...s, real1k: (real / rows.length) * 1000 };
}
const rowsSpec = JSON.parse(process.argv[2]);
const pct = (x) => (x * 100).toFixed(1) + '%';
console.log('| Setup | Runs | Accuracy | Wrong without asking | Needless questions | Typical time | Slow end (p90) | Slowest (p99) | Cost per 1,000 drops |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [label, files, modelKey] of rowsSpec) {
  const st = files.filter((f) => existsSync(`${DIR}${f}.json`)).map((f) => stats(f, modelKey));
  if (!st.length) continue;
  const avg = (k) => st.reduce((a, s) => a + s[k], 0) / st.length;
  const n = st[0].n;
  const range = (k, f) => { const lo = Math.min(...st.map((s) => s[k])), hi = Math.max(...st.map((s) => s[k])); return lo === hi ? f(lo) : `${f(lo)} to ${f(hi)}`; };
  console.log(`| ${label} | ${st.length} | ${range('accuracy', pct)} | ${range('silent_wrong', (x) => `${x}`)} | ${range('needless_question', (x) => `${x}`)} | ${(avg('p50_ms') / 1000).toFixed(1)}s | ${(avg('p90_ms') / 1000).toFixed(1)}s | ${(avg('p99_ms') / 1000).toFixed(1)}s | $${avg('real1k').toFixed(2)} |`);
}
