// Dev error matrix: for each dev drop that at least MIN of the given runs got
// wrong, show the gold answer and every model's answer. Dev split only; the
// holdout is never inspected for prompt work.
import { RESULTS } from './paths.mjs';
import { readFileSync } from 'node:fs';
import { loadGold } from './score.mjs';
const DIR = RESULTS;
const [tag, min = '2', ...models] = process.argv.slice(2);
const gold = loadGold();
const runs = models.map((m) => [m, Object.fromEntries(JSON.parse(readFileSync(`${DIR}v3_${m}_dev_${tag}.json`, 'utf8')).rows.map((r) => [r.id, r]))]);
const ids = Object.keys(runs[0][1]).sort();
const short = (l) => (l || '').replace('habit/', '').replace('log/', '').replace('ambiguous', 'ASK').replace('start_habit', 'habit+').replace('break_habit', 'habit-');
let n = 0;
for (const id of ids) {
  const g = gold[id];
  const wrong = runs.filter(([, r]) => r[id] && !g.acceptable.includes(r[id].label));
  if (wrong.length < Number(min)) continue;
  n++;
  const raw = runs[0][1][id].raw.replace(/\s+/g, ' ').slice(0, 110);
  console.log(`${id} [gold ${short(g.primary)}; ok: ${g.acceptable.map(short).join(',')}; ${g.source}] ${JSON.stringify(raw)}`);
  console.log('   ' + runs.map(([m, r]) => `${m.replace(/gemini-|gpt-|claude-/g, '')}=${g.acceptable.includes(r[id].label) ? 'ok' : short(r[id].label)}`).join('  '));
}
console.log(n, 'drops');
