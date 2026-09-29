// Habit gate check: false habits (said habit, gold says not) and missed
// habits (gold habit, model said something else), per run. Dev only.
import { RESULTS } from './paths.mjs';
import { readFileSync } from 'node:fs';
import { loadGold } from './score.mjs';
const DIR = RESULTS;
const gold = loadGold();
for (const f of process.argv.slice(2)) {
  const rows = JSON.parse(readFileSync(`${DIR}${f}.json`, 'utf8')).rows;
  let falseH = 0, missedH = 0, goldH = 0, saidH = 0;
  for (const r of rows) {
    const g = gold[r.id];
    const gh = g.acceptable.some((l) => l.startsWith('habit'));
    const sh = r.label.startsWith('habit');
    if (gh) goldH++;
    if (sh) saidH++;
    if (sh && !g.acceptable.includes(r.label)) falseH++;
    if (gh && !g.acceptable.includes(r.label)) missedH++;
  }
  console.log(f.padEnd(40), { goldH, saidH, falseH, missedH });
}
