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
 *   calendar        what is on their connected calendar on the days of the week:
 *                   [[day, 'HH:MM', 'HH:MM', title]], read by get_week and get_day
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
    // what matters most this week as it stands: sent by an app build that can keep a new one
    priorities: [],
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

/** One of the needs you cards talked through: the reply comes with something on the card to say yes to. */
const endsWithAnOffer = (changes) => [
  {
    name: 'Ends with a concrete offer on the card',
    ok: changes.length >= 1,
    detail: `${changes.length} on the card`,
  },
];

// Work that is not among their items, on days they name. Nobody here is real.
const UNSEEN = "Most of this week is the stock audit at work. It'll swallow Tuesday, Wednesday and Thursday";

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
    look: 'Gremly answers how they feel first. It either shapes the week around that (fewer free hours, things put off, a habit on fewer days, paused or made lighter, an intention) or holds the review to ask what would help; nothing is cancelled or marked done.',
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
        // fewer free hours, busy days, things put off, a habit on fewer days, paused or made lighter, or a gentler intention
        const eased = changes.some((c) => ['later', 'week_shape', 'habit_days', 'intention', 'ease'].includes(c.kind));
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
  // ── work Gremly cannot see ──
  // What they tell Gremly about work that is not among their items is taken in
  // as the shape of the week and as something that matters most. A todo is
  // made only for a specific task they name, and never for something that is
  // already on their calendar.
  {
    ...base,
    id: 'week-unseen-work',
    title: 'In the review: work Gremly cannot see takes days out of the week',
    look: 'The audit becomes the shape of the week (Tuesday to Thursday busy) and one of the things that matter most. No todo is made for it.',
    text: UNSEEN,
    week: review('shape'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [
        { kinds: ['week_shape'], busy: [TUE, WED, THU] },
        { kinds: ['priority'], title: 'audit' },
      ],
      forbid: ['create_todo', 'add_block', 'cancel', 'complete'],
    },
  },
  {
    ...base,
    id: 'week-unseen-work-no-days',
    title: 'In the review: a heavy week at work, with no days named',
    look: 'The stocktaking goes on what matters most. No todo is made for it, and no day they did not name is marked busy.',
    text: "I've also got a lot of stocktaking to get through this week",
    week: review('needs_you'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['priority'], title: 'stocktaking' }],
      forbid: ['create_todo', 'add_block', 'cancel', 'complete'],
      check: (changes) => {
        const busy = changes.find((c) => c.kind === 'week_shape')?.busy_days || [];
        return [
          { level: 'warn', name: 'No day is marked busy that they did not name', ok: !busy.length, detail: busy.join(', ') },
        ];
      },
    },
  },
  {
    ...base,
    id: 'week-unseen-work-and-a-task',
    title: 'In the review: unseen work, and one specific task for it',
    look: 'The audit shapes the week. The one thing they named to do, sending the sample list, is the only new todo, on a day before the audit starts.',
    text: 'The stock audit takes up Tuesday to Thursday, and I need to send Priya the sample list before it starts',
    week: review('ahead'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [
        { kinds: ['create_todo'], title: 'sample', dayBy: TUE },
        { kinds: ['week_shape'], busy: [TUE, WED, THU] },
      ],
      forbid: ['add_block', 'cancel', 'complete'],
      check: (changes) => {
        const made = changes.filter((c) => c.kind === 'create_todo');
        return [
          { name: 'One new item, for the task they named', ok: made.length === 1, detail: made.map((c) => c.title).join('; ') },
        ];
      },
    },
  },
  // The same in other words, so a wording is not fitted to one message: a
  // task with nothing said of when, and a task for the load itself.
  {
    ...base,
    id: 'week-unseen-work-and-a-task-undated',
    title: 'In the review: unseen work, and a task with no day said',
    look: 'The trade fair makes Thursday and Friday busy. Renewing the stand insurance is the only new todo.',
    text: 'The trade fair has me out all of Thursday and Friday. Also I need to renew the stand insurance',
    week: review('shape'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [
        { kinds: ['create_todo'], title: 'insurance' },
        { kinds: ['week_shape'], busy: [THU, FRI] },
      ],
      forbid: ['add_block', 'cancel', 'complete'],
      check: (changes) => {
        const made = changes.filter((c) => c.kind === 'create_todo');
        return [
          { name: 'One new item, for the task they named', ok: made.length === 1, detail: made.map((c) => c.title).join('; ') },
        ];
      },
    },
  },
  {
    ...base,
    id: 'week-unseen-work-and-a-task-for-it',
    title: 'In the review: unseen work, and a task that gets them ready for it',
    look: 'The inspection makes Wednesday and Thursday busy. Printing the seating plans is the only new todo, on a day before it.',
    text: 'This week is mostly the school inspection on Wednesday and Thursday, and I still have to print the seating plans for it',
    week: review('priorities'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [
        { kinds: ['create_todo'], title: 'seating', dayBy: WED },
        { kinds: ['week_shape'], busy: [WED, THU] },
      ],
      forbid: ['add_block', 'cancel', 'complete'],
      check: (changes) => {
        const made = changes.filter((c) => c.kind === 'create_todo');
        return [
          { name: 'One new item, for the task they named', ok: made.length === 1, detail: made.map((c) => c.title).join('; ') },
        ];
      },
    },
  },
  {
    ...base,
    id: 'week-already-on-calendar',
    title: 'In the review: what they mention is already on their calendar',
    look: 'The audit kickoff is on their calendar on Tuesday morning. Nothing new is made to stand for it.',
    text: "Tuesday morning is the audit kickoff, so I won't get anything else done then",
    calendar: [
      [TUE, '10:00', '12:00', 'Stock audit kickoff'],
      [WED, '14:00', '16:00', 'Stock audit walkthrough'],
    ],
    week: review('ahead'),
    expect: {
      aboutDay: true,
      structureOnly: true,
      forbid: ['create_todo', 'add_block', 'cancel', 'complete'],
    },
  },
  {
    ...base,
    id: 'week-unseen-work-old-build',
    title: 'An app build that cannot keep a new priority is never shown one',
    look: 'The same message from a build that sends no priorities: the days become busy, no priority is on the card, and no todo is made.',
    text: UNSEEN,
    week: review('shape', {}, { priorities: undefined }),
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['week_shape'], busy: [TUE, WED, THU] }],
      forbid: ['priority', 'create_todo', 'add_block', 'cancel', 'complete'],
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
    expect: {
      aboutDay: true,
      structureOnly: true,
      forbid: ['cancel', 'complete'],
      maxChanges: 2,
      check: endsWithAnOffer,
    },
  },
  // Talking one through ends with something to say yes to (James, 9 October):
  // their answer to Gremly's question, as typed or as one of the card's
  // answers tapped, comes back with a change on the card.
  {
    ...base,
    id: 'week-talk-answer-tapped',
    title: 'In the review: an answer tapped under the question',
    look: 'The garage todo they opened: a way to do it a bit at a time is on the card.',
    text: 'Doing it a bit at a time',
    week: review('needs_you', {
      about: {
        title: 'Clear out the garage',
        item_ids: ['garage'],
        stuck_because: 'It takes two hours and has been moved five times',
        question: 'What would make this one easier to start?',
      },
    }),
    expect: {
      aboutDay: true,
      structureOnly: true,
      forbid: ['cancel', 'complete'],
      maxChanges: 3,
      check: endsWithAnOffer,
    },
  },
  {
    ...base,
    id: 'week-talk-waiting-on-something',
    title: 'In the review: what is in the way is something else to do first',
    look: 'The passport todo they opened: what has to come first is offered, or a day that fits it.',
    text: 'I need new photos before I can send it off',
    week: review('needs_you', {
      about: {
        title: 'Renew passport',
        item_ids: ['passport'],
        stuck_because: 'It has been moved four times',
        question: 'What is in the way of renewing it?',
      },
    }),
    expect: {
      aboutDay: true,
      structureOnly: true,
      forbid: ['cancel', 'complete'],
      maxChanges: 3,
      check: endsWithAnOffer,
    },
  },
  {
    ...base,
    id: 'week-talk-no-longer-matters',
    title: 'In the review: they say it no longer matters',
    look: 'The plants todo they opened: letting it go, or putting it off, is on the card.',
    text: "Honestly I don't think it matters any more",
    week: review('needs_you', {
      about: {
        title: 'Repot the plants',
        item_ids: ['plants'],
        stuck_because: 'It has been on the list since the spring',
        question: 'Is this still something you want to do?',
      },
    }),
    expect: { aboutDay: true, structureOnly: true, maxChanges: 2, check: endsWithAnOffer },
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
  // A habit paused, given a lighter version or set back to usual (the change
  // model's ease). It is offered only to an app build that sends the habits
  // eased now with their week (week.eased), so the first of these is a build
  // that does not.
  {
    ...thursday,
    id: 'ease-old-build',
    noEase: true,
    title: 'A pause asked of a build that cannot make one',
    look: 'No pause goes on the card, since this build could not apply it. Strength may come off its days this week, or Gremly says what he can do; nothing is stopped for good.',
    text: 'Work is flat out. Can we pause strength until next week?',
    expect: { aboutDay: true, forbid: ['ease', 'cancel'], maxChanges: 1 },
  },
  {
    ...thursday,
    id: 'ease-pause-week',
    title: 'A habit paused for the rest of the week',
    look: 'One row pauses Strength from today to Sunday. The habit itself is not stopped, and nothing else changes.',
    text: 'Work is flat out. Can we pause strength until next week?',
    week: { ...thursday.week, eased: [] },
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['ease'], id: 'strength', mode: 'pause', day: THU, until: NEXT_SUN }],
      forbid: ['cancel', 'skip_habit'],
      maxChanges: 1,
    },
  },
  {
    ...thursday,
    id: 'ease-lighter-words',
    title: 'A lighter version, in their words',
    look: 'One row gives Strength a lighter version to the end of the week, with what they said it is. Its days stay.',
    text: 'For the rest of this week can strength just be ten minutes of bodyweight at home?',
    week: { ...thursday.week, eased: [] },
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['ease'], id: 'strength', mode: 'lighter', until: NEXT_SUN }],
      forbid: ['cancel', 'skip_habit', 'habit_days'],
      maxChanges: 1,
      check: (changes) => {
        const note = String(changes.find((c) => c.kind === 'ease')?.note || '').toLowerCase();
        return [{ name: 'The lighter version is in their words', ok: note.includes('bodyweight'), detail: note }];
      },
    },
  },
  {
    ...thursday,
    id: 'ease-back-to-usual',
    title: 'A pause ended',
    look: 'One row sets Stretch back to usual. Nothing is asked first: the pause is in what Gremly knows.',
    text: "I'm ready to start stretching again",
    items: thursday.items.map((x) => (x.id === 'stretch' ? { ...x, note: 'paused for now' } : x)),
    week: {
      ...thursday.week,
      eased: [{ habit_id: 'stretch', title: 'Stretch', mode: 'pause', first: MON, last: addDay(NEXT_SUN, 7), note: '' }],
    },
    expect: {
      aboutDay: true,
      structureOnly: true,
      changes: [{ kinds: ['ease'], id: 'stretch', mode: 'usual' }],
      forbid: ['cancel'],
      maxChanges: 1,
    },
  },
  {
    ...thursday,
    id: 'ease-paused-left-alone',
    title: 'A paused habit is left alone',
    look: 'Gremly says what is on today without putting the paused Stretch on it or nudging them about it. Nothing is changed; an offer to plan the day is fine.',
    text: "What's on today?",
    items: thursday.items.map((x) => (x.id === 'stretch' ? { ...x, note: 'paused for now' } : x)),
    week: {
      ...thursday.week,
      eased: [{ habit_id: 'stretch', title: 'Stretch', mode: 'pause', first: MON, last: NEXT_SUN, note: '' }],
    },
    expect: {
      aboutDay: true,
      maxChanges: 1,
      forbid: ['ease', 'skip_habit', 'habit_days', 'cancel', 'complete'],
      // saying Stretch is paused is true and fine; what it must not be is on the card
      mentions: ['strength'],
    },
  },
  {
    ...thursday,
    id: 'ease-skip-is-still-skip',
    title: 'Leaving a habit out for today alone is still a skip',
    look: 'Strength is skipped for today or moved to another day. It is not paused, and not stopped.',
    text: 'Not doing strength today',
    week: { ...thursday.week, eased: [] },
    expect: { aboutDay: true, forbid: ['cancel', 'ease'], maxChanges: 1 },
  },
  {
    ...base,
    id: 'ease-review-week-off',
    title: 'In the review: a habit left alone for the week being planned',
    look: 'Run is paused for the days being planned, or taken off them. It is not stopped for good, and nothing else changes.',
    text: 'I want a week off running. Leave it out of next week completely',
    week: { ...review('board'), eased: [] },
    expect: {
      aboutDay: true,
      structureOnly: true,
      forbid: ['cancel'],
      maxChanges: 1,
      check: (changes) => {
        const c = changes.find((x) => x.id === 'run');
        const paused = c?.kind === 'ease' && c.mode === 'pause' && c.day >= MON && c.until <= NEXT_SUN;
        const off = c?.kind === 'habit_days' && !(c.days || []).length;
        return [{ name: 'Run is paused for those days, or on none of them', ok: paused || off, detail: JSON.stringify(c || null) }];
      },
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
    priorities: [],
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
