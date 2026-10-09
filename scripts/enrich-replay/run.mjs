/**
 * Mind Drop's enrichment, replayed (18 Oct): the rules enrich-phase2 gives
 * the model (workers/cortex/enrichRules.js) for how long a todo takes and who
 * an item mentions, each beside the rules it replaced when given, on made up
 * items, called as enrich-phase2 calls them (aiClassify on the mini tier,
 * HELPER_MODEL gpt-6-luna as cortex's wrangler.toml sets it).
 *
 *   scripts/enrich-replay/run.sh time   [--old <file with the old rules>] [--repeat n]
 *   scripts/enrich-replay/run.sh people [--old <file with the old rules>] [--repeat n]
 *
 * Each time task carries the span a careful person would accept, and each
 * item the people it mentions. Every item is made up. OPENAI_API_KEY comes
 * from the environment.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIME_ESTIMATE_RULES, PEOPLE_RULES } from '../../workers/cortex/enrichRules.js';
import { aiClassify, getProviders } from '../../workers/cortex/aiProvider.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const part = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 1));
const MODEL = flag('--model') || 'gpt-6-luna';
const oldRules = flag('--old') ? readFileSync(flag('--old'), 'utf8').trim() : null;
if (!['time', 'people'].includes(part)) {
  console.error('which part: time or people');
  process.exit(1);
}

// [text, bucket, subtype, lowest right, highest right]; null and null: only null is right
const TIME = [
  ['Text Sam the address', 'todo', null, 5, 10],
  ['Pay the water bill online', 'todo', null, 5, 15],
  ['Order printer ink', 'todo', null, 5, 15],
  ['Book a table for Friday', 'todo', null, 5, 15],
  ['Water the plants', 'todo', null, 5, 20],
  ['Email the landlord about the boiler', 'todo', null, 5, 20],
  ['Write a thank you card for Ines', 'todo', null, 10, 25],
  ['Call the bank about my card', 'todo', null, 20, 45],
  ['Phone Gran', 'todo', null, 20, 60],
  ['Plan next week’s meals', 'todo', null, 20, 60],
  ['Fill in the passport form', 'todo', null, 20, 60],
  ['Fix the wobbly shelf', 'todo', null, 20, 60],
  ['Back up the laptop', 'todo', null, 15, 60],
  ['30 minute run', 'todo', null, 30, 30],
  ['Walk the dog', 'todo', null, 30, 60],
  ['Read chapter 4 for book club', 'todo', null, 30, 60],
  ['Pick up a parcel from the post office', 'todo', null, 30, 60],
  ['Return the jacket to the shop', 'todo', null, 30, 75],
  ['Drop the car at the garage', 'todo', null, 30, 75],
  ['Practise guitar for an hour', 'todo', null, 60, 60],
  ['Coffee with Priya', 'todo', null, 45, 120],
  ['Team meeting about the launch', 'todo', null, 30, 90],
  ['Buy groceries for the week', 'todo', null, 45, 90],
  ['Haircut', 'todo', null, 45, 90],
  ['Vet appointment for the cat', 'todo', null, 60, 120],
  ['Dentist appointment', 'todo', null, 60, 120],
  ['Write the quarterly report', 'todo', null, 60, 180],
  ['Prepare slides for Monday’s pitch', 'todo', null, 60, 180],
  ['Clear out the garage', 'todo', null, 90, 240],
  ['Stretch for ten minutes every morning', 'habit', 'start_habit', 10, 15],
  ['Stop snacking after dinner', 'habit', 'break_habit', null, null],
  ['Stop checking my phone in bed', 'habit', 'break_habit', null, null],
];

// [text, bucket, the people it mentions (or a list of right answers), compared without case]
const PEOPLE = [
  ['Theo’s birthday on Saturday, get a card', 'todo', ['Theo']],
  ['Call mum about Sunday lunch', 'todo', ['mum']],
  ['Lunch with Priya and Sam', 'todo', ['Priya', 'Sam']],
  ['Ask my boss about the deadline', 'todo', ['boss']],
  ['Book Dr. Patel for a check up', 'todo', ['Dr. Patel']],
  ['Try the bakery Ines recommended', 'todo', ['Ines']],
  ['Dad’s anniversary dinner on the 12th', 'todo', ['dad']],
  ['Help my sister move flats', 'todo', ['sister']],
  // someone named only as another's: either way of naming them is right
  ['Text Mira and her husband about dinner', 'todo', [['Mira', 'husband'], ['Mira', 'her husband']]],
  ['Grandma’s 90th on 4 May', 'note', ['grandma']],
  ['Return Noor’s book', 'todo', ['Noor']],
  ['Coffee with Kit, then the gym', 'todo', ['Kit']],
  ['Buy milk and bread', 'todo', []],
  ['Finish the report for the board', 'todo', []],
  ['Water the plants', 'todo', []],
  ['Felt calm after the long walk today', 'note', []],
];

function prompt(rules, bucket, subtype, out) {
  return `You extract core, durable metadata for Gremly, a calm productivity app.

Bucket: "${bucket}"${subtype ? ` (Subtype: "${subtype}")` : ''}

=== EXTRACTION RULES ===
If unsure, return null.
Do NOT invent or over-infer.

${rules}

=== OUTPUT ===
Return ONLY valid JSON: ${out}`;
}

// as enrich-phase2 calls it: the mini tier, HELPER_MODEL first (cortex's wrangler.toml)
const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  HELPER_MODEL: MODEL,
};
async function ask(system, text) {
  const r = await aiClassify({ mode: 'realtime', ...getProviders('mini', env), env, systemPrompt: system, messages: [{ role: 'user', content: text }], temperature: 0.2, maxOutputTokens: 300, endpoint: 'replay' });
  return r.parsed ?? 'unreadable';
}

const sides = [['new', part === 'time' ? TIME_ESTIMATE_RULES : PEOPLE_RULES], ...(oldRules ? [['old', oldRules]] : [])];
const same = (a, b) => {
  const norm = (x) => [...new Set((Array.isArray(x) ? x : []).map((s) => String(s).trim().toLowerCase()))].sort();
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};
const results = [];
const items = part === 'time' ? TIME : PEOPLE;
for (const item of items)
  for (let r = 0; r < repeat; r += 1) {
    const row = { text: item[0] };
    const got = await Promise.all(
      sides.map(([, rules]) =>
        part === 'time'
          ? ask(prompt(rules, item[1], item[2], '{ "time_estimate_minutes": number | null }'), item[0]).then((o) => {
              const v = o?.time_estimate_minutes;
              return v == null ? null : Number(v);
            })
          : ask(prompt(rules, item[1], null, '{ "people": ["name1", "name2"] | [] }'), item[0]).then((o) => o?.people ?? null),
      ),
    );
    sides.forEach(([name], i) => {
      row[name] = got[i];
      row[`${name}_right`] =
        part === 'time'
          ? item[3] == null
            ? got[i] === null
            : typeof got[i] === 'number' && got[i] >= item[3] && got[i] <= item[4] && got[i] % 5 === 0
          : (Array.isArray(item[2][0]) ? item[2] : [item[2]]).some((want) => same(got[i], want));
    });
    results.push(row);
    const want = part === 'time' ? `${item[3] ?? 'null'} to ${item[4] ?? 'null'}` : JSON.stringify(item[2]);
    console.log(`${sides.map(([n]) => `${n} ${JSON.stringify(row[n])}${row[`${n}_right`] ? ' ok' : ' off'}`).join(' | ')} | want ${want} | ${item[0]}`);
  }

const lines = sides.map(([name]) => `${name}: ${results.filter((x) => x[`${name}_right`]).length} of ${results.length} right`);
if (oldRules && part === 'time') {
  const both = results.filter((x) => typeof x.new === 'number' && typeof x.old === 'number');
  const gap = both.reduce((s, x) => s + Math.abs(x.new - x.old), 0) / Math.max(1, both.length);
  lines.push(`new and old a typical ${gap.toFixed(1)} minutes apart over ${both.length} estimates both gave`);
}
console.log(`\n${lines.join('\n')}`);
const out = join(HERE, 'out');
mkdirSync(out, { recursive: true });
const file = join(out, `${part}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ part, model: MODEL, repeat, results, summary: lines }, null, 2));
console.log(`Results: ${file}`);
