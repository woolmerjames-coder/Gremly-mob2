// Tables for the multi and question part tests (design set).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { loadGold2, scoreRows2 } from './score2.mjs';

const R2 = new URL('./results/', import.meta.url).pathname;
const gold = loadGold2('design');
const load = (f) => JSON.parse(readFileSync(R2 + f, 'utf8')).rows;
const inline = readdirSync(R2).filter((f) => f.endsWith('_design_r1.json') && /^(single_v35|checklist)__/.test(f));

for (const mode of ['multi', 'question']) {
  const parts = readdirSync(R2).filter((f) => f.startsWith(`part_${mode}_`));
  if (!parts.length) continue;
  const ids = new Set(load(parts[0]).map((r) => r.id));
  console.log(`\n== ${mode}: ${ids.size} drops (${mode === 'multi' ? 'multi in gold or split by any run' : 'asking acceptable in gold or asked by any run'})`);
  const rowsOf = (rows) => rows.filter((r) => ids.has(r.id));
  const show = (name, rows) => {
    const s = scoreRows2(rows, gold);
    const m = s.multi, q = s.questions;
    if (mode === 'multi') console.log(name.padEnd(46), `accuracy ${s.accuracy.toFixed(3)} | multi found ${m.detected}/${m.gold}, pieces right ${m.pieces_right}/${m.pieces}, fully right ${m.fully_right}, false multi ${m.false_multi}`);
    else console.log(name.padEnd(46), `accuracy ${s.accuracy.toFixed(3)} | asked ${s.asked}, needless ${s.needless_question}, answers cover intent ${q.answers_cover_intent}/${q.justified_with_alternatives}, needless but right answer offered ${q.needless_but_right_answer_offered}`);
  };
  for (const f of inline) show(`inline ${f.replace('_design_r1.json', '')}`, rowsOf(load(f)));
  for (const f of parts) {
    const rows = load(f);
    show(`specialist ${f.replace(`part_${mode}_`, '').replace('_p1.json', '')}`, rows);
    if (mode === 'multi') {
      const alone = rows.map((r) => (r.alone ? { ...r, segments: r.alone } : r));
      show(`  pieces alone after ${f.replace(`part_${mode}_`, '').replace('_p1.json', '')} split`, alone);
    }
  }
}
