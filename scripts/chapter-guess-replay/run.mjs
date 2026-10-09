/**
 * Replay for Gremly's guesses when a Chapter is started by hand
 * (workers/cortex/context/chapterGuess.js, Worlds rebuild stage 3): each made
 * up line through the real guess with real models, Alex's Worlds and things
 * standing in for the database. Checked: the World (or a new one when none
 * fits), the days, and the things it says belong, none wrong.
 *
 *   node <bundle> [--only porto,half] [--repeat 3]
 *
 * Keys come from the environment (OPENAI_API_KEY, GEMINI_TEST_API_KEY).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configureModels } from '../../workers/cortex/models.js';
import { guessChapter, GUESS_VERSION } from '../../workers/cortex/context/chapterGuess.js';
import { CHAPTERS, ITEMS, SCENARIOS, TODAY, WORLDS } from './scenarios.mjs';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const only = flag('--only');
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const USER = '00000000-0000-4000-8000-0000000000aa';

configureModels({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  HELPER_MODEL: 'gpt-6-luna',
});

/** Short ids as uuids, and back. */
const to = new Map();
[...WORLDS, ...CHAPTERS, ...ITEMS].forEach((x, i) => to.set(x.id, `00000000-0000-4000-9000-${String(i + 1).padStart(12, '0')}`));
const back = new Map([...to].map(([a, b]) => [b, a]));

function fakeDb() {
  const T = (x) => ({ ...x, id: to.get(x.id) });
  return {
    select: async (path) => {
      const [table] = path.split('?');
      if (table === 'worlds') return WORLDS.map((w) => T({ phase: 'active', display_name: null, ...w }));
      if (table === 'chapters') return CHAPTERS.map((c) => T({ ...c, primary_world_id: to.get(c.primary_world_id) }));
      if (table === 'todos') return ITEMS.filter((i) => i.type === 'todo').map((i) => T({ id: i.id, name: i.title, due_day: i.due || null }));
      if (table === 'notes') return ITEMS.filter((i) => i.type === 'note' || i.type === 'idea').map((i) => T({ id: i.id, title: i.title, subtype: i.type === 'idea' ? 'idea' : 'general' }));
      if (table === 'habits') return ITEMS.filter((i) => i.type === 'habit').map((i) => T({ id: i.id, name: i.title }));
      if (table === 'drop_chapter_links')
        return ITEMS.filter((i) => i.chapter).map((i) => ({ drop_id: to.get(i.id), chapter_id: to.get(i.chapter) }));
      return [];
    },
  };
}

function check(s, g) {
  const out = [];
  const add = (name, ok, detail = '') => out.push({ name, ok: !!ok, detail });
  add('A guess', g.guessed, JSON.stringify(g));
  if (!g.guessed) return out;
  const world = g.world_id ? back.get(g.world_id) : g.new_world ? 'new' : null;
  if (s.newWorld) add('A new World, since none fits', world === 'new', JSON.stringify(g.new_world));
  else add('Its World', [].concat(s.world).includes(world), world);
  add('Its start', s.dates[0].includes(g.start_date), g.start_date);
  add('Its end', s.dates[1].includes(g.end_date), g.end_date);
  const got = g.items.map((i) => back.get(i.id));
  add('The things that belong', s.items.every((x) => got.includes(x)), got.join(','));
  add('Nothing that does not', got.every((x) => s.items.includes(x) || s.mayHave.includes(x)), got.join(','));
  add('A name', !!g.title && !/\d{1,2} (oct|nov|dec)/i.test(g.title), g.title);
  add('No dashes', !/\s[-–—]\s|—/.test(g.title + ' ' + (g.new_world?.name || '')), g.title);
  return out;
}

const env = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY };
const list = SCENARIOS.filter((s) => !only || only.split(',').includes(s.id));
const results = [];
for (const s of list) {
  for (let r = 0; r < repeat; r++) {
    const t0 = Date.now();
    const g = await guessChapter(env, USER, { line: s.line, today: TODAY }, { db: fakeDb(), waitMs: 20000 });
    const checks = check(s, g);
    const fails = checks.filter((c) => !c.ok);
    const ms = Date.now() - t0;
    results.push({ id: s.id, ms, guess: g, checks });
    console.log(`${fails.length ? 'FAIL ' : 'ok   '} ${s.id} · ${ms}ms${fails.length ? ` · ${fails.map((f) => `${f.name} (${f.detail})`).join('; ')}` : ''}`);
    console.log(`      ${JSON.stringify({ title: g.title, world: g.world_id ? back.get(g.world_id) : g.new_world, start: g.start_date, end: g.end_date, gremly: g.gremly, items: (g.items || []).map((i) => back.get(i.id)) })}`);
  }
}
const pass = results.filter((r) => r.checks.every((c) => c.ok)).length;
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
console.log(`\n${pass} of ${results.length} pass every check · median ${ms[Math.floor(ms.length / 2)]}ms · slowest ${ms.at(-1)}ms · ${GUESS_VERSION}`);
const outDir = join(process.cwd(), 'out');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `guess-${Date.now()}.json`), JSON.stringify({ version: GUESS_VERSION, results }, null, 2));
