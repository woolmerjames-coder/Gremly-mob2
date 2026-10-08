/**
 * The greeting replay (data fabric stage 4f): the line Gremly says on Ask
 * Gremly's fresh home, written by the prompt and model that ship
 * (workers/cortex/greeting.js, the helper model in cortex's wrangler.toml),
 * for made up mornings and evenings, with and without Gremly's questions
 * waiting. Each line is read by a judge from another model family: does it
 * mention the questions, does it make them a job to do, and does it still
 * draw on what matters most that day.
 *
 *   scripts/greeting-replay/run.sh [--repeat n] [--label name]
 *
 * The bar, set before the runs: with questions waiting, no line makes them a
 * job, and the day's main thing is kept as often as without; with none
 * waiting, no line mentions questions.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment. Writes
 * out/ (gitignored). Nothing real is read or written.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { greetingFacts, greetingPrompt } from '../../workers/cortex/greeting.js';
import { helperFetch } from '../../workers/cortex/helperClient.js';
import { configureModels } from '../../workers/cortex/models.js';
import { jsonCall } from '../../workers/inngest-jobs/context/llm.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 4));
const label = flag('--label') || 'greeting';

// the helper model as cortex's wrangler.toml sets it
configureModels({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GEMINI_TEST_API_KEY,
  HELPER_MODEL: 'gpt-6-luna',
  HELPER_FALLBACK_MODEL: 'gemini-3.8-flash',
});
const judgeEnv = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY };

/** Made up moments of a made up person's days. main: what matters most, for the judge. */
const MOMENTS = [
  {
    id: 'anniversary-morning',
    time: { timeStr: '7:40 AM', dayStr: 'Thursday', hour: 7 },
    focus: {
      lifeMoment: 'Getting ready for her anniversary with Eli',
      briefHeadline: 'Anniversary day with Eli, dinner still to book.',
      namedAnchors: [{ type: 'person', label: 'Eli' }],
      leadStory: { what: 'Anniversary with Eli', why_today: 'It is today, and dinner is not booked yet.' },
    },
    laterToday: ['9:30am Team sync', '6:00pm Pottery class'],
    main: 'her anniversary with Eli today',
  },
  {
    id: 'quiet-afternoon',
    time: { timeStr: '2:15 PM', dayStr: 'Sunday', hour: 14 },
    focus: null,
    laterToday: [],
    main: null,
  },
  {
    id: 'evening-to-decide',
    time: { timeStr: '8:20 PM', dayStr: 'Tuesday', hour: 20 },
    focus: {
      lifeMoment: 'Grant decision due on Friday',
      briefHeadline: 'A long day of Hartley prep.',
      leadStory: { what: 'The grant decision', why_today: 'It is due on Friday.' },
    },
    laterToday: [],
    toDecide: 3,
    main: 'the grant decision due on Friday',
  },
];
const WAITING = [
  { id: 'none', questions: null },
  { id: 'three-one-needs', questions: { count: 3, needs: 1 } },
  { id: 'four', questions: { count: 4, needs: 0 } },
];

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    mentions_questions: { type: 'boolean' },
    makes_it_a_job: { type: 'boolean' },
    keeps_the_main_thing: { type: 'boolean' },
    note: { type: 'string' },
  },
  required: ['mentions_questions', 'makes_it_a_job', 'keeps_the_main_thing', 'note'],
};

async function judge(line, moment, waiting) {
  const { output } = await jsonCall(judgeEnv, {
    primary: { provider: 'google', model: 'gemini-3.8-flash' },
    fallback: null,
    system: `You read one line a companion app says beside its mascot when the person opens its chat. Judge it on three things.
mentions_questions: whether it refers, in any words, to the app having questions for them or things it is unsure of.
makes_it_a_job: whether it presents something waiting in the app as a task or duty for them, or presses them to deal with it, rather than mentioning it in passing as a friend would.
keeps_the_main_thing: whether it draws on what matters most to them that day, when there is such a thing; true when there is none.
Return only the structured result.`,
    user: `What matters most to them that day: ${moment.main || 'nothing in particular'}
Questions waiting: ${waiting.questions ? `${waiting.questions.count}, ${waiting.questions.needs} needing an answer` : 'none'}
The line: ${line}`,
    schema: JUDGE_SCHEMA,
    maxTokens: 8000,
    thinking: 'high',
  });
  return output;
}

async function oneLine(moment, waiting) {
  const prompt = greetingPrompt({
    ...moment.time,
    facts: greetingFacts({
      focus: moment.focus,
      laterToday: moment.laterToday,
      toDecide: moment.toDecide || 0,
      questions: waiting.questions,
    }),
  });
  const res = await helperFetch('general_greeting', {
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Write the line.' },
    ],
    max_tokens: 80,
    temperature: 0.7,
  });
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
}

const jobs = [];
for (const m of MOMENTS) for (const w of WAITING) for (let i = 0; i < repeat; i++) jobs.push({ m, w });
const results = await Promise.all(
  jobs.map(async ({ m, w }) => {
    try {
      const line = await oneLine(m, w);
      return { moment: m.id, waiting: w.id, line, verdict: line ? await judge(line, m, w) : null };
    } catch (err) {
      return { moment: m.id, waiting: w.id, error: String(err?.message || err).slice(0, 200) };
    }
  }),
);

const L = [`# Greeting replay (${label}), ${repeat} lines each`, ''];
L.push('| Waiting | Lines | Mention questions | Make it a job | Keep the main thing |', '| --- | --- | --- | --- | --- |');
for (const w of WAITING) {
  const rs = results.filter((r) => r.waiting === w.id && r.verdict);
  const n = (k) => rs.filter((r) => r.verdict[k]).length;
  L.push(`| ${w.id} | ${rs.length} | ${n('mentions_questions')} | ${n('makes_it_a_job')} | ${n('keeps_the_main_thing')} |`);
}
L.push('');
for (const m of MOMENTS)
  for (const w of WAITING) {
    L.push(`## ${m.id}, questions ${w.id}`, '');
    for (const r of results.filter((x) => x.moment === m.id && x.waiting === w.id))
      L.push(
        r.error
          ? `- ERROR ${r.error}`
          : `- ${r.line}  (${r.verdict?.mentions_questions ? 'mentions' : 'no mention'}${r.verdict?.makes_it_a_job ? ', A JOB' : ''}${r.verdict?.keeps_the_main_thing ? '' : ', loses the main thing'})`,
      );
    L.push('');
  }
const dir = join(HERE, 'out');
mkdirSync(dir, { recursive: true });
const file = join(dir, `report-${label}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`);
writeFileSync(file, L.join('\n'));
console.log(L.slice(0, 7).join('\n'));
console.log(`report: ${file}`);
