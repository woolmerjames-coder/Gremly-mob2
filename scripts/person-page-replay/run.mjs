/**
 * The people page replay (Worlds rebuild, stage 5): made up material only
 * (people.mjs), given to the prompts and code that ship, on each model asked
 * for, several times over.
 *
 *   scripts/person-page-replay/run.sh [page|correct|all] [--models luna,flash] [--repeat n]
 *
 *   page     the page writer (personPage.js personPageWords, from the facts
 *            pageFacts lets through, as the worker gives them), through the
 *            check. Each page is read by a judge from another family (Gemini
 *            Pro, or GPT 6 Sol when it cannot be reached) beside every fact
 *            about the someone, private ones marked
 *   correct  the reader of what they type on a person's page
 *            (personCorrection.js), scored against the name and who they are
 *            each correction's words give
 *
 * The bar, set before the runs: every page written; no page speaks of the
 * person in the third person or names or hints at anything private; 90 in
 * 100 pages hold on every other judged question; 8 in 10 of the days that
 * can take a label get one; the reader right on 95 in 100 corrections.
 *
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment. Writes
 * out/<mode>-<time>.md.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  personPageWords,
  pageFacts,
  labelDay,
  PERSON_PAGE_VERSION,
} from '../../workers/inngest-jobs/context/personPage.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';
import { aiContext, installAiUsageLogging } from '../../workers/shared/aiUsage.js';
import { PAGES, CORRECTIONS, TODAY, PERSON } from './people.mjs';
import { personCorrectionPatch } from '../../workers/inngest-jobs/context/personCorrection.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mode = ['page', 'correct', 'all'].includes(args[0]) ? args[0] : 'all';
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const MODELS = { luna: 'openai:gpt-6-luna', flash: 'google:gemini-3.8-flash' };
const models = (flag('--models') || 'luna').split(',').filter((m) => MODELS[m]);
const BAR = { held: 0.9, labelled: 0.8, right: 0.95 };

const REPLAY_SUPABASE_URL = 'https://person-page-replay.invalid';
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
    aiContext.run({ env: baseEnv, worker: 'replay', job: 'person-page-replay' }, fn),
  );
  await new Promise((r) => setTimeout(r, 50));
  return { out, cost: rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0) };
}

const envFor = (m) => ({
  ...baseEnv,
  CONTEXT_MODEL_PERSONPAGE: MODELS[m],
  CONTEXT_MODEL_PERSONCORRECTION: MODELS[m],
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

// ── page ─────────────────────────────────────────────────────────────────

const QUESTIONS = {
  you: 'Does every label and sentence speak to the person the page is for as you, never of them by name or in the third person?',
  held: 'Does every label and sentence say only what the facts hold, adding nothing about who someone is, when something is, how many, or what happened?',
  label_no_day: 'Does every label name its occasion in a few words without giving its day, its date or how far off it is?',
  particular: 'Is each thing to remember one particular thing about the someone, never general, and never only a repeat of who they are to the person or of a label?',
  no_records: 'Does the page speak of the someone and of life with them, never of todos, lists, notes or records as such?',
  no_private: 'Does the page keep off everything the facts mark private, neither naming nor hinting at it? Nothing else counts as private.',
  as_held: 'Is each thing spoken of as its fact holds it, done as done and planned as planned, never something planned as done or under way, and is nothing said that stops being true as the days pass, such as today, this week or how soon?',
  no_feelings: 'Does the page keep from describing anyone’s feelings for them, judging how anyone is doing, and giving advice?',
};

const JUDGE_SCHEMA = {
  type: 'object',
  properties: { ...Object.fromEntries(Object.keys(QUESTIONS).map((k) => [k, { type: 'boolean' }])), why: { type: 'string' } },
  required: [...Object.keys(QUESTIONS), 'why'],
};

function factsText(p) {
  return p.facts
    .map((f) => `- ${f.private || f.health ? '[private] ' : ''}${f.state !== 'current' ? `(${f.state}) ` : ''}${f.about_date ? `(${f.timing === 'yearly' ? `every year on ${f.about_date.slice(5)}` : f.about_date}${f.about_date_end ? ` to ${f.about_date_end}` : ''}) ` : ''}${f.statement}`)
    .join('\n');
}

async function judge(p, page) {
  const byId = new Map(p.facts.map((f) => [f.id, f]));
  const pageText = [
    'DAYS (each label is shown with its day beside it, which the app works out):',
    ...(page.days.length ? page.days.map((d) => `- ${d.label}`) : ['(none)']),
    'THINGS TO REMEMBER:',
    ...(page.remember.length ? page.remember.map((r) => `- ${r.text}`) : ['(none)']),
  ].join('\n');
  // which fact each label is for, so the judge can read it against its fact; not on the page
  const forText = page.days.map((d) => `- "${d.label}" is for: ${byId.get(d.fact_id)?.statement || '?'}`).join('\n');
  const { output } = await jsonCall(baseEnv, {
    primary: { provider: 'google', model: 'gemini-pro-latest' },
    fallback: { provider: 'openai', model: 'gpt-6-sol' },
    system: `You review a page a companion app wrote for a person, named ${PERSON.first_name}, about someone in their life. The page's top already shows the someone's name, who they are to ${PERSON.first_name} and one line about them, so the page below need not repeat those. The facts were written by the app about ${PERSON.first_name} in the third person; the page must speak to ${PERSON.first_name} as you. Today is ${TODAY}. Answer each yes or no from the page and the facts, and say in one sentence what, if anything, fell short.\n${Object.entries(QUESTIONS).map(([k, q]) => `- ${k}: ${q}`).join('\n')}`,
    user: `THE SOMEONE: ${p.someone.name || '(no name given yet)'}${p.someone.relationship ? `, ${PERSON.first_name}'s ${p.someone.relationship}` : ''}\n\nTHE FACTS (marked [private] where private; a state in brackets when not current):\n${factsText(p)}\n\nTHE PAGE:\n${pageText}${forText ? `\n\nWHICH FACT EACH LABEL IS FOR (for you to check against; not shown on the page):\n${forText}` : ''}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 3000,
    effort: 'low',
    thinking: 'low',
  });
  return output;
}

async function runPage() {
  L.push(`# The people page (${PERSON_PAGE_VERSION}), ${repeat} runs of ${PAGES.length} pages per model`, '');
  L.push(`| Model | Pages | Days labelled | Things to remember | Left out by the check | ${Object.keys(QUESTIONS).join(' | ')} | Cost a page | Meets the bar |`, `| --- | --- | --- | --- | --- | ${Object.keys(QUESTIONS).map(() => '---').join(' | ')} | --- | --- |`);
  const lines = [];
  for (const m of models) {
    const runs = [];
    for (const p of PAGES)
      runs.push(
        ...(await Promise.all(
          Array.from({ length: repeat }, async (_, i) => {
            const given = pageFacts(p.facts);
            const can = given.filter((f) => labelDay(f, TODAY)).length;
            try {
              const { out, cost } = await metered(() =>
                personPageWords(envFor(m), { person: PERSON, someone: p.someone, names: p.names, facts: given, today: TODAY }),
              );
              const j = await judge(p, out).catch((err) => ({ error: String(err.message).slice(0, 200) }));
              return { key: p.key, i, out, cost, can, j };
            } catch (err) {
              return { key: p.key, i, can, error: String(err.message).slice(0, 300) };
            }
          }),
        )),
      );
    const written = runs.filter((r) => r.out);
    const judged = written.filter((r) => r.j && !r.j.error);
    const held = Object.keys(QUESTIONS).map((k) => judged.filter((r) => r.j[k]).length);
    const can = runs.reduce((s, r) => s + r.can, 0);
    const labelled = written.reduce((s, r) => s + r.out.days.length, 0);
    const remember = written.reduce((s, r) => s + r.out.remember.length, 0);
    const leftOut = written.reduce((s, r) => s + (r.out.check?.counts?.left_out || 0), 0);
    const cost = runs.reduce((s, r) => s + (r.cost || 0), 0) / Math.max(1, runs.length);
    const must = (k) => held[Object.keys(QUESTIONS).indexOf(k)] === judged.length;
    const meets =
      written.length === runs.length &&
      judged.length === written.length &&
      must('you') &&
      must('no_private') &&
      held.every((h) => h / Math.max(1, judged.length) >= BAR.held) &&
      labelled / Math.max(1, can) >= BAR.labelled;
    L.push(`| ${m} | ${written.length}/${runs.length} | ${labelled}/${can} | ${remember} | ${leftOut} | ${held.map((h) => `${h}/${judged.length}`).join(' | ')} | $${cost.toFixed(4)} | ${meets ? 'yes' : 'no'} |`);
    for (const r of runs) {
      if (r.error) {
        lines.push(`- ${m} ${r.key} #${r.i}: ERROR ${r.error}`);
        continue;
      }
      const short = Object.keys(QUESTIONS).filter((x) => r.j?.[x] === false);
      lines.push(`- ${m} ${r.key} #${r.i}: ${r.out.days.length} of ${r.can} days, ${r.out.remember.length} to remember${r.out.problems?.length ? `; the check: ${r.out.problems.join(' / ')}` : ''}${short.length ? `; FELL SHORT on ${short.join(', ')}: ${r.j.why}` : ''}${r.j?.error ? `; judge ERROR ${r.j.error}` : ''}`);
      for (const d of r.out.days) lines.push(`    day: ${d.label}`);
      for (const x of r.out.remember) lines.push(`    remember: ${x.text}`);
    }
    console.log(`page ${m}: ${written.length}/${runs.length} written, ${labelled}/${can} days, ${remember} lines, held ${held.join(',')} of ${judged.length}, $${cost.toFixed(4)} a page, ${meets ? 'meets' : 'misses'} the bar`);
  }
  L.push('', '## Every page', '', ...lines, '');
}

// ── correct ──────────────────────────────────────────────────────────────

async function runCorrect() {
  const { readPersonCorrection, PERSON_CORRECTION_VERSION } = await import('../../workers/inngest-jobs/context/personCorrection.js');
  L.push(`# What they type on a person's page (${PERSON_CORRECTION_VERSION}), ${repeat} runs of ${CORRECTIONS.length} per model`, '');
  L.push('| Model | Right | Cost a correction | Meets the bar |', '| --- | --- | --- | --- |');
  const misses = [];
  for (const m of models) {
    let right = 0;
    let total = 0;
    let cost = 0;
    for (let i = 0; i < repeat; i++)
      for (const c of CORRECTIONS) {
        const { out, cost: k } = await metered(() =>
          readPersonCorrection(envFor(m), { someone: c.someone, names: [c.someone.name].filter(Boolean), said: c.said, person: PERSON }),
        );
        cost += k;
        total++;
        // as the worker keeps it: a name or who they are the record already has changes nothing
        const patch = personCorrectionPatch(c.someone, out.output, 'now') || {};
        const got = { name: patch.name || null, who: patch.relationship || null };
        const ok =
          (c.want.name === null ? got.name === null : got.name === c.want.name) &&
          (c.want.who === null ? got.who === null : String(got.who || '').toLowerCase().includes(c.want.who));
        if (ok) right++;
        else misses.push(`- ${m} #${i} ${c.key} "${c.said}": wanted ${JSON.stringify(c.want)}, got ${JSON.stringify(got)}`);
      }
    L.push(`| ${m} | ${right}/${total} ${pct(right, total)} | $${(cost / total).toFixed(4)} | ${right / total >= BAR.right ? 'yes' : 'no'} |`);
    console.log(`correct ${m}: ${right}/${total}`);
  }
  L.push('', '## Every miss', '', ...(misses.length ? misses : ['none']), '');
}

if (mode === 'page' || mode === 'all') await runPage();
if (mode === 'correct' || mode === 'all') await runCorrect();
write(mode);
