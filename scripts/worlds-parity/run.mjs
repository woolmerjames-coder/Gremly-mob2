/**
 * The classifier's parity replay (data fabric stage 5): what the Sunday
 * classifier still proposes, against what the new path proposes from the same
 * records, for the filing replay's made up Alex (scripts/filing-replay). If
 * the new path catches as much, the classifier leaves the weekly pipe.
 *
 *   scripts/worlds-parity/run.sh classifier [--repeat n] [--label x]   Claude Sonnet 4.6
 *   scripts/worlds-parity/run.sh newpath [--repeat n] [--label x]      the Chapter questions' model
 *   scripts/worlds-parity/run.sh compare --label x
 *
 * The classifier left the weekly pipe on 18 Oct (WEEKLY_CLASSIFIER off), and
 * the Chapter suggestion compared here moved to the weekly pass; this replay is
 * kept as the record of the call.
 *
 * Since stage 4b the classifier writes no words, closes nothing, and its new
 * Worlds and Chapters are only suggestions. What is left to compare:
 *   - Chapters forming: the classifier's new Chapter candidates, against the
 *     Chapter suggestion of the new path (context/chapterQuestions.js), which
 *     asks about one at a time from the drops filed in no Chapter. Both are
 *     scored by the drops they rest on, against the labellers' drops that
 *     start something (filing-replay/data/gold.json).
 *   - Chapters past their dates: the classifier may no longer close one; the
 *     new path asks about each.
 *   - New Worlds: the new path proposes none by design (a World is made by a
 *     tap, or once as first Worlds), so whatever the classifier proposes here
 *     is listed for James to see what would no longer be suggested.
 *   - Filing is the filing replay's own (159 of 160 World filings right).
 *
 * Keys come from .audit-keys.local or the environment. Output goes to
 * scripts/worlds-parity/out/<label>/ (gitignored); every name is made up.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { classifyWorldsWeekly } from '../../workers/inngest-jobs/worldsClassifier';
import { askClose, closeCandidates } from '../../workers/inngest-jobs/context/chapterQuestions.js';
import { WORLDS, CHAPTERS, CONTEXTS, DROPS, TODAY, PERSON } from '../filing-replay/person.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const step = args[0];
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const dir = join(HERE, 'out', flag('--label') || 'run');
mkdirSync(dir, { recursive: true });
const gold = JSON.parse(readFileSync(join(HERE, '../filing-replay/data/gold.json'), 'utf8')).labels;
const goldOf = new Map(gold.map((g) => [g.id, g]));
const starts = new Set(gold.filter((g) => g.starts_something).map((g) => g.id));
const at = (date) => `${date}T09:00:00Z`;
const daysBefore = (n) => new Date(Date.parse(`${TODAY}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

// the end date of the mocks has passed in this replay, as in the classifier replay
const chapters = CHAPTERS.map((c) => ({
  ...c,
  phase: c.phase,
  end_date: c.title === 'Year 11 mock exams' ? '2026-10-06' : c.end_date,
}));

async function runClassifier() {
  if (!keys.anthropic) throw new Error('the classifier needs Anthropic');
  const notes = DROPS.filter((d) => d.entity_type === 'note').map((d) => ({ id: d.id, title: d.title, body: d.text, subtype: 'catchall', mood: null, tags: [], origin: 'minddrop', created_at: at(d.date), target_date: null, date: d.date, is_goal: false, archived: false }));
  const todos = DROPS.filter((d) => d.entity_type === 'todo').map((d) => ({ id: d.id, title: d.title, name: d.title, body: d.text, notes: null, subtype: null, tags: [], status: 'open', completed_at: null, archived: false, due_date: null, target_date: null, scheduled_date: null, created_at: at(d.date) }));
  const habits = DROPS.filter((d) => d.entity_type === 'habit').map((d) => ({ id: d.id, name: d.title, title: d.title, notes: d.text, why_string: null, tags: [], frequency: 'weekly', cadence: 'weekly', target_per_period: 1, subtype: 'start_habit', archived: false, created_at: at(d.date) }));
  const bundle = { mode: 'backfill', userId: 'replay', collectedAt: at(TODAY), windowStart: '2026-09-09', windowEnd: TODAY, journals: [], notes, todos, habits, habitProgress: [], chatSummaries: [], temporalAnchors: [], profileOverrides: [], ritualProgress: [], photoNotes: [], calendarSummary: { total_events: 0, span_days: 28, meetings_per_week: 0, top_titles: [], by_source: [] } };
  const worlds = WORLDS.map((w) => ({ id: w.id, name: w.name, phase: 'active', description: w.description, archetypes: [], first_signal_at: at('2026-06-01'), last_signal_at: at('2026-10-06'), mascot_slug: null, mascot_slug_source: null, world_type: null, world_type_source: null }));
  const chs = chapters.map((c) => ({ id: c.id, title: c.title, chapter_type: 'bounded', phase: c.phase, start_date: c.start_date, end_date: c.end_date, primary_world_name: WORLDS.find((w) => w.id === c.primary_world_id)?.name || '', description: c.description, target_description: null, arc_shape: null, arc_shape_source: null }));
  const contexts = CONTEXTS.map((x) => ({ id: x.id, name: x.name, kind: 'obligation', description: x.description, start_date: null, end_date: null, active: true }));
  const env = { ANTHROPIC_API_KEY: keys.anthropic };
  const runs = [];
  for (let i = 1; i <= repeat; i++) {
    try {
      const o = await classifyWorldsWeekly(bundle, worlds, chs, contexts, env);
      runs.push({
        i,
        new_chapters: o.new_chapter_candidates.map((c) => ({ title: c.proposed_title || c.title, drops: [...new Set((c.evidence || []).map((e) => e.drop_id).filter(Boolean))] })),
        new_worlds: o.new_world_candidates.map((w) => ({ name: w.display_name || w.proposed_name, drops: [...new Set((w.evidence || []).map((e) => e.drop_id).filter(Boolean))] })),
        closes: o.chapter_updates.filter((u) => u.close_chapter).map((u) => chs.find((c) => c.id === u.chapter_id)?.title || u.chapter_id),
        tokens: o.run_metadata,
      });
    } catch (err) {
      runs.push({ i, error: String(err?.message || err).slice(0, 400) });
    }
  }
  writeFileSync(join(dir, 'classifier.json'), JSON.stringify(runs, null, 2));
  console.log(JSON.stringify(runs, null, 2));
}

async function runNewPath() {
  if (!keys.openai) throw new Error('the new path needs OpenAI');
  const env = { OPENAI_API_KEY: keys.openai, GEMINI_API_KEY: keys.gemini, GOOGLE_API_KEY: keys.gemini };
  // the drops filed in no Chapter in the last three weeks, as the labellers filed them
  const since = daysBefore(21);
  const drops = DROPS.filter((d) => d.date >= since && !goldOf.get(d.id)?.chapter).map((d) => ({
    type: d.entity_type,
    id: d.id,
    title: d.title,
    body: d.text,
    subtype: null,
    date: d.date,
    created_at: at(d.date),
    done: null,
    private: false,
    health: false,
  }));
  const worlds = WORLDS.map((w) => ({ id: w.id, name: w.name }));
  const passed = closeCandidates({ chapters, today: TODAY });
  const runs = [];
  for (let i = 1; i <= repeat; i++) {
    const r = { i };
    // a Chapter forming is offered by the weekly pass since 18 Oct, with the
    // whole of their week; its replay is scripts/weekly-replay (the forming weeks)
    r.suggestion = { moved: 'the weekly pass' };
    try {
      const records = new Map(passed.map((c) => [c.id, { items: DROPS.filter((d) => goldOf.get(d.id)?.chapter === c.title).map((d) => ({ type: d.entity_type, id: d.id, title: d.title, body: d.text, date: d.date })), facts: [] }]));
      const c = passed.length ? await askClose(env, { chapters: passed, records, worlds, person: PERSON, today: TODAY, userId: 'u', runId: `r${i}` }) : null;
      r.closes = (c?.output?.questions || []).map((q) => ({ guess: q.guess, question: q.question }));
    } catch (err) {
      r.closes = { error: String(err?.message || err).slice(0, 300) };
    }
    runs.push(r);
  }
  writeFileSync(join(dir, 'newpath.json'), JSON.stringify({ unfiled: drops.length, passed: passed.map((c) => c.title), runs }, null, 2));
  console.log(JSON.stringify(runs, null, 2));
}

function compare() {
  const cl = existsSync(join(dir, 'classifier.json')) ? JSON.parse(readFileSync(join(dir, 'classifier.json'), 'utf8')) : [];
  const np = existsSync(join(dir, 'newpath.json')) ? JSON.parse(readFileSync(join(dir, 'newpath.json'), 'utf8')) : { runs: [] };
  const real = (ids) => ids.filter((id) => starts.has(id));
  const L = ['# Classifier parity replay, Alex', '', `Drops that start something, by the labellers: ${[...starts].map((id) => `${id} (${goldOf.get(id).note})`).join('; ')}`, ''];
  L.push('## The classifier (Sonnet 4.6)', '');
  for (const r of cl) {
    if (r.error) {
      L.push(`- run ${r.i}: ERROR ${r.error}`);
      continue;
    }
    L.push(`- run ${r.i}: closes asked for ${r.closes.length}; tokens in ${r.tokens?.input_tokens}, out ${r.tokens?.output_tokens}`);
    for (const c of r.new_chapters) L.push(`    new Chapter: ${c.title} | rests on ${c.drops.join(' ') || 'no drops named'} | of them starting something: ${real(c.drops).join(' ') || 'none'}`);
    for (const w of r.new_worlds) L.push(`    new World: ${w.name} | rests on ${w.drops.join(' ') || 'no drops named'}`);
  }
  L.push('', '## The new path (Chapter questions)', '', `${np.unfiled ?? '?'} drops filed in no Chapter in the last three weeks; Chapters past their dates: ${(np.passed || []).join('; ') || 'none'}`, '');
  for (const r of np.runs) {
    const s = r.suggestion || {};
    L.push(`- run ${r.i}: ${s.title ? `suggests ${s.title} in ${s.world} | rests on ${s.drops.join(' ')} | of them starting something: ${real(s.drops).join(' ') || 'none'}` : `no suggestion (${s.none || s.error})`}`);
    for (const c of Array.isArray(r.closes) ? r.closes : []) L.push(`    asks about a Chapter past its dates: guess ${c.guess} | ${c.question}`);
    if (r.closes?.error) L.push(`    close: ERROR ${r.closes.error}`);
  }
  writeFileSync(join(dir, 'report.md'), L.join('\n'));
  console.log(L.join('\n'));
}

const STEPS = { classifier: runClassifier, newpath: runNewPath, compare };
if (!STEPS[step]) throw new Error(`step is one of ${Object.keys(STEPS).join(', ')}`);
await STEPS[step]();
