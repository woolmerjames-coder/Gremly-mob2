/**
 * The first Worlds replay (workers/inngest-jobs/context/firstWorlds.js, data
 * fabric stage 4b): five made up people with no Worlds (people.mjs), given to
 * the prompt that ships on each model asked for, several times over.
 *
 *   scripts/first-worlds-replay/run.sh [--models sonnet,luna,flash] [--repeat n] [--only jun,ines]
 *
 * For each answer, code scores what it can count: which part of life each
 * World rests on (the part most of its records belong to), whether every part
 * a person plainly has got a World (cover), how much of what a World rests on
 * belongs to it (purity), Worlds that cover the same part twice, and records
 * that belong to no part. A judge model then reads each World's name and
 * Gremly, and says whether the name is a lasting part of life rather than one
 * thing with an end, whether it names a health condition, a treatment, a
 * medication or something private, and whether the Gremly suits it (Gemini
 * Pro, or GPT 6 Sol when it cannot be reached). Cost is
 * read from the usage rows the calls leave.
 *
 * The bar (proposed with stage 4b): cover 95 in 100 of the parts a person
 * plainly has, purity 90 in 100, no two Worlds for one part, no name that
 * names a condition, a treatment or a medication, and 90 in 100 names judged
 * a lasting part of life. Sonnet 5.5 ships unless a cheaper model meets it.
 *
 * Keys come from the environment: ANTHROPIC_API_KEY, OPENAI_API_KEY and
 * GEMINI_TEST_API_KEY. Writes out/report-<time>.md and out/runs-<time>.json.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  proposeFirstWorlds,
  firstWorldsDue,
  isNewTo,
  FIRST_WORLDS_VERSION,
} from '../../workers/inngest-jobs/context/firstWorlds.js';
import { markItems } from '../../workers/inngest-jobs/context/filed.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { GREMLY_CATALOG } from '../../workers/shared/gremlys.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { PEOPLE } from './people.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const only = flag('--only') ? new Set(flag('--only').split(',')) : null;
const MODELS = {
  sonnet: 'anthropic:claude-sonnet-5-5',
  luna: 'openai:gpt-6-luna',
  flash: 'google:gemini-3.8-flash',
};
// Sonnet 5.5 needs ANTHROPIC_API_KEY, which the replay machine may not have
const models = (flag('--models') || 'luna,flash').split(',').filter((m) => MODELS[m]);
const BAR = { cover: 0.95, purity: 0.9, lasting: 0.9 };

// usage rows land on a replay address, one bucket per call
const REPLAY_SUPABASE_URL = 'https://first-worlds-replay.invalid';
const bucket = new AsyncLocalStorage();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.startsWith(REPLAY_SUPABASE_URL)) {
    try {
      const body = JSON.parse(init.body);
      bucket.getStore()?.push(...(Array.isArray(body) ? body : [body]));
    } catch {
      // nothing to keep
    }
    return new Response('[]', { status: 201, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input, init);
};
installAiUsageLogging();

const baseEnv = {
  SUPABASE_URL: REPLAY_SUPABASE_URL,
  SUPABASE_SERVICE_KEY: 'replay',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
};

async function metered(fn) {
  const rows = [];
  const out = await bucket.run(rows, () =>
    aiContext.run({ env: baseEnv, worker: 'replay', job: 'first-worlds-replay' }, fn),
  );
  // the usage row is written after the reply is read; give it a moment
  await new Promise((r) => setTimeout(r, 50));
  return { out, cost: rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0) };
}

/** The person as first Worlds is shown them. */
function shown(p) {
  const facts = p.facts.map((f) => ({
    id: f.id,
    statement: f.statement,
    state: f.state,
    about_date: f.about_date,
    about_date_end: null,
    private: f.private,
    health: f.health,
    item_table: f.item ? { note: 'notes', todo: 'todos', habit: 'habits' }[f.item.type] : null,
    item_id: f.item?.id || null,
  }));
  const peopleById = new Map((p.people || []).map((x) => [x.id, x]));
  const peopleOf = new Map(
    p.facts
      .filter((f) => f.people?.length)
      .map((f) => [f.id, f.people.map((id) => peopleById.get(id)).filter(Boolean)]),
  );
  const items = markItems(
    [...p.items].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    facts,
  );
  return { items, facts, peopleOf };
}

/** Which part of life each record a World rests on belongs to. */
function partsOf(p, ref) {
  if (ref.type === 'fact') {
    const f = p.facts.find((x) => x.id === ref.id);
    const it = f?.item;
    return it ? [it.part, ...(it.fair || [])].filter((x) => x !== undefined) : [null];
  }
  const it = p.items.find((x) => x.id === ref.id);
  return it ? [it.part, ...(it.fair || [])] : [null];
}

