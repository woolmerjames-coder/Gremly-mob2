/**
 * The words and memory replay (workers/inngest-jobs/context/words.js and
 * memory.js, data fabric stage 4b), with made up people (people.mjs).
 *
 *   scripts/words-replay/run.sh words  [--models luna,flash] [--repeat n]
 *   scripts/words-replay/run.sh memory [--models sonnet,luna,flash] [--repeat n]
 *   scripts/words-replay/run.sh set    [--models luna,flash] [--repeat n] [--no-others]
 *
 * words: the line under each of Alex's four Worlds and two open Chapters,
 * through the check as the worker runs it. memory: the memory of three closed
 * Chapters, Alex's, Ines's and Maya's. set: the words under Rosa's three
 * Worlds and one Chapter, with the one habit she keeps filed in all of them,
 * written one after another as the worker writes them (each given the words
 * before it, which --no-others takes away); the judge also asks whether each
 * says something of its own rather than what the others already say.
 *
 * Code counts what the check did: lines that passed at once, were sent back,
 * or were left out. A judge model then reads each line that stands, with the
 * records it was written from, and answers the questions its writer is held
 * to (Gemini Pro, or GPT 6 Sol when it cannot be reached). For the words: written to the person as you; still true on any day
 * until next written, with no dates, nothing about how soon or how long ago,
 * no counts of what is done or left; nothing private or about health named or
 * hinted at; resting on the records alone; particular to them. For a memory:
 * to the person, looking back; no tally of what was left undone or fell
 * short; no condition, treatment or medication named; resting on the records
 * alone; its meaning only from their own words.
 *
 * The bar (proposed with stage 4b): every judged question held on 95 in 100
 * lines that stand, none naming anything private on a line seen at a glance,
 * and no more than 1 in 10 left out. The cheapest model that meets it ships.
 *
 * Keys come from the environment: ANTHROPIC_API_KEY, OPENAI_API_KEY and
 * GEMINI_TEST_API_KEY. Writes out/<mode>-<time>.md and .json.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  writeLine,
  renderWords,
  wordsOthers,
  wordsBefore,
  WORDS_WRITER_VERSION,
} from '../../workers/inngest-jobs/context/words.js';
import { memoryLine, MEMORY_VERSION } from '../../workers/inngest-jobs/context/memory.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { ALEX, MEMORIES, ROSA, TODAY, alexFiled } from './people.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mode = ['memory', 'set'].includes(args[0]) ? args[0] : 'words';
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const MODELS = {
  sonnet: 'anthropic:claude-sonnet-5-5',
  luna: 'openai:gpt-6-luna',
  flash: 'google:gemini-3.8-flash',
};
// Sonnet 5.5 needs ANTHROPIC_API_KEY, which the replay machine may not have
const models = (flag('--models') || 'luna,flash')
  .split(',')
  .filter((m) => MODELS[m]);
const BAR = { held: 0.95, leftOut: 0.1 };

const REPLAY_SUPABASE_URL = 'https://words-replay.invalid';
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
    aiContext.run({ env: baseEnv, worker: 'replay', job: `${mode}-replay` }, fn),
  );
  await new Promise((r) => setTimeout(r, 50));
  return { out, cost: rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0) };
}

// ── the judge ───────────────────────────────────────────────────────────

const QUESTIONS = {
  words: {
    you: 'Is it written to the person, as you?',
    lasting: 'Would it still be true on any day until it is next written, perhaps weeks from now, if nothing new happened? It fails if it gives a date or names one particular day, says how soon or how long ago something is, counts what is done or left, or speaks of today, this week or soon. A day something happens on every week does not fail it.',
    no_private: 'Does it keep off anything about health and anything a record marks private, neither naming nor hinting at it?',
    grounded: 'Does everything it says come from the records given?',
    particular: 'Is it particular to this person, rather than words that could sit under anyone\'s?',
  },
  memory: {
    you: 'Is it written to the person, as you, looking back?',
    no_tally: 'Does it keep off any tally: nothing about what was left undone, how much was or was not done, or how it fell short of a plan? A lesson they drew themselves, in their own words, is not a tally.',
    no_condition: 'Does it keep from naming a health condition, a treatment or a medication in words of its own? Their own words for something, as their records or the Chapter title put it, are theirs to see.',
    no_records: 'Does it speak of their life, never of their records, notes, todos or lists?',
    grounded: 'Does everything it says come from the records given?',
    own_meaning: 'Does any meaning or feeling it gives come from the person\'s own words in the records, rather than being supplied for them?',
  },
}[mode === 'set' ? 'words' : mode];
if (mode === 'set')
  Object.assign(QUESTIONS, {
    distinct:
      'Does it say something of its own, rather than what the words under their other Worlds and Chapters, given after the records, already say?',
    cleared:
      'Does it keep from telling anything the records say was cleared from their list without being marked done as done, or as still to do?',
  });

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    ...Object.fromEntries(Object.keys(QUESTIONS).map((k) => [k, { type: 'boolean' }])),
    why: { type: 'string' },
  },
  required: [...Object.keys(QUESTIONS), 'why'],
};

async function judge(what, text, recordsText) {
  const { output } = await jsonCall(baseEnv, {
    // a judge from another family than the models being compared, where it can be
    primary: { provider: 'google', model: 'gemini-pro-latest' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: `You review ${mode !== 'memory' ? 'the words a companion app wrote under one part of a person\'s life, shown on a screen at a glance' : 'the memory a companion app wrote of something in a person\'s life that has ended'}. Answer each question yes or no, from the words and the records they were written from, and say in one sentence what, if anything, fell short.\n${Object.entries(QUESTIONS)
      .map(([k, q]) => `- ${k}: ${q}`)
      .join('\n')}`,
    user: `FOR: ${what}\n\nTHE WORDS: ${text}\n\nTHE RECORDS THEY WERE WRITTEN FROM:\n${recordsText}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 4000,
    effort: 'low',
    thinking: 'low',
  });
  return output;
}

// ── the jobs ────────────────────────────────────────────────────────────

function jobs() {
  if (mode === 'words')
    return [...ALEX.worlds, ...ALEX.chapters.filter((c) => c.row.phase !== 'closed')].map((t) => ({
      key: `${t.kind}:${t.name}`,
      what: `the ${t.kind === 'world' ? 'World' : 'Chapter'} ${t.name}`,
      person: ALEX.person,
      run: (env) => writeLine(env, { userId: 'replay', person: ALEX.person, target: t, today: TODAY, filed: alexFiled(t) }),
      records: () => {
        const f = alexFiled(t);
        return renderWords({ kind: t.kind, target: t.row, world: t.world, ...f, today: TODAY }).text;
      },
    }));
  return MEMORIES.map((m) => ({
    key: m.key,
    what: `the Chapter ${m.chapter.title}, which has ended`,
    person: m.person,
    run: (env) => memoryLine(env, { person: m.person, chapter: m.chapter, world: m.world, got: m.got(), today: TODAY }),
    records: () => renderWords({ kind: 'chapter', target: m.chapter, world: m.world, ...m.got(), today: TODAY, ended: true }).text,
  }));
}

// ── the set: Rosa's words one after another, as the worker writes them ──

if (mode === 'set') {
  const noOthers = args.includes('--no-others');
  const L = [`# Words set replay (${WORDS_WRITER_VERSION})${noOthers ? ', without the words before' : ''}, ${repeat} runs per model`, ''];
  L.push(`| Model | Lines written | ${Object.keys(QUESTIONS).join(' | ')} | Cost a set |`, `| --- | --- | ${Object.keys(QUESTIONS).map(() => '---').join(' | ')} | --- |`);
  const every = [];
  for (const m of models) {
    const env = { ...baseEnv, CONTEXT_MODEL_WORDS: MODELS[m] };
    const sets = await Promise.all(
      Array.from({ length: repeat }, async (_, i) => {
        const said = wordsBefore(ROSA.targets, ROSA.targets);
        const lines = [];
        let cost = 0;
        for (const t of ROSA.targets) {
          try {
            const { out, cost: c } = await metered(() =>
              writeLine(env, { userId: 'replay', person: ROSA.person, target: t, today: TODAY, filed: t.filed(), others: noOthers ? [] : wordsOthers(t, ROSA.targets, said) }),
            );
            cost += c;
            said.set(`${t.table}:${t.row.id}`, out.text || null);
            lines.push({ t, text: out.text, outcome: out.outcome, problems: out.problems || [] });
          } catch (err) {
            lines.push({ t, error: String(err.message).slice(0, 200) });
          }
        }
        // each line is judged beside the words the others ended with
        for (const x of lines) {
          if (!x.text) continue;
          const rest = wordsOthers(x.t, ROSA.targets, said);
          const records = `${renderWords({ kind: x.t.kind, target: x.t.row, world: x.t.world || null, ...x.t.filed(), today: TODAY }).text}\n\nTHE WORDS UNDER THEIR OTHER WORLDS AND CHAPTERS:\n${rest.map((o) => `${o.which} | ${o.words}`).join('\n') || '(none)'}`;
          x.judged = await judge(`the ${x.t.kind === 'world' ? 'World' : 'Chapter'} ${x.t.name}`, x.text, records).catch((err) => ({ error: err.message }));
        }
        return { i, lines, cost };
      }),
    );
    const judged = sets.flatMap((x) => x.lines).filter((x) => x.judged && !x.judged.error);
    const written = sets.flatMap((x) => x.lines).filter((x) => x.text).length;
    const held = Object.keys(QUESTIONS).map((k) => judged.filter((x) => x.judged[k]).length);
    L.push(`| ${m} | ${written}/${sets.length * ROSA.targets.length} | ${held.map((h) => `${h}/${judged.length}`).join(' | ')} | $${(sets.reduce((a, x) => a + x.cost, 0) / sets.length).toFixed(4)} |`);
    for (const set of sets) {
      every.push(`- ${m} set ${set.i}:`);
      for (const x of set.lines) {
        const short = x.judged && !x.judged.error ? Object.keys(QUESTIONS).filter((k) => !x.judged[k]) : [];
        every.push(`    ${x.t.name} (${x.error ? `failed, ${x.error}` : x.outcome}): ${x.text ? `"${x.text}"` : '(left blank)'}${short.length ? ` | FELL SHORT on ${short.join(', ')}: ${x.judged.why}` : ''}${x.problems?.length ? ` | check: ${x.problems.join(' / ')}` : ''}`);
      }
    }
    console.log(`${m}: ${written} written, held ${held.join(',')} of ${judged.length}`);
  }
  L.push('', '## Every set', '', ...every, '');
  mkdirSync(join(HERE, 'out'), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  writeFileSync(join(HERE, 'out', `set-${stamp}${noOthers ? '-no-others' : ''}.md`), L.join('\n'));
  console.log(`report: out/set-${stamp}${noOthers ? '-no-others' : ''}.md`);
  process.exit(0);
}

const runs = [];
for (const m of models) {
  const slot = mode === 'words' ? 'CONTEXT_MODEL_WORDS' : 'CONTEXT_MODEL_MEMORY';
  const env = { ...baseEnv, [slot]: MODELS[m] };
  for (const j of jobs()) {
    const done = await Promise.all(
      Array.from({ length: repeat }, async (_, i) => {
        try {
          const { out, cost } = await metered(() => j.run(env));
          const judged = out.text ? await judge(j.what, out.text, j.records()).catch((err) => ({ error: err.message })) : null;
          return { model: m, answered_by: out.model, key: j.key, i, outcome: out.outcome, text: out.text, problems: out.problems || [], cost, judged };
        } catch (err) {
          return { model: m, key: j.key, i, error: String(err.message).slice(0, 300) };
        }
      }),
    );
    runs.push(...done);
    for (const r of done)
      console.log(`${m} ${r.key}#${r.i}: ${r.error ? `ERROR ${r.error}` : `${r.outcome} ${JSON.stringify(r.text)} ${r.judged ? Object.keys(QUESTIONS).filter((k) => r.judged[k] === false).join(',') || 'all held' : ''} $${r.cost.toFixed(4)}`}`);
  }
}

// ── the report ──────────────────────────────────────────────────────────

const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
const L = [
  `# ${mode === 'words' ? 'Words' : 'Memory'} replay, ${new Date().toISOString().slice(0, 16)}`,
  '',
  `Prompt ${mode === 'words' ? WORDS_WRITER_VERSION : MEMORY_VERSION}, ${repeat} runs of each per model.`,
  '',
  `| Model | Passed at once | Sent back and kept | Left out | ${Object.keys(QUESTIONS).join(' | ')} | Cost a line | Meets the bar |`,
  `| --- | --- | --- | --- | ${Object.keys(QUESTIONS).map(() => '---').join(' | ')} | --- | --- |`,
];
for (const m of models) {
  const rs = runs.filter((r) => r.model === m && !r.error);
  const errors = runs.filter((r) => r.model === m && r.error).length;
  const stood = rs.filter((r) => r.text && r.judged && !r.judged.error);
  const left = rs.filter((r) => r.outcome === 'left_out').length;
  const held = Object.keys(QUESTIONS).map((k) => stood.filter((r) => r.judged[k]).length);
  const cost = rs.length ? rs.reduce((s, r) => s + r.cost, 0) / rs.length : 0;
  const meets =
    !errors &&
    rs.length &&
    left / rs.length <= BAR.leftOut &&
    stood.length &&
    held.every((h) => h / stood.length >= BAR.held) &&
    (mode !== 'words' || held[Object.keys(QUESTIONS).indexOf('no_private')] === stood.length) &&
    (mode !== 'memory' || held[Object.keys(QUESTIONS).indexOf('no_condition')] === stood.length);
  L.push(
    `| ${m}${errors ? ` (${errors} failed)` : ''} | ${rs.filter((r) => r.outcome === 'pass').length}/${rs.length} | ${rs.filter((r) => r.outcome === 'rewritten').length} | ${left} ${pct(left, rs.length)} | ${held.map((h) => `${h}/${stood.length}`).join(' | ')} | $${cost.toFixed(4)} | ${meets ? 'yes' : 'no'} |`,
  );
}
L.push('', '## Every line', '');
for (const r of runs) {
  if (r.error) {
    L.push(`- ${r.model} ${r.key} #${r.i}: failed, ${r.error}`);
    continue;
  }
  const short = r.judged && !r.judged.error ? Object.keys(QUESTIONS).filter((k) => !r.judged[k]) : [];
  L.push(
    `- ${r.model} ${r.key} #${r.i} (${r.outcome}, ${r.answered_by}): ${r.text ? `"${r.text}"` : '(left blank)'}${short.length ? ` | FELL SHORT on ${short.join(', ')}: ${r.judged.why}` : ''}${r.problems.length ? ` | check: ${r.problems.join(' / ')}` : ''}`,
  );
}
mkdirSync(join(HERE, 'out'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
writeFileSync(join(HERE, 'out', `${mode}-${stamp}.md`), L.join('\n'));
writeFileSync(join(HERE, 'out', `${mode}-${stamp}.json`), JSON.stringify(runs, null, 2));
console.log(L.slice(0, 10).join('\n'));
console.log(`report: out/${mode}-${stamp}.md`);
