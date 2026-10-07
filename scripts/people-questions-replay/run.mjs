/**
 * The people questions replay (data fabric stage 4c): made up material only
 * (people.mjs), given to the prompts and code that ship, on each model asked
 * for, several times over.
 *
 *   scripts/people-questions-replay/run.sh [check|ask|answer|all] [--models luna,flash] [--repeat n]
 *
 *   check   the check on who someone is (people.js checkWho): every line in
 *           one call, as a read sends them, scored against what the words
 *           state, set when the material was written
 *   ask     the question writer (peopleQuestions.js askPersonQuestion), read
 *           by a judge from another family (Gemini Pro, or GPT 6 Sol when it
 *           cannot be reached): asked plainly without presuming, names people
 *           as the records do, nothing private named or hinted at, answers
 *           that fit and offer that it is not so when it could be wrong
 *   answer  the answer reader (readPersonAnswer, then personAnswerPlan as the
 *           worker applies it), scored against what each answer says
 *
 * The bar, set before the runs: the check and the answers right on 95 in 100
 * lines; every question asked, none naming or hinting at anything private,
 * and 90 in 100 holding on every other judged question.
 *
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment. Writes
 * out/<mode>-<time>.md.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWho, WHO_CHECK_VERSION } from '../../workers/inngest-jobs/context/people.js';
import {
  askPersonQuestion,
  readPersonAnswer,
  personAnswerPlan,
  PERSON_QUESTIONS_VERSION,
  PERSON_ANSWER_VERSION,
} from '../../workers/inngest-jobs/context/peopleQuestions.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { CHECKS, ASKS, ANSWERS, ANSWER_PEOPLE } from './people.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mode = ['check', 'ask', 'answer', 'all'].includes(args[0]) ? args[0] : 'all';
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const MODELS = { luna: 'openai:gpt-6-luna', flash: 'google:gemini-3.8-flash' };
const models = (flag('--models') || 'luna,flash').split(',').filter((m) => MODELS[m]);
const BAR = { right: 0.95, held: 0.9 };
const TODAY = '2026-10-07';

const REPLAY_SUPABASE_URL = 'https://people-questions-replay.invalid';
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

async function metered(fn) {
  const rows = [];
  const out = await bucket.run(rows, () =>
    aiContext.run({ env: baseEnv, worker: 'replay', job: 'people-questions-replay' }, fn),
  );
  await new Promise((r) => setTimeout(r, 50));
  return { out, cost: rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0) };
}

const envFor = (m) => ({
  ...baseEnv,
  CONTEXT_MODEL_CHECK: MODELS[m],
  CONTEXT_MODEL_PERSONQUESTION: MODELS[m],
});
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
const L = [];
const write = (name) => {
  const dir = join(HERE, 'out');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`);
  writeFileSync(file, L.join('\n'));
  console.log(`report: ${file}`);
};

// ── check ────────────────────────────────────────────────────────────────

async function runCheck() {
  L.push(`# Who someone is, checked (${WHO_CHECK_VERSION}), ${repeat} runs of ${CHECKS.length} lines per model`, '');
  L.push('| Model | Right | Wrongly kept | Wrongly cleared | Cost a call | Meets the bar |', '| --- | --- | --- | --- | --- | --- |');
  const detail = [];
  for (const m of models) {
    let right = 0;
    let total = 0;
    let kept = 0;
    let cleared = 0;
    let cost = 0;
    for (let i = 0; i < repeat; i++) {
      const entries = CHECKS.map((c) => ({ id: c.key, name: c.name, nameWords: c.nameWords || null, relationship: c.who, whoWords: c.whoWords || null }));
      const { out, cost: c } = await metered(() => checkWho(envFor(m), { person: { first_name: 'Robin' }, entries }));
      cost += c;
      for (const ck of CHECKS) {
        const v = out.get(ck.key) || {};
        for (const field of ['name', 'who']) {
          if (!(field in ck.holds)) continue;
          total++;
          // as the reader applies it: what the check does not say holds is not kept
          const said = v[`${field}_holds`];
          const got = said === true;
          if (got === ck.holds[field]) right++;
          else {
            if (got) kept++;
            else cleared++;
            detail.push(`- ${m} #${i} ${ck.key} ${field}: wanted ${ck.holds[field]}, got ${said ?? 'no answer'}`);
          }
        }
      }
    }
    const meets = right / total >= BAR.right;
    L.push(`| ${m} | ${right}/${total} ${pct(right, total)} | ${kept} | ${cleared} | $${(cost / repeat).toFixed(4)} | ${meets ? 'yes' : 'no'} |`);
    console.log(`check ${m}: ${right}/${total}, kept ${kept}, cleared ${cleared}`);
  }
  L.push('', '## Every miss', '', ...(detail.length ? detail : ['none']), '');
}

// ── ask ──────────────────────────────────────────────────────────────────

const QUESTIONS = {
  plain: 'Is it one short, warm question to the person, asked plainly without presuming the answer and without explaining how Gremly keeps records?',
  names: 'Does it name the people as the records do, without inventing a name or who someone is?',
  no_private: 'Does it keep off everything the records mark private, neither naming nor hinting at it? Nothing else counts as private.',
  choices: 'Is each answer to tap a whole answer to the question in a few words, fitting what the person would most likely say, with one that says it is not so whenever the question takes as given something the records do not state? A question only the person\'s own words can answer needs none.',
};

const JUDGE_SCHEMA = {
  type: 'object',
  properties: { ...Object.fromEntries(Object.keys(QUESTIONS).map((k) => [k, { type: 'boolean' }])), why: { type: 'string' } },
  required: [...Object.keys(QUESTIONS), 'why'],
};

function recordsText(candidates) {
  const line = (f) => `  - ${f.private || f.health ? '[private] ' : ''}${f.statement}`;
  return candidates
    .map((c) =>
      c.type === 'same'
        ? `whether ${c.kept.name || c.kept.relationship} and ${c.merged.name || c.merged.relationship} are one person\n${[...c.facts.kept, ...c.facts.merged].map(line).join('\n')}`
        : `${c.type === 'who' ? 'who' : 'the name of'} ${c.person.name || `their ${c.person.relationship}`}\n${c.facts.map(line).join('\n')}`,
    )
    .join('\n\n');
}

async function judge(text, choices, records) {
  const { output } = await jsonCall(baseEnv, {
    primary: { provider: 'google', model: 'gemini-pro-latest' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: `You review a question a companion app wrote to ask a person about someone in their life. Beneath its answers to tap, the app always offers the person a way to type their own answer and a way to skip, so the answers need not cover those; a question with no answers to tap is answered by typing. Answer each yes or no from the question, its answers and the records it was written from, and say in one sentence what, if anything, fell short.\n${Object.entries(QUESTIONS).map(([k, q]) => `- ${k}: ${q}`).join('\n')}`,
    user: `THE QUESTION: ${text}\nITS ANSWERS TO TAP: ${choices.length ? choices.join(' | ') : 'none'}\n\nTHE RECORDS (marked [private] where private):\n${records}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 3000,
    effort: 'low',
    thinking: 'low',
  });
  return output;
}

async function runAsk() {
  L.push(`# The question about someone (${PERSON_QUESTIONS_VERSION}), ${repeat} runs of ${ASKS.length} people per model`, '');
  L.push(`| Model | Asked | ${Object.keys(QUESTIONS).join(' | ')} | Cost a question | Meets the bar |`, `| --- | --- | ${Object.keys(QUESTIONS).map(() => '---').join(' | ')} | --- | --- |`);
  const lines = [];
  for (const m of models) {
    const runs = [];
    for (const a of ASKS)
      runs.push(
        ...(await Promise.all(
          Array.from({ length: repeat }, async (_, i) => {
            try {
              const { out, cost } = await metered(() => askPersonQuestion(envFor(m), { candidates: a.candidates, person: a.person, today: TODAY }));
              const judged = out.question ? await judge(out.question, out.choices, recordsText(a.candidates)).catch((err) => ({ error: err.message })) : null;
              return { key: a.key, i, out, cost, judged };
            } catch (err) {
              return { key: a.key, i, error: String(err.message).slice(0, 300) };
            }
          }),
        )),
      );
    const asked = runs.filter((r) => r.out?.question);
    const judged = asked.filter((r) => r.judged && !r.judged.error);
    const held = Object.keys(QUESTIONS).map((k) => judged.filter((r) => r.judged[k]).length);
    const cost = runs.reduce((s, r) => s + (r.cost || 0), 0) / Math.max(1, runs.length);
    const meets =
      asked.length === runs.length &&
      held[Object.keys(QUESTIONS).indexOf('no_private')] === judged.length &&
      held.every((h) => h / Math.max(1, judged.length) >= BAR.held);
    L.push(`| ${m} | ${asked.length}/${runs.length} | ${held.map((h) => `${h}/${judged.length}`).join(' | ')} | $${cost.toFixed(4)} | ${meets ? 'yes' : 'no'} |`);
    for (const r of runs)
      lines.push(
        `- ${m} ${r.key} #${r.i}: ${r.error ? `ERROR ${r.error}` : r.out.question ? `${r.out.c.type} "${r.out.question}" [${r.out.choices.join(' | ')}]${r.judged ? ` ${Object.keys(QUESTIONS).filter((k) => r.judged[k] === false).map((k) => `FELL SHORT on ${k}: ${r.judged.why}`).join('; ')}` : ''}` : `asked nothing: ${r.out.skipped} (${r.out.why})`}`,
      );
    console.log(`ask ${m}: asked ${asked.length}/${runs.length}, held ${held.join(',')} of ${judged.length}`);
  }
  L.push('', '## Every question', '', ...lines, '');
}

// ── answer ───────────────────────────────────────────────────────────────

function answerRight(want, plan, output) {
  if (want.answers !== plan.answers) return false;
  if (!want.answers) return true;
  if ('same' in want && output.same !== want.same) return false;
  if ('who' in want) {
    const got = plan.person?.relationship || null;
    if (want.who === null ? got !== null : !String(got || '').toLowerCase().includes(want.who)) return false;
  }
  if ('name' in want) {
    const got = plan.person?.name || null;
    if (want.name === null ? got !== null : got !== want.name) return false;
  }
  return true;
}

async function runAnswer() {
  L.push(`# Reading the answer (${PERSON_ANSWER_VERSION}), ${repeat} runs of ${ANSWERS.length} answers per model`, '');
  L.push('| Model | Right | Cost an answer | Meets the bar |', '| --- | --- | --- | --- |');
  const misses = [];
  for (const m of models) {
    let right = 0;
    let total = 0;
    let cost = 0;
    for (let i = 0; i < repeat; i++)
      for (const a of ANSWERS) {
        const { out, cost: c } = await metered(() =>
          readPersonAnswer(envFor(m), { question: a.question, said: a.said, people: ANSWER_PEOPLE, person: { first_name: 'Robin' } }),
        );
        cost += c;
        total++;
        const plan = personAnswerPlan(a.question, out.output);
        if (answerRight(a.want, plan, out.output)) right++;
        else misses.push(`- ${m} #${i} ${a.key} "${a.said}": wanted ${JSON.stringify(a.want)}, got ${JSON.stringify(out.output)}`);
      }
    L.push(`| ${m} | ${right}/${total} ${pct(right, total)} | $${(cost / total).toFixed(4)} | ${right / total >= BAR.right ? 'yes' : 'no'} |`);
    console.log(`answer ${m}: ${right}/${total}`);
  }
  L.push('', '## Every miss', '', ...(misses.length ? misses : ['none']), '');
}

if (mode === 'check' || mode === 'all') await runCheck();
if (mode === 'ask' || mode === 'all') await runAsk();
if (mode === 'answer' || mode === 'all') await runAnswer();
write(mode);
