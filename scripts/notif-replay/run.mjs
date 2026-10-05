/**
 * The evening notification's words (agent plan step 10, row 9): what the
 * notification writer (workers/inngest-jobs/notifications/copy.js) says for
 * the evening wrap up, on the models that ship, for made up evenings, with
 * the hard rules it must keep. Run before and after any change to its rules.
 *
 *   scripts/notif-replay/run.sh [--repeat n]   each evening, n times over every angle it can take
 *
 * GEMINI_TEST_API_KEY and OPENAI_API_KEY come from the environment.
 */

import { writeCopy, COPY_PROMPT_VERSION } from '../../workers/inngest-jobs/notifications/copy.js';
import { ANGLES } from '../../workers/inngest-jobs/notifications/policy.js';

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
  // nights with nothing to sort: the look back, habits and the journal are still there
  {
    id: 'clear-quiet-day',
    facts: {
      weekday: 'Tuesday',
      part_of_day: 'evening',
      meetings_today: 1,
      first_meeting: '11:00',
      due_today: 1,
      due_today_titles: ['Call the bank'],
      habits_today: 2,
      dated_today: [],
      waiting_in_sweep: 0,
      gremly_age: 'young',
    },
  },
  {
    id: 'clear-birthday',
    facts: {
      weekday: 'Friday',
      part_of_day: 'evening',
      meetings_today: 0,
      first_meeting: null,
      due_today: 0,
      due_today_titles: [],
      habits_today: 1,
      dated_today: ["Jo's birthday"],
      waiting_in_sweep: 0,
      gremly_age: 'young',
    },
  },
];

const DASH = /[–—]|--/;
const results = [];
// every angle the evening can take (notifications/policy.js), in turn
const angles = ANGLES.sweep;
for (const e of EVENINGS) {
  for (let i = 0; i < repeat * angles.length; i++) {
    const angle = angles[i % angles.length];
    const t0 = Date.now();
    const out = await writeCopy(env, { moment: 'sweep', angle, facts: e.facts });
    const text = `${out.title} ${out.body}`;
    const fails = [];
    if (out.usedFallback) fails.push(`fallback: ${out.problem}`);
    if (/\bsweep/i.test(text)) fails.push('says Sweep');
    if (DASH.test(text)) fails.push('dash');
    // nothing to sort: never speak of things waiting
    if (e.facts.waiting_in_sweep === 0 && /\b(waiting|to sort|to settle|cards?)\b/i.test(text)) fails.push('speaks of things waiting');
    results.push({ id: e.id, angle, out, ms: Date.now() - t0, fails });
    console.log(
      `${fails.length ? 'FAIL' : 'ok  '} ${e.id} (${angle})  [${out.model || 'fixed'} ${Date.now() - t0}ms]  ${out.title ? `${out.title} | ` : ''}${out.body}${fails.length ? `  ✗ ${fails.join('; ')}` : ''}`,
    );
  }
}
const pass = results.filter((r) => !r.fails.length).length;
console.log(`\n${COPY_PROMPT_VERSION}: ${pass} of ${results.length} keep every rule`);
