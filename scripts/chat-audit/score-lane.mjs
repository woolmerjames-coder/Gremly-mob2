// Score run-lane.mjs runs: mode, depth and search against the audit's gold
// answers (gold.mjs), and the lane against the lane gold (two blind labellers,
// data/labels_lane_A.json and _B.json, with the adjudicator's decisions in
// data/adjudicated_lane.json where they split).
//
// Usage: node score-lane.mjs <set> <tag1> [tag2 ...]   (the first tag is the
// baseline for the paired tests)
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { RESULTS, DATA } from './paths.mjs';
import { turnGold } from './gold.mjs';

const [set, ...tags] = process.argv.slice(2);
if (!set || !tags.length) {
  console.error('Usage: node score-lane.mjs <set> <tag1> [tag2 ...]');
  process.exit(1);
}
const THREE = ['mode', 'depth', 'search'];
const LANES = ['quick', 'lookup', 'agent'];
const load = (f) => (existsSync(DATA + f) ? JSON.parse(readFileSync(DATA + f, 'utf8')) : []);

/** Lane gold: the best answer when the labellers agree, every answer both accept, and the adjudicator's call where they split. */
export function laneGold() {
  const A = Object.fromEntries(load('labels_lane_A.json').map((x) => [x.id, x]));
  const B = Object.fromEntries(load('labels_lane_B.json').map((x) => [x.id, x]));
  const J = Object.fromEntries(load('adjudicated_lane.json').map((x) => [x.id, x]));
  const gold = {};
  for (const id of Object.keys(A)) {
    if (!B[id]) continue;
    if (J[id]) {
      gold[id] = { primary: J[id].answer, ok: J[id].ok, by: 'adjudicator', unsure: !!J[id].unsure };
    } else {
      const ok = A[id].lane_ok.filter((v) => B[id].lane_ok.includes(v));
      gold[id] = { primary: A[id].lane === B[id].lane ? A[id].lane : null, ok, by: 'labellers' };
    }
  }
  return gold;
}

function runsFor(tag) {
  const files = readdirSync(RESULTS).filter((f) => f === `lane_${set}_${tag}.json` || f.startsWith(`lane_${set}_${tag}_`));
  if (!files.length) throw new Error(`no results for ${set} ${tag}`);
  const parts = files.map((f) => JSON.parse(readFileSync(RESULTS + f, 'utf8')));
  const rows = parts.flatMap((p) => p.rows);
  return { tag, modelKey: parts[0].modelKey, variant: parts[0].variant, rows };
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const q = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
};
function choose(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
function signTest(b, c) {
  const n = b + c;
  if (!n) return 1;
  const k = Math.min(b, c);
  let p = 0;
  for (let i = 0; i <= k; i++) p += choose(n, i);
  return Math.min(1, (2 * p) / 2 ** n);
}

const tg = turnGold();
const lg = laneGold();
const runs = tags.map(runsFor);
const summary = { set, runs: [] };
const okThree = {};
const okLane = {};

for (const run of runs) {
  const rows = run.rows;
  const withTurnGold = rows.filter((r) => tg[r.id]);
  const general = withTurnGold.filter((r) => r.type === 'general');
  const three = (subset) => {
    const acc = Object.fromEntries(THREE.map((f) => [f, 0]));
    let all = 0;
    for (const r of subset) {
      let ok = true;
      for (const f of THREE) {
        if (tg[r.id][f].both.includes(r[f])) acc[f]++;
        else ok = false;
      }
      if (ok) all++;
    }
    return { n: subset.length, all, ...acc };
  };
  okThree[run.tag] = Object.fromEntries(withTurnGold.map((r) => [r.id, THREE.every((f) => tg[r.id][f].both.includes(r[f]))]));

  const laned = rows.filter((r) => r.lane && lg[r.id]);
  const confusion = {};
  let laneRight = 0;
  for (const r of laned) {
    const g = lg[r.id];
    const right = g.ok.includes(r.lane);
    if (right) laneRight++;
    const k = `${g.primary || g.ok.join('/')} -> ${r.lane}`;
    if (!right) confusion[k] = (confusion[k] || 0) + 1;
  }
  okLane[run.tag] = Object.fromEntries(laned.map((r) => [r.id, lg[r.id].ok.includes(r.lane)]));
  const laneShare = Object.fromEntries(LANES.map((l) => [l, laned.filter((r) => r.lane === l).length]));
  const goldShare = Object.fromEntries(LANES.map((l) => [l, laned.filter((r) => lg[r.id].primary === l).length]));

  const ms = rows.map((r) => r.turn_ms);
  const cost = rows.reduce((s, r) => s + r.calls.reduce((a, c) => a + (c.cost || 0), 0), 0);
  const s = {
    tag: run.tag,
    model: run.modelKey,
    variant: run.variant,
    turns: rows.length,
    failed_calls: rows.filter((r) => r.calls.some((c) => !c.ok)).length,
    fell_back: rows.filter((r) => r.fell_back?.length).length,
    three_all: three(withTurnGold),
    three_general: three(general),
    lane: { n: laned.length, right: laneRight, share: laneShare, gold_share: goldShare, misses: confusion },
    p50_ms: q(ms, 0.5),
    p90_ms: q(ms, 0.9),
    usd_per_1000: rows.length ? (1000 * cost) / rows.length : 0,
  };
  summary.runs.push(s);
  console.log(`\n${run.tag} (${run.modelKey}, ${run.variant}): ${rows.length} turns, failed calls ${s.failed_calls}, fell back ${s.fell_back}, p50 ${s.p50_ms}ms, p90 ${s.p90_ms}ms, $${s.usd_per_1000.toFixed(2)} per 1,000 turns`);
  for (const [name, t] of [['all turns', s.three_all], ['Ask Gremly turns', s.three_general]]) {
    if (t.n) console.log(`  ${name} (${t.n}): mode, depth and search all right ${pct(t.all, t.n)} | mode ${pct(t.mode, t.n)} depth ${pct(t.depth, t.n)} search ${pct(t.search, t.n)}`);
  }
  if (laned.length) {
    console.log(`  lane (${laned.length}): right ${pct(laneRight, laned.length)} | said ${JSON.stringify(laneShare)} | gold ${JSON.stringify(goldShare)}`);
    const top = Object.entries(confusion).sort((a, b) => b[1] - a[1]);
    if (top.length) console.log(`  lane misses (gold -> said): ${top.map(([k, n]) => `${k} x${n}`).join(', ')}`);
  }
}

if (runs.length > 1) {
  const base = runs[0].tag;
  console.log(`\nPaired against ${base} (exact sign test):`);
  summary.paired = [];
  for (const run of runs.slice(1)) {
    const cmp = (a, b) => {
      let worse = 0;
      let better = 0;
      for (const id of Object.keys(a)) {
        if (!(id in b)) continue;
        if (a[id] && !b[id]) worse++;
        if (!a[id] && b[id]) better++;
      }
      return { better, worse, p: signTest(worse, better) };
    };
    const three = cmp(okThree[base], okThree[run.tag]);
    const lane = cmp(okLane[base] || {}, okLane[run.tag] || {});
    summary.paired.push({ tag: run.tag, three, lane });
    console.log(`  ${run.tag}: mode, depth and search better on ${three.better}, worse on ${three.worse}, p = ${three.p.toFixed(4)}${Object.keys(okLane[base] || {}).length ? ` | lane better on ${lane.better}, worse on ${lane.worse}, p = ${lane.p.toFixed(4)}` : ''}`);
  }
}
writeFileSync(`${RESULTS}lane_summary_${set}_${tags.join('+')}.json`, JSON.stringify(summary, null, 1));
