/**
 * The evening notification's words (agent plan step 10, row 9): what the
 * notification writer (workers/inngest-jobs/notifications/copy.js) says for
 * the evening wrap up, on the models that ship, for made up evenings, with
 * the hard rules it must keep. Run before and after any change to its rules.
 *
 *   scripts/notif-replay/run.sh [--repeat n]
 *
 * GEMINI_TEST_API_KEY and OPENAI_API_KEY come from the environment.
 */

import { writeCopy, COPY_PROMPT_VERSION } from '../../workers/inngest-jobs/notifications/copy.js';

const args = process.argv.slice(2);
const repeat = Math.max(1, Number(args[args.indexOf('--repeat') + 1] || 2));
const env = {
  GEMINI_API_KEY: process.env.GEMINI_TEST_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

const EVENINGS = [
  {
    id: 'cards-busy-day',
    facts: {
      weekday: 'Wednesday',
      part_of_day: 'evening',
      meetings_today: 6,
      first_meeting: '9:00',
      due_today: 2,
      due_today_titles: ['Send the board deck', 'Book the car service'],
      habits_today: 2,
      dated_today: [],
      waiting_in_sweep: 4,
      gremly_age: 'young',
    },
  },
  {
    id: 'cards-travel-day',
    facts: {
      weekday: 'Sunday',
      part_of_day: 'evening',
      meetings_today: 1,
      first_meeting: '3:55',
      due_today: 0,
      due_today_titles: [],
      habits_today: 3,
      dated_today: ['Flight home'],
      travel_today: { what: 'Flying home from Lisbon', sets_off: '1:30' },
      waiting_in_sweep: 2,
      gremly_age: 'young',
    },
  },
  {
    id: 'one-card',
    facts: {
      weekday: 'Monday',
      part_of_day: 'evening',
      meetings_today: 2,
      first_meeting: '10:00',
      due_today: 1,
      due_today_titles: ['Pay the water bill'],
      habits_today: 1,
      dated_today: [],
      waiting_in_sweep: 1,
      gremly_age: 'young',
    },
  },
];

const DASH = /[–—]|--/;
const results = [];
for (const e of EVENINGS) {
  for (let i = 0; i < repeat; i++) {
    const t0 = Date.now();
    const out = await writeCopy(env, { moment: 'sweep', angle: 'something_waiting', facts: e.facts });
    const text = `${out.title} ${out.body}`;
    const fails = [];
    if (out.usedFallback) fails.push(`fallback: ${out.problem}`);
    if (/\bsweep/i.test(text)) fails.push('says Sweep');
    if (DASH.test(text)) fails.push('dash');
    results.push({ id: e.id, out, ms: Date.now() - t0, fails });
    console.log(
      `${fails.length ? 'FAIL' : 'ok  '} ${e.id}  [${out.model || 'fixed'} ${Date.now() - t0}ms]  ${out.title ? `${out.title} | ` : ''}${out.body}${fails.length ? `  ✗ ${fails.join('; ')}` : ''}`,
    );
  }
}
const pass = results.filter((r) => !r.fails.length).length;
console.log(`\n${COPY_PROMPT_VERSION}: ${pass} of ${results.length} keep every rule`);
