/**
 * The plan picker over the corpus days: what it picks for each day's offer,
 * where the slot fitter puts it, and whether the plan keeps the rules
 * (only candidates, at least half the free time left, no times or dashes in
 * Gremly's line). Run with: scripts/brief-corpus/run.sh plans [--real] [--models gemini,openai]
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keys } from '../chat-audit/keys.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { buildSnapshot } from './build.mjs';
import { readRequest, runPlanPick } from '../../workers/inngest-jobs/brief/planPick.js';
import { fitSlots, freeMinutes } from '../../lib/plan/slotFitter.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const MODELS = { openai: 'openai:gpt-6-luna', gemini: 'google:gemini-3.8-flash' };
const models = (flag('--models') || 'openai,gemini').split(',').filter((m) => MODELS[m]);

let scenarios = [...SCENARIOS];
if (args.includes('--real')) {
  const dir = join(HERE, 'real');
  if (existsSync(dir))
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')))
      for (const s of [].concat(JSON.parse(readFileSync(join(dir, f), 'utf8')))) scenarios.push({ ...s, real: true });
}

function poolOf(g) {
  const claimWhy = new Map(g.claims.map((c) => [c.title, c.why]));
  return [
    ...g.todosDue.map((t) => ({ id: t.id, kind: 'todo', title: t.title, minutes: null, why: claimWhy.get(t.title) || 'Due today', window: null })),
    ...g.habitsForToday.map((h) => ({
      id: h.id,
      kind: 'habit',
      title: h.title,
      minutes: h.minutes,
      why: h.target ? `${h.done} of ${h.target} this week${h.behind ? ', behind' : ''}` : 'Every day',
      window: null,
    })),
    ...(g.reach ? [{ id: g.reach.id, kind: 'reach', title: g.reach.title, minutes: null, why: g.reach.why, window: null }] : []),
  ];
}

// --asked: Gremly asked what has to happen or comes first, and this was the answer;
// what it names must be picked (want), or nothing in particular (want null)
const ASKED = {
  'busy-morning': { text: 'I really need to book the Denver flights today', want: 'Book flights for Denver' },
  'light-day': { text: 'Returning the library books has to happen today', want: 'Return the library books' },
  'evening-open': { text: 'I want to get a run in tonight', want: 'Run' },
  'noon-open': { text: 'Nothing in particular, keep it light', want: null },
};
const askedOnly = args.includes('--asked');

const results = [];
for (const s of scenarios) {
  const { g, offer } = buildSnapshot(s);
  if (!offer.plan) continue;
  const asked = askedOnly ? ASKED[s.id] : null;
  if (askedOnly && !asked) continue;
  const body = {
    mode: 'pick',
    now: g.now,
    gap_from: offer.plan.gapFrom,
    pool: poolOf(g),
    meetings: g.meetings.map((m) => ({ title: m.title, start: m.start, end: m.end })),
    ...(asked ? { asked: asked.text } : {}),
  };
  const req = readRequest(body);
  const ctx = {
    person: g.person,
    dayShape: g.dayShape,
    claims: g.claims,
    reach: g.reach,
    reaction: g.reaction,
  };
  for (const m of models) {
    const env = {
      GEMINI_API_KEY: keys.gemini,
      OPENAI_API_KEY: keys.openai,
      CONTEXT_MODEL_PLANPICK: MODELS[m],
      CONTEXT_MODEL_PLANPICKFALLBACK: m === 'openai' ? MODELS.gemini : MODELS.openai,
    };
    try {
      const out = await runPlanPick(env, req, ctx);
      const byId = new Map(req.pool.map((p) => [p.id, p]));
      const fit = fitSlots(
        out.picks.map((p) => ({ id: p.id, minutes: p.minutes, window: p.window })),
        g.meetings,
        req.from,
      );
      const freeBefore = freeMinutes(g.meetings, [], req.from, 1320);
      const freeAfter = freeMinutes(g.meetings, fit.placed, req.from, 1320);
      const checks = {
        onlyCandidates: out.dropped === 0,
        halfFree: freeAfter >= freeBefore / 2,
        noTimesInIntro: !/\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i.test(out.intro || ''),
        noShould: !/\bshould\b/i.test(out.intro || ''),
        everythingFits: fit.unplaced.length === 0,
        ...(asked?.want
          ? { pickedWhatTheySaid: out.picks.some((p) => byId.get(p.id)?.title === asked.want) }
          : {}),
      };
      const ok = Object.values(checks).every(Boolean);
      console.log(`${ok ? 'ok   ' : 'LOOK '} ${s.id} · ${out.model}`);
      results.push({
        id: s.id,
        model: out.model,
        intro: out.intro,
        picks: out.picks.map((p) => ({ ...p, title: byId.get(p.id)?.title })),
        placed: fit.placed.map((p) => ({ ...p, title: byId.get(p.id)?.title })),
        unplaced: fit.unplaced,
        free: { before: freeBefore, after: freeAfter },
        checks,
      });
    } catch (err) {
      console.log(`ERROR ${s.id} · ${m} · ${String(err?.message || err).slice(0, 160)}`);
      results.push({ id: s.id, model: m, error: String(err?.message || err) });
    }
  }
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(HERE, 'out', `plans-${stamp}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'plans.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.filter((r) => !r.error && Object.values(r.checks).every(Boolean)).length} of ${results.length} plans keep every rule.`);
console.log(`Results: ${join(outDir, 'plans.json')}`);
