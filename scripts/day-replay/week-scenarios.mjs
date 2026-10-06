/**
 * The weekly review's interjections: messages typed while a review is under
 * way in today's thread, and a few about the week on an ordinary day, run
 * through the agent's replay (run-agent.mjs) with the person's week set as
 * the app sends it (workers/cortex/agent/brief.js readWeek).
 *
 * Every person, item and date here is made up. The checks look at what was
 * proposed and at whether the review was held or the week's button offered,
 * never at the words of the reply (expect.structureOnly).
 *
 * A scenario is one of scenarios.mjs's, plus:
 *   week            the app's week block, with item ids as the scenario names them
 *   plans           habit days saved: [[habit id, 'YYYY-MM-DD']]
 *   intention       the intention of the week the day is in, as the day request sends it
 *   an item may carry towards, the goal a milestone step is a step towards,
 *   and a habit per_week, how many times a week it is for (daily without it)
 *   an item may carry back_on, the day it comes back when it is put off
 * and expect may carry:
 *   structureOnly   skip every check on the reply's wording
 *   hold            true or false: whether the review was held on its step
 *   offer           true or false: whether the week's button was offered
 *   tools           tools the turn must have used
 *   check           (changes, out) => [{ name, ok, detail, level }]: the scenario's own checks
 * A wanted change may also say days (the exact list), busy (days that must be
 * among the busy days), weekday, dayBy (on or before) and dayAfter (after).
 */

// The week being planned: Monday 5 to Sunday 11 October 2026, on Sunday the 4th.
const SUN = '2026-10-04';
const MON = '2026-10-05';
const TUE = '2026-10-06';
const WED = '2026-10-07';
const THU = '2026-10-08';
const FRI = '2026-10-09';
const SAT = '2026-10-10';
const NEXT_SUN = '2026-10-11';

const ITEMS = [
  { id: 'report', kind: 'todo', title: 'Write the quarterly report', due_day: FRI, minutes: 180, note: 'upcoming' },
  { id: 'deck', kind: 'todo', title: 'Send the partner deck', due_day: MON, minutes: 60, note: 'upcoming' },
  { id: 'taxes', kind: 'todo', title: 'Do taxes', due_day: TUE, minutes: 60, note: 'upcoming' },
  { id: 'vet', kind: 'todo', title: 'Book the vet for Bella', due_day: WED, minutes: 15, note: 'upcoming' },
  { id: 'passport', kind: 'todo', title: 'Renew passport', due_day: THU, minutes: 30, note: 'upcoming' },
  { id: 'gift', kind: 'todo', title: 'Find a present for Sam', due_day: THU, minutes: 45, note: 'upcoming' },
  { id: 'garage', kind: 'todo', title: 'Clear out the garage', due_day: SAT, minutes: 120, note: 'upcoming' },
  { id: 'plants', kind: 'todo', title: 'Repot the plants', due_day: SAT, minutes: 30, note: 'upcoming' },
  { id: 'accountant', kind: 'todo', title: 'Sort out the accountant', minutes: 30, note: 'no day' },
  { id: 'run', kind: 'habit', title: 'Run', minutes: 30, note: 'habit' },
  { id: 'stretch', kind: 'habit', title: 'Stretch', minutes: 10, note: 'habit today' },
];

const CHALLENGE = {
  headline: 'The quarterly report is due Friday and there is no room around it',
  why: 'It needs about three hours and has been moved four times, and Thursday already holds the passport and the present for Sam.',
};

const PICKS = [
  { text: 'Write the quarterly report', item_ids: ['report'] },
  { text: 'Send the partner deck', item_ids: ['deck'] },
  { text: 'Renew passport', item_ids: ['passport'] },
];

/** The app's week block with a review under way at a step. */
function review(step, under = {}, over = {}) {
  return {
    weekly_day: 0,
    days_off: [6, 0],
    review: { week_start: MON, span_start: MON, status: 'started', kind: 'weekly' },
    extra_used: false,
    hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
    busy_days: [],
    intention: null,
    ...over,
    under_way: {
      step,
      first: MON,
      last: NEXT_SUN,
      week_start: MON,
      challenge: CHALLENGE,
      picks: PICKS,
      settled: [],
      habit_days: [{ id: 'run', days: [MON, WED, SAT] }],
      ...under,
    },
  };
}

const base = {
  today: SUN,
  at: '18:30',
  items: ITEMS,
  meetings: [],
  record: { travel: null, blocks: [] },
  plan: null,
};

