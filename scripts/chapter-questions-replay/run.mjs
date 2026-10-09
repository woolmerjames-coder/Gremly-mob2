/**
 * The Chapter questions replay (workers/inngest-jobs/context/chapterQuestions.js,
 * data fabric stage 4c): made up days (scenarios.mjs), given to the prompts
 * and code that ship, on each model asked for, several times over.
 *
 *   scripts/chapter-questions-replay/run.sh [--models luna,flash] [--repeat n]
 *
 *   Suggesting a Chapter moved to the weekly pass on 18 Oct, and its
 *   scenarios with it (scripts/weekly-replay, the forming weeks).
 *   close    a Chapter past its dates gets a question whose guess fits its
 *            records; scored against the guesses set as right, and read by a
 *            judge from another family (Gemini Pro, or GPT 6 Sol).
 *   welcome  on a welcome back, one question for each Chapter, as one set,
 *            with guesses that fit; scored the same way.
 *   answers  (with --answers, on its own) made up answers to the three kinds
 *            of question are read by the answer reader
 *            (context/chapterAnswers.js): whether they answer it, the outcome
 *            and the days they give, scored against what was set as right, with
 *            what code would then do.
 *
 * What code alone decides (the switch, nothing new while away, a no never
 * asked again) is held by the unit tests
 * (context/__tests__/chapterQuestions.test.js).
 *
 * The bar, set before the runs: the guesses right in 90 in 100, and every
 * judged question holding on 90 in 100.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  askClose,
  CHAPTER_QUESTIONS_VERSION,
} from '../../workers/inngest-jobs/context/chapterQuestions.js';
import {
  readChapterAnswer,
  chapterAnswerPlan,
  CHAPTER_ANSWER_VERSION,
} from '../../workers/inngest-jobs/context/chapterAnswers.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { TODAY, PERSON, WORLDS, CLOSES, WELCOME, ANSWERS } from './scenarios.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const MODELS = { luna: 'openai:gpt-6-luna', flash: 'google:gemini-3.8-flash' };
const models = (flag('--models') || 'luna,flash').split(',').filter((m) => MODELS[m]);
const BAR = 0.9;

const REPLAY_SUPABASE_URL = 'https://chapter-questions-replay.invalid';
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
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
};
const envFor = (m) => ({ ...baseEnv, CONTEXT_MODEL_CHAPTERQUESTION: MODELS[m] });

async function metered(fn) {
  const rows = [];
  const out = await bucket.run(rows, () =>
    aiContext.run({ env: baseEnv, worker: 'replay', job: 'chapter-questions-replay' }, fn),
  );
  await new Promise((r) => setTimeout(r, 50));
  return { out, cost: rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0) };
}
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');

const QUESTIONS = {
  plain: 'Is it one short, warm question to the person, asked plainly, that offers a guess about what became of the Chapter without presuming it?',
  named: 'Does it name the Chapter as its title does?',
  choices: 'Do the answers to tap fit, a few words each, including, for a Chapter whose dates have passed, that it is over and that it is still going, and for one still ahead, that it is still on and that it is not?',
  grounded: 'Does it say nothing about the Chapter that its records do not hold?',
};
const JUDGE_SCHEMA = {
  type: 'object',
  properties: { ...Object.fromEntries(Object.keys(QUESTIONS).map((k) => [k, { type: 'boolean' }])), why: { type: 'string' } },
  required: [...Object.keys(QUESTIONS), 'why'],
};
async function judge(row, c) {
  const { output } = await jsonCall(baseEnv, {
    primary: { provider: 'google', model: 'gemini-pro-latest' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: `You review a question a companion app wrote to ask a person about a Chapter of their life whose dates have passed, or, when they come back after time away, one still ahead. Answer each yes or no, and say in one sentence what, if anything, fell short.\n${Object.entries(QUESTIONS).map(([k, q]) => `- ${k}: ${q}`).join('\n')}`,
    user: `THE QUESTION: ${row.question}\nITS ANSWERS: ${row.choices.join(' | ')}\n\nTHE CHAPTER: ${c.chapter.title}, ${c.chapter.start_date} to ${c.chapter.end_date}. Today is ${TODAY}.\nITS RECORDS:\n${c.records.items.map((i) => `- ${i.date}: ${i.body}`).join('\n')}\n${c.records.facts.map((f) => `- ${f.statement} (${f.state})`).join('\n')}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 3000,
    effort: 'low',
    thinking: 'low',
  });
  return output;
}

function answerRight(a, out) {
  if (a.answers !== null && out?.answers !== a.answers) return `answers ${out?.answers}`;
  const outcome = out?.outcome ?? null;
  if (out?.answers !== false && !a.right.includes(outcome)) return `outcome ${outcome}`;
  if (['moved', 'start'].includes(outcome)) {
    if (a.start && out.start_date !== a.start) return `start ${out.start_date}`;
    if (a.end && out.end_date !== a.end) return `end ${out.end_date}`;
    if (!a.start && !a.end && (out.start_date || out.end_date)) return `days they never gave: ${out.start_date} to ${out.end_date}`;
  }
  return '';
}

if (args.includes('--answers')) {
  const A = [`# Chapter answers replay (${CHAPTER_ANSWER_VERSION}), ${repeat} runs of each per model`, '', '| Model | Read right | Cost a call | Meets the bar |', '| --- | --- | --- | --- |'];
  const lines = [];
  for (const m of models) {
    const env = { ...baseEnv, CONTEXT_MODEL_PERSONQUESTION: MODELS[m] };
    let right = 0;
    let all = 0;
    let cost = 0;
    for (const a of ANSWERS)
      for (const res of await Promise.all(
        Array.from({ length: repeat }, () =>
          metered(() => readChapterAnswer(env, { question: a.question, said: a.said, chapter: a.chapter || null, person: PERSON, today: TODAY })).catch(
            (err) => ({ error: err.message }),
          ),
        ),
      )) {
        all++;
        if (res.error) {
          lines.push(`- ${m} ${a.key}: ERROR ${res.error}`);
          continue;
        }
        cost += res.cost;
        const out = res.out.output;
        const why = answerRight(a, out);
        if (!why) right++;
        const plan = chapterAnswerPlan({ question: a.question, output: out, chapter: a.chapter || null, today: TODAY });
        const does = plan.start ? `starts "${plan.start.title}" ${plan.start.start_date} to ${plan.start.end_date}` : plan.close ? 'closes it' : plan.dates ? `moves it ${JSON.stringify(plan.dates)}` : plan.clearEnd ? 'takes its passed end away' : 'changes nothing';
        lines.push(`- ${m} ${a.key} "${a.said}": ${why ? `WRONG (${why})` : 'right'} | answers ${out?.answers}, ${out?.outcome}, ${out?.start_date || '-'} to ${out?.end_date || '-'} | ${does}${plan.answers ? '' : ', question left open'}`);
      }
    A.push(`| ${m} | ${right}/${all} ${pct(right, all)} | $${(cost / Math.max(1, all)).toFixed(4)} | ${right / all >= BAR ? 'yes' : 'no'} |`);
    console.log(`${m}: answers ${right}/${all}`);
  }
  A.push('', '## Every answer', '', ...lines, '');
  const dir = join(HERE, 'out');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `answers-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`);
  writeFileSync(file, A.join('\n'));
  console.log(`report: ${file}`);
  process.exit(0);
}

const L = [`# Chapter questions replay (${CHAPTER_QUESTIONS_VERSION}), ${repeat} runs of each per model`, ''];
const detail = [];
L.push(
  `| Model | Close guesses right | Welcome back guesses right | ${Object.keys(QUESTIONS).join(' | ')} | Cost a call | Meets the bar |`,
  `| --- | --- | --- | ${Object.keys(QUESTIONS).map(() => '---').join(' | ')} | --- | --- |`,
);

for (const m of models) {
  const env = envFor(m);
  let calls = 0;
  let cost = 0;
  const tally = { c: [0, 0], w: [0, 0] };
  const judged = [];

  // closing, and the welcome back
  const asks = [
    { kind: 'c', list: CLOSES, welcome: false },
    { kind: 'w', list: WELCOME.chapters, welcome: true },
  ];
  for (const a of asks) {
    const chapters = a.list.map((x) => x.chapter);
    const records = new Map(a.list.map((x) => [x.chapter.id, x.records]));
    for (const res of await Promise.all(
      Array.from({ length: repeat }, () =>
        metered(() =>
          askClose(env, { chapters, records, worlds: WORLDS, person: PERSON, today: TODAY, welcome: a.welcome, userId: 'u', runId: 'r', setId: a.welcome ? 'set-1' : null }),
        ).catch((err) => ({ error: err.message })),
      ),
    )) {
      if (res.error) {
        detail.push(`- ${m} ${a.welcome ? 'welcome' : 'close'}: ERROR ${res.error}`);
        tally[a.kind][1] += a.list.length;
        continue;
      }
      calls++;
      cost += res.cost;
      for (const x of a.list) {
        tally[a.kind][1]++;
        const row = res.out.rows.find((r) => r.record_id === x.chapter.id);
        const ok = !!row && x.right.includes(row.proposed_change.guess);
        if (ok) tally[a.kind][0]++;
        const j = row ? await judge(row, x).catch((err) => ({ error: err.message })) : null;
        if (j && !j.error) judged.push(j);
        detail.push(`- ${m} ${a.welcome ? 'welcome' : 'close'} ${x.chapter.title}: ${ok ? 'right' : 'WRONG'} guess ${row?.proposed_change.guess || 'none'} | ${row ? `"${row.question}" [${row.choices.join(' | ')}]` : 'no question'}${j && !j.error ? ` ${Object.keys(QUESTIONS).filter((k) => j[k] === false).map((k) => `FELL SHORT on ${k}: ${j.why}`).join('; ')}` : ''}`);
      }
      if (a.welcome && new Set(res.out.rows.map((r) => r.set_id)).size > 1) detail.push(`- ${m} welcome: MORE THAN ONE SET`);
    }
  }

  const held = Object.keys(QUESTIONS).map((k) => judged.filter((j) => j[k]).length);
  const meets =
    tally.c[0] / tally.c[1] >= BAR &&
    tally.w[0] / tally.w[1] >= BAR &&
    held.every((h) => h / Math.max(1, judged.length) >= BAR);
  L.push(
    `| ${m} | ${tally.c[0]}/${tally.c[1]} ${pct(...tally.c)} | ${tally.w[0]}/${tally.w[1]} ${pct(...tally.w)} | ${held.map((h) => `${h}/${judged.length}`).join(' | ')} | $${(cost / Math.max(1, calls)).toFixed(4)} | ${meets ? 'yes' : 'no'} |`,
  );
  console.log(`${m}: close ${tally.c.join('/')}, welcome ${tally.w.join('/')}, held ${held.join(',')} of ${judged.length}`);
}

L.push('', '## Every answer', '', ...detail, '');
const dir = join(HERE, 'out');
mkdirSync(dir, { recursive: true });
const file = join(dir, `report-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`);
writeFileSync(file, L.join('\n'));
console.log(`report: ${file}`);