function score(p, worlds) {
  const scored = worlds.map((w) => {
    const counts = new Map();
    for (const r of w.rests_on) {
      const main = partsOf(p, r)[0];
      counts.set(main, (counts.get(main) || 0) + 1);
    }
    const ranked = [...counts.entries()]
      .filter(([k]) => k)
      .sort((a, b) => b[1] - a[1]);
    const part = ranked[0]?.[0] || null;
    const fits = w.rests_on.filter((r) => part && partsOf(p, r).includes(part)).length;
    const noise = w.rests_on.filter((r) => partsOf(p, r)[0] === null).length;
    return { ...w, part, fits, noise, size: w.rests_on.length };
  });
  // A World named for one person in their life is that person's, as the
  // prompt asks: it is not a second World for the part its records sit in
  const people = new Set((p.personNames || []).map((x) => x.toLowerCase()));
  for (const w of scored) w.person = people.has(w.name.toLowerCase());
  const seen = new Set();
  let twice = 0;
  for (const w of scored) {
    if (!w.part || w.person) continue;
    if (seen.has(w.part)) twice++;
    seen.add(w.part);
  }
  for (const w of scored) if (w.person && w.part) seen.add(w.part);
  const must = p.parts.filter((x) => x.must);
  return {
    worlds: scored,
    must: must.length,
    covered: must.filter((x) => seen.has(x.key)).length,
    covered_may: p.parts.filter((x) => !x.must && seen.has(x.key)).length,
    fits: scored.reduce((s, w) => s + w.fits, 0),
    rests: scored.reduce((s, w) => s + w.size, 0),
    noise: scored.reduce((s, w) => s + w.noise, 0),
    twice,
  };
}

// ── the judge ───────────────────────────────────────────────────────────

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    lasting_part: { type: 'boolean' },
    names_condition: { type: 'boolean' },
    gremly_suits: { type: 'boolean' },
    why: { type: 'string' },
  },
  required: ['lasting_part', 'names_condition', 'gremly_suits', 'why'],
};

const JUDGE = `You review one World that a companion app named for a person. A World is a lasting part of someone's life that they come back to over time. Answer three questions about it from what you are given.
- lasting_part: is the name a lasting part of their life, rather than one task, one event, a single feeling, or something with an end of its own?
- names_condition: does the name name a particular health condition, treatment or medication, or a particular private matter? Naming their health in general is not that.
- gremly_suits: does the look of the Gremly chosen for it suit that part of their life, without anything in it that could jar or hurt given what that part of life holds for them?
Say why in one sentence.`;