// An ordinary Thursday, with what their week put on it: a habit they planned
// for today, a step of a milestone, and a todo back from being put off. The
// notes are the ones the app sends (lib/brief/useDayTurn.ts DAY_NOTES).
const thursday = {
  today: THU,
  at: '08:30',
  items: [
    { id: 'strength', kind: 'habit', title: 'Strength', minutes: 45, per_week: 3, note: 'planned for today in their week' },
    { id: 'stretch', kind: 'habit', title: 'Stretch', minutes: 10, note: 'habit today' },
    {
      id: 'letter',
      kind: 'todo',
      title: 'Draft the cover letter',
      due_day: THU,
      minutes: 30,
      note: 'due today',
      towards: 'Send the grant application',
    },
    { id: 'plumber', kind: 'todo', title: 'Call the plumber', minutes: 15, note: 'put off earlier, back today', back_on: THU },
    { id: 'garage', kind: 'todo', title: 'Clear out the garage', due_day: SAT, minutes: 120, note: 'upcoming' },
    { id: 'pensions', kind: 'todo', title: 'Look at pensions', minutes: 30, note: `put off until ${addDay(THU, 12)}`, back_on: addDay(THU, 12) },
  ],
  plans: [
    ['strength', MON],
    ['strength', THU],
  ],
  intention: 'Send the grant, and keep moving',
  meetings: [['10:00', '10:30', 'Team huddle']],
  record: { travel: null, blocks: [] },
  plan: null,
  week: {
    weekly_day: 0,
    days_off: [6, 0],
    review: { week_start: MON, span_start: MON, status: 'done', kind: 'weekly' },
    extra_used: false,
    hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
    busy_days: [],
    intention: { id: null, text: 'Send the grant, and keep moving' },
  },
};

