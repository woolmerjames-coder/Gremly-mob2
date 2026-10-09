/**
 * The chat correction check's replay (workers/cortex/context/corrections.js):
 * made up conversations, the message just sent checked by the model that
 * ships, several times over, and scored by whether a correction is filed.
 * Never by wording. Every name and line here is made up.
 *
 *   scripts/chat-correction-replay/run.sh [--repeat n] [--only id,id]
 *
 * The bar, set before the runs: every scenario right on every run.
 * OPENAI_API_KEY and GEMINI_TEST_API_KEY come from the environment.
 */

import { checkForCorrection } from '../../workers/cortex/context/corrections.js';
import { configureModels } from '../../workers/cortex/models.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const repeat = Math.max(1, Number(flag('--repeat') || 3));
const only = flag('--only')?.split(',') || null;

const ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  HELPER_MODEL: 'gpt-6-luna',
  HELPER_FALLBACK_MODEL: 'gemini-3.8-flash',
  INNGEST_WORKER_URL: 'https://inngest.replay.invalid',
  INNGEST_ADMIN_KEY: 'replay',
};

const talk = (...lines) => lines.map(([who, text]) => `${who === 'g' ? 'Gremly' : 'User'}: ${text}`).join('\n\n');

const SCENARIOS = [
  {
    id: 'wrong-day',
    files: true,
    conversation: talk(['g', 'Your dentist is on Friday at ten.']),
    latest: 'No, the dentist is on Thursday, not Friday.',
  },
  {
    id: 'never-happened',
    files: true,
    conversation: talk(['g', 'How did the run on Tuesday feel?']),
    latest: 'I never went for a run on Tuesday, that was someone else.',
  },
  {
    id: 'who-someone-is',
    files: true,
    conversation: talk(['g', 'Nice that your brother Bo came round for dinner.']),
    latest: 'Bo is not my brother, he is our neighbour.',
  },
  {
    id: 'delete-it',
    files: true,
    conversation: talk(['g', 'Printer toner for the office is due by Friday.']),
    latest: 'Delete the printer toner thing, it is not important.',
  },
  {
    id: 'earlier-correction',
    files: false,
    conversation: talk(
      ['g', 'Your call with your parents is on Sunday.'],
      ['u', 'No, I moved it to Saturday, you had it wrong.'],
      ['g', 'Got it, Saturday it is.'],
    ),
    latest: 'what is on next week?',
  },
  {
    id: 'plan-they-change',
    files: false,
    conversation: talk(['g', 'Dinner with Ana is on Saturday.']),
    latest: "Let's move dinner with Ana to Sunday, she can't do Saturday any more.",
  },
  {
    id: 'how-gremly-talks',
    files: false,
    conversation: talk(['g', 'Here is your week, with everything that is coming up and a few things to think about.']),
    latest: 'Can you keep your replies shorter please?',
  },
  {
    id: 'a-question',
    files: false,
    conversation: talk(['g', 'You have a quiet afternoon.']),
    latest: 'When is my dentist appointment again?',
  },
];

const filed = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith(ENV.INNGEST_WORKER_URL)) {
    filed.push(JSON.parse(init.body));
    return new Response('{}', { status: 200 });
  }
  return realFetch(url, init);
};
configureModels(ENV);

let right = 0;
let total = 0;
for (const s of SCENARIOS.filter((x) => !only || only.includes(x.id))) {
  const marks = [];
  for (let i = 0; i < repeat; i++) {
    const before = filed.length;
    let r;
    try {
      r = await checkForCorrection({ conversationText: s.conversation, latest: s.latest, chatId: null, userId: 'replay-user', env: ENV });
    } catch (err) {
      r = { error: String(err?.message || err) };
    }
    const got = filed.length > before;
    const ok = !r?.error && got === s.files;
    total++;
    if (ok) right++;
    marks.push(ok ? 'ok' : r?.error ? `ERROR ${r.error}` : got ? 'FILED' : 'MISSED');
  }
  console.log(`${s.id} (${s.files ? 'files' : 'files nothing'}): ${marks.join(', ')}`);
}
console.log(`${right} of ${total} right`);
