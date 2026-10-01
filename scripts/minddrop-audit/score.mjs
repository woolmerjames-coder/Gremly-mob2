// Gold labels and scoring for the audit.
import { readFileSync, existsSync } from 'node:fs';

import { DATA } from './paths.mjs';
const DIR = DATA;

// Final gold = both blind labellers' agreement, with James's answers
// overriding every drop he reviewed (review.json, when present).
export function loadGold() {
  const A = Object.fromEntries(JSON.parse(readFileSync(DIR + 'labels_A.json', 'utf8')).map((x) => [x.id, x]));
  const B = Object.fromEntries(JSON.parse(readFileSync(DIR + 'labels_B.json', 'utf8')).map((x) => [x.id, x]));
  const review = existsSync(DIR + 'review.json') ? JSON.parse(readFileSync(DIR + 'review.json', 'utf8')) : {};
  const gold = {};
  for (const id of Object.keys(A)) {
    const r = review[id];
    if (r && r.by !== 'labellers') {
      // James's pick is the best answer; anything he marked "also fine" is
      // accepted too. (Older answers used question_ok for "asking is fine".)
      const acceptable = new Set([r.label, ...(r.also || [])]);
      if (r.question_ok) acceptable.add('ambiguous');
      gold[id] = { primary: r.label, acceptable: [...acceptable], question_ok: acceptable.has('ambiguous'), source: 'james' };
    } else {
      const acceptable = [...new Set([...A[id].acceptable, ...B[id].acceptable])];
      gold[id] = {
        primary: A[id].primary === B[id].primary ? A[id].primary : A[id].primary,
        acceptable,
        question_ok: A[id].question_ok || B[id].question_ok,
        source: A[id].primary === B[id].primary ? 'agreed' : 'unresolved',
      };
    }
  }
  return gold;
}

export function labelOf(n) {
  if (!n) return 'FAIL';
  if (n.is_multi) return 'multi';
  if (n.is_ambiguous) return 'ambiguous';
  if (n.bucket === 'todo') return 'todo';
  if (n.bucket === 'habit') return `habit/${n.habitSubtype || 'start_habit'}`;
  return `log/${n.subtype || 'general'}`;
}

export function scoreRows(rows, gold) {
  const n = rows.length;
  let ok = 0, strict = 0, silentWrong = 0, needlessQ = 0, fail = 0, asked = 0;
  for (const r of rows) {
    const g = gold[r.id];
    if (r.label === 'FAIL') { fail++; continue; }
    if (g.acceptable.includes(r.label)) ok++;
    if (g.primary === r.label) strict++;
    if (r.label === 'ambiguous') { asked++; if (!g.acceptable.includes('ambiguous')) needlessQ++; }
    else if (!g.acceptable.includes(r.label)) silentWrong++;
  }
  const lat = rows.filter((r) => r.ms != null).map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : null;
  return {
    n,
    accuracy: +(ok / n).toFixed(3),
    strict: +(strict / n).toFixed(3),
    silent_wrong: silentWrong,
    needless_question: needlessQ,
    asked,
    failed: fail,
    p50_ms: q(0.5),
    p90_ms: q(0.9),
    p99_ms: q(0.99),
  };
}