export const WEEK_SCENARIOS = [
  {
    ...base,
    id: 'week-visitor-days-out',
    title: 'In the review: a visitor takes days out of the week',
    look: 'Thursday to Saturday become busy days on the card.',
    text: "My sister's staying Thursday to Saturday so I won't get much done those days",
    week: review('shape'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['week_shape'], busy: [THU, FRI, SAT] }],
      forbid: ['cancel', 'complete'],
    },
  },
  {
    ...base,
    id: 'week-new-deadline',
    title: 'In the review: a deadline they had forgotten',
    look: 'The grant application is offered as a todo with Friday as its deadline or a day before it.',
    text: 'Oh no, I forgot the grant application is due on Friday',
    week: review('priorities'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['create_todo'], title: 'grant', dayBy: FRI }],
      forbid: ['cancel', 'complete'],
      maxChanges: 3,
    },
  },
  {
    ...base,
    id: 'week-worn-out',
    title: 'In the review: they are worn out',
    look: 'Gremly answers how they feel first. It either shapes the week around that (fewer free hours, things put off, a habit on fewer days, an intention) or holds the review to ask what would help; nothing is cancelled or marked done.',
    text: "Honestly I'm exhausted. Last week completely wiped me out",
    week: review('shape'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      forbid: ['cancel', 'complete'],
      check: (changes, out) => {
        const shape = changes.find((c) => c.kind === 'week_shape');
        const before = { normal_day: 2, busy_day: 1, weekend_day: 4 };
        const raised = Object.entries(shape?.hours || {}).filter(([k, v]) => v > before[k]);
        // fewer free hours, busy days, things put off, a habit on fewer days, or a gentler intention
        const eased = changes.some((c) => ['later', 'week_shape', 'habit_days', 'intention'].includes(c.kind));
        return [
          { name: 'No free hours are raised', ok: !raised.length, detail: JSON.stringify(shape?.hours) },
          {
            name: 'Shapes the week around it, or holds the review to ask',
            ok: eased || out.hold,
            detail: `hold ${out.hold}; ${changes.map((c) => c.kind).join(', ') || 'no changes'}`,
          },
        ];
      },
    },
  },
  {
    ...base,
    id: 'week-question-in-context',
    title: 'In the review: a question the context answers',
    look: 'Answered from what the review holds; nothing on the card and the review carries on.',
    text: 'Sorry, which days are we planning here?',
    week: review('challenge'),
    expect: { aboutDay: true, structureOnly: true, maxChanges: 0, hold: false, offer: false },
  },
  {
    ...base,
    id: 'week-habit-day-moved',
    title: 'In the review: a habit day moved',
    look: 'Run goes on Monday, Thursday and Saturday: Wednesday moved to Thursday, the other days kept.',
    text: 'Can you move my Wednesday run to Thursday?',
    week: review('board'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['habit_days'], id: 'run', days: [MON, THU, SAT] }],
      maxChanges: 1,
      hold: false,
    },
  },
  {
    ...base,
    id: 'week-challenge-corrected',
    title: 'In the review: the challenge is wrong',
    look: 'The report leaves this week on the card, for the 23rd or a day before it; nothing else changes.',
    text: "That's not right, the report isn't due this week any more. It got pushed to the 23rd",
    week: review('challenge'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['move_day', 'deadline', 'later'], id: 'report', dayAfter: NEXT_SUN, dayBy: '2026-10-23' }],
      forbid: ['cancel', 'complete'],
      maxChanges: 1,
    },
  },
  {
    ...base,
    id: 'week-put-off',
    title: 'In the review: something put off for later',
    look: 'Clear out the garage is put off, with a day it comes back after this week and within four weeks.',
    text: "The garage isn't happening this week. Put it off for a couple of weeks",
    week: review('board'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['later'], id: 'garage', dayAfter: NEXT_SUN, dayBy: '2026-11-01' }],
      forbid: ['cancel', 'complete'],
      maxChanges: 1,
    },
  },
  {
    ...base,
    id: 'week-how-full-is-a-day',
    title: 'In the review: how full a day is',
    look: 'Reads the week board rather than adding it up, and changes nothing.',
    text: "How's Thursday looking?",
    week: review('board', {
      placed: [
        { id: 'passport', day: THU },
        { id: 'gift', day: THU },
        { id: 'taxes', day: THU },
      ],
    }),
    expect: { aboutDay: true, structureOnly: true, tools: ['get_week'], maxChanges: 0, hold: false },
  },
  {
    ...base,
    id: 'week-talk-it-through',
    title: 'In the review: talking one through',
    look: 'Helps with the accountant todo they opened; nothing is cancelled or marked done.',
    text: "I keep putting it off because I don't know who to ask",
    week: review('needs_you', {
      about: {
        title: 'Sort out the accountant',
        item_ids: ['accountant'],
        stuck_because: 'It has no day and has been moved six times',
        question: 'What is the first small step?',
      },
    }),
    expect: { aboutDay: true, structureOnly: true, forbid: ['cancel', 'complete'], maxChanges: 2 },
  },
  {
    ...base,
    id: 'week-midweek-days-left',
    title: 'A review that starts midweek plans only the days left',
    look: 'A run asked for on Monday, which has gone: nothing is planned outside Wednesday to Sunday.',
    today: WED,
    at: '08:10',
    text: 'Put a run on Monday and one on Friday',
    week: review(
      'board',
      { first: WED, last: NEXT_SUN, week_start: MON, habit_days: [{ id: 'run', days: [] }] },
      { review: { week_start: MON, span_start: WED, status: 'started', kind: 'extra' } },
    ),
    expect: {
      aboutDay: true,
      structureOnly: true,
      maxChanges: 1,
      check: (changes) => {
        const days = changes.filter((c) => c.kind === 'habit_days').flatMap((c) => c.days || []);
        return [
          {
            name: 'No habit day outside Wednesday to Sunday',
            ok: days.every((d) => d >= WED && d <= NEXT_SUN),
            detail: days.join(', '),
          },
        ];
      },
    },
  },
  {
    ...base,
    id: 'week-ask-to-plan',
    title: 'An ordinary day: they ask to plan their week',
    look: "The week's button goes under the reply; Gremly does not plan the week in the reply or on a card.",
    today: MON,
    at: '08:30',
    text: 'Can we plan my week?',
    week: {
      weekly_day: 0,
      days_off: [6, 0],
      review: null,
      extra_used: false,
      hours: null,
      busy_days: [],
      intention: null,
    },
    expect: { aboutDay: true, structureOnly: true, offer: true, maxChanges: 0 },
  },
  {
    ...base,
    id: 'week-extra-used',
    title: 'An ordinary day: another review, with the extra used',
    look: 'Gremly says the extra review is used and when the next one is. At most it offers to move their weekly day.',
    today: THU,
    at: '09:00',
    text: 'Can I do another weekly review today?',
    week: {
      weekly_day: 0,
      days_off: [6, 0],
      review: { week_start: MON, span_start: WED, status: 'done', kind: 'extra' },
      extra_used: true,
      hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
      busy_days: [],
      intention: { id: null, text: 'One thing at a time' },
    },
    expect: {
      aboutDay: true,
      structureOnly: true,
      maxChanges: 1,
      check: (changes) => [
        {
          name: 'Any change is the weekly day',
          ok: changes.every((c) => c.kind === 'weekly_day'),
          detail: changes.map((c) => c.kind).join(', '),
        },
        {
          name: 'Offers to move the weekly day',
          ok: changes.some((c) => c.kind === 'weekly_day'),
          detail: changes.map((c) => `${c.kind}:${c.weekday}`).join(', '),
        },
      ],
    },
  },
  {
    ...base,
    id: 'week-move-weekly-day',
    title: 'An ordinary day: they move their weekly day',
    look: 'The weekly day moves to Wednesday on the card.',
    today: TUE,
    at: '12:15',
    text: "Sundays don't work for me. Can we do the weekly review on Wednesdays instead?",
    week: {
      weekly_day: 0,
      days_off: [6, 0],
      review: { week_start: MON, span_start: MON, status: 'done', kind: 'weekly' },
      extra_used: false,
      hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
      busy_days: [],
      intention: null,
    },
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['weekly_day'], weekday: 3 }],
      maxChanges: 1,
    },
  },
  // ── An ordinary day, with what their week put on it (the day request's facts) ──
  {
    ...thursday,
    id: 'week-day-whats-on',
    title: 'An ordinary day: what is on, with their week in it',
    look: 'Gremly covers what they planned for today in their week: strength, the cover letter as a step towards the grant, and the plumber, which is back from being put off. Nothing is proposed.',
    text: "What's on for me today?",
    expect: { aboutDay: true, maxChanges: 0, mentions: ['strength', 'cover letter', 'plumber'] },
  },
  {
    ...thursday,
    id: 'week-day-move-planned-habit',
    title: 'An ordinary day: the habit planned for today moves',
    look: 'Strength comes off Thursday and goes on Saturday, on the card. The days from today on are the ones the card states.',
    text: "I can't face strength today. Can it go on Saturday instead?",
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['habit_days'], id: 'strength' }],
      maxChanges: 1,
      check: (changes) => {
        const days = changes.find((c) => c.kind === 'habit_days')?.days || [];
        return [
          { name: 'Strength is on Saturday', ok: days.includes(SAT), detail: days.join(', ') },
          { name: 'Strength is off Thursday', ok: !days.includes(THU), detail: days.join(', ') },
        ];
      },
    },
  },
  {
    ...thursday,
    id: 'week-day-step-towards',
    title: 'An ordinary day: why a milestone step is on today',
    look: 'Gremly says the cover letter is a step towards sending the grant application. Nothing is proposed.',
    text: 'Why is the cover letter on today?',
    expect: { aboutDay: true, maxChanges: 0, mentions: ['grant'] },
  },
  {
    ...thursday,
    id: 'week-day-intention',
    title: 'An ordinary day: they ask what the week was about',
    look: 'Gremly gives their intention back in their own words. Nothing is proposed.',
    text: 'Remind me what I said this week was about?',
    expect: { aboutDay: true, maxChanges: 0, mentions: ['keep moving'] },
  },
  {
    ...thursday,
    id: 'week-day-intention-left-alone',
    title: 'An ordinary day: a plain change, with an intention set',
    look: 'The plumber moves to tomorrow on the card. The reply is about that, and does not recite their intention.',
    text: 'Move the plumber to tomorrow',
    expect: {
      aboutDay: true,
      changes: [{ kinds: ['move_day'], id: 'plumber', day: FRI }],
      maxChanges: 1,
      check: (_changes, out) => [
        {
          name: 'Reply does not recite the intention',
          ok: !String(out.reply || '').toLowerCase().includes('keep moving'),
          detail: out.reply || '',
          level: 'warn',
        },
      ],
    },
  },
];

/**
 * The week an ordinary day's scenario is run with under --with-week: the
 * review for the week done and nothing under way, so the day's scenarios are
 * checked with the week's tools on as well as without them.
 */
export function plainWeek(today) {
  return {
    weekly_day: 0,
    days_off: [6, 0],
    review: { week_start: mondayOf(today), span_start: mondayOf(today), status: 'done', kind: 'weekly' },
    extra_used: false,
    hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
    busy_days: [],
    intention: null,
  };
}

/** A day some days after another. */
function addDay(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday that starts the week a day's review plans, with Sunday as the weekly day. */
function mondayOf(day) {
  const d = new Date(`${day}T12:00:00Z`);
  const since = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - since + 1);
  return d.toISOString().slice(0, 10);
}