async function judge(p, w) {
  const look = GREMLY_CATALOG.find((g) => g.slug === w.gremly)?.visual || 'the plain Gremly';
  const records = w.rests_on
    .map((r) => {
      if (r.type === 'fact') return p.facts.find((f) => f.id === r.id)?.statement;
      const it = p.items.find((x) => x.id === r.id);
      return it ? `${it.title}: ${it.body}` : null;
    })
    .filter(Boolean)
    .slice(0, 12);
  const { output } = await jsonCall(baseEnv, {
    // a judge from another family than the models being compared, where it can be
    primary: { provider: 'google', model: 'gemini-pro-latest' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: JUDGE,
    user: `THE WORLD'S NAME: ${w.name}\nITS GREMLY LOOKS LIKE: ${look}\nWHAT IT RESTS ON:\n${records.map((r) => `- ${r}`).join('\n')}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });
  return output;
}

// ── the run ─────────────────────────────────────────────────────────────

const people = PEOPLE.filter((p) => !only || only.has(p.key));
const runs = [];
for (const m of models) {
  const env = { ...baseEnv, CONTEXT_MODEL_FIRSTWORLDS: MODELS[m] };
  for (const p of people) {
    const due = firstWorldsDue({
      hasWorlds: false,
      made: false,
      lastTry: null,
      drops: p.items.length,
      firstDropDay: p.firstDropDay,
      today: p.today,
    });
    const { items, facts, peopleOf } = shown(p);
    const jobs = Array.from({ length: repeat }, (_, i) => i);
    const done = await Promise.all(
      jobs.map(async (i) => {
        try {
          const { out, cost } = await metered(() =>
            proposeFirstWorlds(env, {
              person: p.person,
              items,
              facts,
              peopleOf,
              today: p.today,
              isNew: isNewTo({ firstDropDay: p.firstDropDay, today: p.today }),
              firstDropDay: p.firstDropDay,
            }),
          );
          const s = score(p, out.worlds);
          for (const w of s.worlds) w.judged = await judge(p, w).catch((err) => ({ error: err.message }));
          return { model: m, answered_by: out.model, person: p.key, i, due, cost, problems: out.problems, ...s };
        } catch (err) {
          return { model: m, person: p.key, i, error: String(err.message).slice(0, 300) };
        }
      }),
    );
    runs.push(...done);
    for (const r of done)
      console.log(
        `${m} ${p.key}#${r.i}: ${r.error ? `ERROR ${r.error}` : `${r.worlds.length} Worlds [${r.worlds.map((w) => `${w.name} (${w.part || 'none'}, ${w.gremly})`).join('; ')}] cover ${r.covered}/${r.must} purity ${r.fits}/${r.rests} twice ${r.twice} $${r.cost.toFixed(4)}`}`,
      );
  }
}

// ── the report ──────────────────────────────────────────────────────────

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
const L = [
  `# First Worlds replay, ${new Date().toISOString().slice(0, 16)}`,
  '',
  `Prompt ${FIRST_WORLDS_VERSION}. ${people.length} made up people, ${repeat} runs each per model.`,
  '',
  '| Model | Cover (must) | Purity | Twice | Noise refs | Lasting names | Names a condition | Gremly suits | Cost a person | Meets the bar |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];
for (const m of models) {
  const rs = runs.filter((r) => r.model === m && !r.error);
  const worlds = rs.flatMap((r) => r.worlds);
  const judged = worlds.filter((w) => w.judged && !w.judged.error);
  const cover = rs.reduce((s, r) => s + r.covered, 0);
  const must = rs.reduce((s, r) => s + r.must, 0);
  const fits = rs.reduce((s, r) => s + r.fits, 0);
  const rests = rs.reduce((s, r) => s + r.rests, 0);
  const twice = rs.reduce((s, r) => s + r.twice, 0);
  const noise = rs.reduce((s, r) => s + r.noise, 0);
  const lasting = judged.filter((w) => w.judged.lasting_part).length;
  const condition = judged.filter((w) => w.judged.names_condition).length;
  const suits = judged.filter((w) => w.judged.gremly_suits).length;
  const cost = rs.length ? rs.reduce((s, r) => s + r.cost, 0) / rs.length : 0;
  const errors = runs.filter((r) => r.model === m && r.error).length;
  const meets =
    !errors &&
    must &&
    cover / must >= BAR.cover &&
    rests &&
    fits / rests >= BAR.purity &&
    twice === 0 &&
    condition === 0 &&
    judged.length &&
    lasting / judged.length >= BAR.lasting;
  L.push(
    `| ${m}${errors ? ` (${errors} failed)` : ''} | ${cover}/${must} ${pct(cover, must)} | ${pct(fits, rests)} | ${twice} | ${noise} | ${lasting}/${judged.length} | ${condition} | ${suits}/${judged.length} | $${cost.toFixed(4)} | ${meets ? 'yes' : 'no'} |`,
  );
}
L.push('', '## Every answer', '');
for (const r of runs) {
  if (r.error) {
    L.push(`- ${r.model} ${r.person} #${r.i}: failed, ${r.error}`);
    continue;
  }
  L.push(`- ${r.model} ${r.person} #${r.i} (${r.due.why}), answered by ${r.answered_by}: cover ${r.covered}/${r.must}, purity ${r.fits}/${r.rests}${r.problems.length ? `, problems: ${[...new Set(r.problems)].join('; ')}` : ''}`);
  for (const w of r.worlds)
    L.push(
      `  - ${w.name} | ${w.gremly} | part ${w.part || 'none'}${w.person ? ' (a person)' : ''} | rests on ${w.size}, ${w.fits} fit${w.noise ? `, ${w.noise} belong nowhere` : ''} | judge: ${w.judged?.error ? `failed ${w.judged.error}` : `${w.judged.lasting_part ? 'lasting' : 'NOT LASTING'}${w.judged.names_condition ? ', NAMES A CONDITION' : ''}${w.judged.gremly_suits ? '' : ', GREMLY DOES NOT SUIT'}: ${w.judged.why}`}`,
    );
}
mkdirSync(join(HERE, 'out'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
writeFileSync(join(HERE, 'out', `report-${stamp}.md`), L.join('\n'));
writeFileSync(join(HERE, 'out', `runs-${stamp}.json`), JSON.stringify(runs, null, 2));
console.log(L.slice(0, 12).join('\n'));
console.log(`report: out/report-${stamp}.md`);
