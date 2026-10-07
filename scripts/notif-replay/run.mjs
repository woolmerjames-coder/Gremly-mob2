/**
 * The evening notification's words (agent plan step 10, row 9): what the
 * notification writer (workers/inngest-jobs/notifications/copy.js) says for
 * the evening wrap up, on the models that ship, for made up evenings, with
 * the hard rules it must keep. Run before and after any change to its rules.
 *
 *   scripts/notif-replay/run.sh [--repeat n]   each evening, n times over every angle it can take
 *   scripts/notif-replay/run.sh --nudge [--repeat n]   the nudge that says what came back from
 *     Later while they were away (notifications/planner.js cameBackReason), n times each
 *   scripts/notif-replay/run.sh --summary [--repeat n]   the one push of their weekly day, for
 *     the summary alone and for the summary and the weekly review together (week/summaryPush.js)
 *
 * GEMINI_TEST_API_KEY and OPENAI_API_KEY come from the environment.
 */

import { writeCopy, COPY_PROMPT_VERSION } from '../../workers/inngest-jobs/notifications/copy.js';
import { ANGLES } from '../../workers/inngest-jobs/notifications/policy.js';
import { summaryPushData } from '../../workers/inngest-jobs/week/summaryPush.js';

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

// What came back from Later while they were away, as the sender hands it to
// the writer (notifications/send.js cameBackFacts), on made up days.
const day = (over = {}) => ({ weekday: 'Thursday', part_of_day: 'afternoon', ...over });
const NUDGES = [
  {
    id: 'one-came-back',
    names: ['plumber'],
    facts: day({ put_off_earlier_and_back_now: { count: 1, titles: ['Call the plumber'] } }),
  },
  {
    id: 'three-came-back',
    names: ['passport', 'dentist'],
    facts: day({
      weekday: 'Monday',
      put_off_earlier_and_back_now: { count: 3, titles: ['Renew passport', 'Book the dentist'] },
    }),
  },
  {
    id: 'came-back-no-names',
    names: [],
    facts: day({ weekday: 'Saturday', put_off_earlier_and_back_now: { count: 2, titles: [] } }),
  },
];

const DASH = /[–—]|--/;
const results = [];
if (args.includes('--summary')) {
  // the facts as the weekly summary's worker sends them, by where the review of the week ahead stands
  const pushes = [
    { id: 'summary-and-review', review: null, says: /\bplan|ahead|next week/i },
    { id: 'summary-alone', review: 'done', says: null },
  ];
  for (const p of pushes) {
    const { title, facts } = summaryPushData(p.review);
    for (let i = 0; i < repeat * ANGLES.good_news.length; i++) {
      const angle = ANGLES.good_news[i % ANGLES.good_news.length];
      const t0 = Date.now();
      const out = await writeCopy(env, {
        moment: 'good_news',
        angle,
        facts: { ...facts, weekday: 'Sunday', part_of_day: 'evening' },
        fallbackFacts: { goodNewsTitle: title },
      });
      const text = `${out.title} ${out.body}`;
      const timedOut = out.usedFallback && /timed out/.test(out.problem || '');
      const fails = [];
      if (out.usedFallback && !timedOut) fails.push(`fallback: ${out.problem}`);
      if (DASH.test(text)) fails.push('dash');
      // it says the week in review is ready
      if (!timedOut && !/week/i.test(text)) fails.push('does not say the week is ready');
      // and, with the review still to do, that the week ahead can be planned; never when it is done
      if (!timedOut && p.says && !p.says.test(text)) fails.push('says nothing of planning the week ahead');
      if (!p.says && /\bplan/i.test(text)) fails.push('offers planning with the review done');
      results.push({ id: p.id, angle, out, ms: Date.now() - t0, fails });
      console.log(
        `${fails.length ? 'FAIL' : 'ok  '} ${p.id} (${angle})  [${out.model || 'fixed'} ${Date.now() - t0}ms]  ${out.title ? `${out.title} | ` : ''}${out.body}${fails.length ? `  ✗ ${fails.join('; ')}` : ''}`,
      );
    }
  }
  const passed = results.filter((r) => !r.fails.length).length;
  console.log(`\n${COPY_PROMPT_VERSION}: ${passed} of ${results.length} keep every rule`);
  process.exit(0);
}
if (args.includes('--nudge')) {
  for (const n of NUDGES) {
    for (let i = 0; i < repeat; i++) {
      const t0 = Date.now();
      const out = await writeCopy(env, {
        moment: 'nudge',
        angle: 'something_waiting',
        facts: n.facts,
        reason: 'came_back',
        fallbackFacts: { cameBack: n.facts.put_off_earlier_and_back_now.count },
      });
      const text = `${out.title} ${out.body}`;
      const fails = [];
      // a slow model is not the writer's fault: the fixed line went, as it would on a phone
      const timedOut = out.usedFallback && /timed out/.test(out.problem || '');
      if (out.usedFallback && !timedOut) fails.push(`fallback: ${out.problem}`);
      if (DASH.test(text)) fails.push('dash');
      if (/\bsweep/i.test(text)) fails.push('says Sweep');
      // the voice rules: no mention of time away, no guilt, no urgency
      if (/(away|missed|while you were|been gone|overdue|behind|urgent|hurry)/i.test(text)) fails.push('time away, guilt or urgency');
      // it says what came back: by name when the facts name it
      if (!timedOut && n.names.length && !n.names.some((w) => text.toLowerCase().includes(w))) fails.push('names nothing that came back');
      results.push({ id: n.id, angle: 'something_waiting', out, ms: Date.now() - t0, fails });
      console.log(
        `${fails.length ? 'FAIL' : 'ok  '} ${n.id}  [${out.model || 'fixed'} ${Date.now() - t0}ms]  ${out.title ? `${out.title} | ` : ''}${out.body}${fails.length ? `  ✗ ${fails.join('; ')}` : ''}`,
      );
    }
  }
  const passed = results.filter((r) => !r.fails.length).length;
  console.log(`\n${COPY_PROMPT_VERSION}: ${passed} of ${results.length} keep every rule`);
  process.exit(0);
}
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
