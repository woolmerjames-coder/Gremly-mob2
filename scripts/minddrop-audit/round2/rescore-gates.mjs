// Recompute the gated label of saved checklist runs with the current gate
// rules (no new model calls), then score.
import { readFileSync } from 'node:fs';
import { gateLabel } from './classifyV4.mjs';
import { loadGold2, scoreRows2 } from './score2.mjs';
const [file, split = 'design'] = process.argv.slice(2);
const { rows } = JSON.parse(readFileSync(new URL(`./results/${file}.json`, import.meta.url), 'utf8'));
const gold = loadGold2(split);
const re = rows.map((r) => { if (r.label === 'FAIL') return r; const g = gateLabel(r.pre_gate_label, r.facts || {}); return { ...r, label: g.label, ambiguity_type: g.type || (g.label === 'ambiguous' ? r.ambiguity_type : r.ambiguity_type), gate: g.gate }; });
const a = scoreRows2(rows, gold, { labelKey: 'pre_gate_label' }), b = scoreRows2(re, gold);
console.log(file, 'no gates', a.accuracy, 'silent', a.silent_wrong, 'needless', a.needless_question, '| gates v2', b.accuracy, 'silent', b.silent_wrong, 'needless', b.needless_question, 'changed', re.filter((r) => r.gate).length);
