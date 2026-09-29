// Comparison table for every results file matching a filter, re-scored
// against the current gold (so James's review answers apply retroactively).
// Cost is shown two ways:
//   test: what the audit run actually cost (dense traffic, caches warm)
//   real: the same token usage re-weighted to Gremly's real traffic, where
//         the cacheable part of a prompt is only cached for the share of
//         drops that arrive within the provider's cache lifetime of the
//         previous drop (TRAFFIC_HIT_RATE), and misses pay full price (plus
//         any cache-write surcharge).
// Usage: node analyze.mjs <glob substring> [--csv]
import { RESULTS } from './paths.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { MODELS, TRAFFIC_HIT_RATE } from './models.mjs';
import { loadGold, scoreRows } from './score.mjs';

const DIR = RESULTS;
const filt = process.argv[2] || '';
const gold = loadGold();
const BY_MODEL_ID = Object.fromEntries(Object.values(MODELS).map((m) => [m.model, m]));

function realCallCost(spec, u) {
  if (!spec || !u) return 0;
  const p = spec.price;
  const h = TRAFFIC_HIT_RATE[spec.ttlKey] ?? TRAFFIC_HIT_RATE['5m'];
  const cacheable = (u.cachedInput || 0) + (u.cacheWrite || 0);
  const plain = Math.max(0, u.input - cacheable);
  const onHit = cacheable * p.cached;
  const onMiss = cacheable * (p.write || p.in);
  return (plain * p.in + h * onHit + (1 - h) * onMiss + u.output * p.out) / 1e6;
}

// Wilson 95% interval for a proportion
function wilson(k, n) {
  const z = 1.96, ph = k / n;
  const d = 1 + z * z / n;
  const c = (ph + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n))) / d;
  return [c - h, c + h];
}

const out = [];
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json') && /^v[23]_/.test(f) && f.includes(filt))) {
  const { summary, rows } = JSON.parse(readFileSync(DIR + f, 'utf8'));
  const s = scoreRows(rows, gold);
  let test = 0, real = 0;
  for (const r of rows) {
    if (r.calls) {
      for (const c of r.calls) { test += c.cost || 0; real += realCallCost(BY_MODEL_ID[c.model], c.usage); }
    } else {
      test += r.cost || 0;
      real += realCallCost(MODELS[summary.model], r.usage);
    }
  }
  const ok = Math.round(s.accuracy * s.n);
  const [lo, hi] = wilson(ok, s.n);
  out.push({
    run: f.replace(/\.json$/, ''),
    acc: s.accuracy, ci: `${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}`,
    strict: s.strict, silent_wrong: s.silent_wrong, needless_q: s.needless_question, asked: s.asked, failed: s.failed,
    p50: s.p50_ms, p90: s.p90_ms, p99: s.p99_ms,
    test_per_1k: +((test / s.n) * 1000).toFixed(3), real_per_1k: +((real / s.n) * 1000).toFixed(3),
  });
}
out.sort((a, b) => b.acc - a.acc);
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else console.table(out);
