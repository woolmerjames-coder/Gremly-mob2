/**
 * The classifier replay (workers/inngest-jobs/worldsClassifier.ts, data
 * fabric stage 4b): the Sunday classifier run on a made up person, to show
 * what cutting it back changes before it ships. Its examples, its word lists
 * and closing come out of its prompt; it is run here on the same input before
 * and after, in two trees, and the two reports are read side by side.
 *
 *   scripts/classifier-replay/run.sh [--repeat n]
 *
 * The person is the filing replay's Alex (scripts/filing-replay/person.mjs):
 * four Worlds, three Chapters (one closed, one under way whose end date has
 * passed in this replay, so a run before the change may close it), one life
 * context and sixty drops in the last four weeks. Every name is made up.
 *
 * It reports, for each run, how many of each kind of output came back,
 * whether any Chapter update asked to close, which new Worlds and Chapters it
 * proposed, and any authored words with a dash. The writer is not run: what
 * it writes is the same in both trees except that a close is never applied.
 *
 * ANTHROPIC_API_KEY comes from the environment. Writes out/run-<time>.json and
 * out/report-<time>.md.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyWorldsWeekly } from '../../workers/inngest-jobs/worldsClassifier';
import { WORLDS, CHAPTERS, CONTEXTS, DROPS, TODAY } from '../filing-replay/person.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 2));
const tag = flag('--tag') || 'run';

const at = (date) => `${date}T09:00:00Z`;
const notes = DROPS.filter((d) => d.entity_type === 'note').map((d) => ({
  id: d.id,
  title: d.title,
  body: d.text,
  subtype: 'catchall',
  mood: null,
  tags: [],
  origin: 'minddrop',
  created_at: at(d.date),
  target_date: null,
  date: d.date,
  is_goal: false,
  archived: false,
}));
const todos = DROPS.filter((d) => d.entity_type === 'todo').map((d) => ({
  id: d.id,
  title: d.title,
  name: d.title,
  body: d.text,
  notes: null,
  subtype: null,
  tags: [],
  status: 'open',
  completed_at: null,
  archived: false,
  due_date: null,
  target_date: null,
  scheduled_date: null,
  created_at: at(d.date),
}));
const habits = DROPS.filter((d) => d.entity_type === 'habit').map((d) => ({
  id: d.id,
  name: d.title,
  title: d.title,
  notes: d.text,
  why_string: null,
  tags: [],
  frequency: 'weekly',
  cadence: 'weekly',
  target_per_period: 1,
  subtype: 'start_habit',
  archived: false,
  created_at: at(d.date),
}));

const windowEnd = TODAY;
const windowStart = '2026-09-09';
const bundle = {
  mode: 'backfill',
  userId: 'replay',
  collectedAt: at(TODAY),
  windowStart,
  windowEnd,
  journals: [],
  notes,
  todos,
  habits,
  habitProgress: [],
  chatSummaries: [],
  temporalAnchors: [],
  profileOverrides: [],
  ritualProgress: [],
  photoNotes: [],
  calendarSummary: { total_events: 0, span_days: 28, meetings_per_week: 0, top_titles: [], by_source: [] },
};

const worlds = WORLDS.map((w) => ({
  id: w.id,
  name: w.name,
  phase: 'active',
  description: w.description,
  archetypes: [],
  first_signal_at: at('2026-06-01'),
  last_signal_at: at('2026-10-06'),
  mascot_slug: null,
  mascot_slug_source: null,
  world_type: null,
  world_type_source: null,
}));
// the mocks' end date is set to have passed here, so a run that closes can
const chapters = CHAPTERS.map((c) => ({
  id: c.id,
  title: c.title,
  chapter_type: 'bounded',
  phase: c.phase,
  start_date: c.start_date,
  end_date: c.title === 'Year 11 mock exams' ? '2026-10-06' : c.end_date,
  primary_world_name: WORLDS.find((w) => w.id === c.primary_world_id)?.name || '',
  description: c.description,
  target_description: null,
  arc_shape: null,
  arc_shape_source: null,
}));
const contexts = CONTEXTS.map((x) => ({
  id: x.id,
  name: x.name,
  kind: 'obligation',
  description: x.description,
  start_date: null,
  end_date: null,
  active: true,
}));

const DASH = /[–—]|--/;
function authored(o) {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') {
      if (DASH.test(v)) out.push(`${path}: ${v}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(o, '');
  return out;
}

const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  WORLDS_CLASSIFIER_MODEL: process.env.WORLDS_CLASSIFIER_MODEL,
};
const runs = await Promise.all(
  Array.from({ length: repeat }, async (_, i) => {
    try {
      const o = await classifyWorldsWeekly(bundle, worlds, chapters, contexts, env);
      return {
        i,
        counts: Object.fromEntries(
          Object.entries(o)
            .filter(([, v]) => Array.isArray(v))
            .map(([k, v]) => [k, v.length]),
        ),
        closes: o.chapter_updates.filter((u) => u.close_chapter).map((u) => chapters.find((c) => c.id === u.chapter_id)?.title || u.chapter_id),
        new_worlds: o.new_world_candidates.map((w) => w.display_name || w.proposed_name),
        new_chapters: o.new_chapter_candidates.map((c) => c.title || c.proposed_title),
        mascots: o.velocity_updates.map((v) => `${worlds.find((w) => w.id === v.world_id)?.name}: ${v.new_mascot_slug}`),
        dashes: authored(o),
        tokens: o.run_metadata,
      };
    } catch (err) {
      return { i, error: String(err.message).slice(0, 400) };
    }
  }),
);

const L = [`# Classifier replay (${tag}), ${new Date().toISOString().slice(0, 16)}`, ''];
for (const r of runs) {
  if (r.error) {
    L.push(`- run ${r.i}: failed, ${r.error}`);
    continue;
  }
  L.push(
    `- run ${r.i}: ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `  - closes asked for: ${r.closes.join('; ') || 'none'}`,
    `  - new Worlds: ${r.new_worlds.join('; ') || 'none'}; new Chapters: ${r.new_chapters.join('; ') || 'none'}`,
    `  - Gremlys: ${r.mascots.join('; ') || 'none'}`,
    `  - authored words with a dash: ${r.dashes.length ? r.dashes.join(' | ') : 'none'}`,
    `  - tokens in ${r.tokens?.input_tokens}, out ${r.tokens?.output_tokens}`,
  );
}
mkdirSync(join(HERE, 'out'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
writeFileSync(join(HERE, 'out', `report-${tag}-${stamp}.md`), L.join('\n'));
writeFileSync(join(HERE, 'out', `run-${tag}-${stamp}.json`), JSON.stringify(runs, null, 2));
console.log(L.join('\n'));
