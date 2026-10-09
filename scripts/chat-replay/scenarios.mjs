/**
 * Ask Gremly's agent lane replay (agent plan step 9, "Chat's replay"): the
 * kinds of message triage sends to the agent, lookups and changes, modelled on
 * real ones with every name, item and calendar entry made up, each with the
 * exchange before it and the items it needs standing in for the database. Today is Saturday 3 October 2026, 10am in San Francisco.
 *
 * expect: rows (exact number of card rows), minRows / maxRows, row (every
 * row must pass), some (at least one row must pass), mentions (the reply must
 * match), notSaid (the reply must not match), askOrRows (a question with no
 * card also passes).
 */

export const TODAY = '2026-10-03';
export const NOW_ISO = '2026-10-03T17:00:00Z';

export const SCENARIOS = [
  {
    id: 'vet-friday',
    kind: 'Change an existing item',
    text: 'I need to change the vet appointment to friday',
    items: [{ id: 'vet', kind: 'todo', title: 'Take Pepper to the Vet', due_day: '2026-10-05', due_time: '10:00' }],
    expect: { rows: 1, row: (c) => c.op === 'change' && c.id === 'vet' && c.fields?.day === '2026-10-09' },
  },
  {
    id: 'sage-email',
    kind: 'Change an existing item',
    text: 'Can you push the budget email to Thursday?',
    items: [{ id: 'sage', kind: 'todo', title: 'Send the budget email', due_day: '2026-10-03' }],
    expect: { rows: 1, row: (c) => c.op === 'change' && c.id === 'sage' && c.fields?.day === '2026-10-08' },
  },
  {
    id: 'remind-mum',
    kind: 'Something new to keep',
    text: 'Can you remind me to call mum on Sunday?',
    items: [],
    expect: {
      // asking what time to remind them is fair: a reminder needs one, and Sunday has a flight
      askOrRows: true,
      rows: 1,
      row: (c) => c.op === 'add' && c.type === 'todo' && c.fields?.day === '2026-10-04',
    },
  },
  {
    id: 'weekly-habit',
    kind: 'A new habit',
    text: 'I want to set a weekly habit, on a Saturday, to call my Mum',
    items: [],
    expect: { rows: 1, row: (c) => c.op === 'add' && c.type === 'habit' },
  },
  {
    id: 'mexico-note',
    kind: 'Add to a note',
    text: 'Add to the Mexico note: look at the Porto to Sagres flight instead of the bus',
    items: [
      {
        id: 'mex',
        kind: 'note',
        title: 'Mexico trip ideas',
        body: 'Mexico City, Porto, Sagres. The bus from Porto to the coast takes nine hours.',
      },
    ],
    expect: {
      rows: 1,
      // the line added and nothing replaced: an append, or a full text that keeps the old line
      row: (c) => {
        if (c.op !== 'change' || c.id !== 'mex') return false;
        const text = c.fields?.text ?? c.fields?.body;
        const flight = (t) => /fl(y|ight)/i.test(t) && /Sagres/i.test(t);
        if (text && typeof text === 'object' && 'add' in text) return flight(String(text.add));
        const all = JSON.stringify(c.fields || {});
        return flight(all) && /bus from Porto to the coast/i.test(all);
      },
    },
  },
  {
    id: 'accept-offer',
    kind: "Accept Gremly's offer",
    history: [
      { role: 'user', content: "I'm slammed today" },
      { role: 'assistant', content: 'That sounds like a lot. Want me to move Finish the pitch slides to Wednesday?' },
    ],
    text: 'Yes',
    items: [{ id: 'slides', kind: 'todo', title: 'Finish the pitch slides', due_day: '2026-10-03' }],
    expect: { rows: 1, row: (c) => c.op === 'change' && c.id === 'slides' && c.fields?.day === '2026-10-07' },
  },
  {
    id: 'did-it-go-through',
    kind: 'Follow up',
    history: [
      { role: 'user', content: 'When am I calling the plumber?' },
      { role: 'assistant', content: 'Call the Plumber is on Wednesday.' },
      { role: 'user', content: 'Can we do it Thursday instead?' },
      { role: 'assistant', content: 'Should we move that to Thursday for you?' },
    ],
    text: 'Did that go through?',
    items: [{ id: 'plumber', kind: 'todo', title: 'Call the Plumber', due_day: '2026-10-07' }],
    expect: {
      // nothing has changed yet: it was only offered
      notSaid: /^\s*yes\b|\bwent through\b/i,
      rows: 1,
      row: (c) => c.op === 'change' && c.id === 'plumber' && c.fields?.day === '2026-10-08',
    },
  },
  {
    id: 'hulu-and-sister',
    kind: 'Several asks',
    text: "I keep forgetting to cancel that Hulu subscription and it's driving me crazy. Also I need to figure out what to do when my sister and her family visit in a couple weeks and I haven't even started thinking about it",
    items: [],
    expect: { minRows: 1, some: (c) => c.op === 'add' && /hulu/i.test(c.title || '') },
  },
  {
    id: 'busy-week',
    kind: 'Look ahead',
    text: 'Do I have a busy week coming up?',
    items: [],
    expect: { rows: 0, mentions: /monday|tuesday|wednesday|thursday/i },
  },
  {
    id: 'dated-ahead',
    kind: 'Look ahead, from the ledger',
    text: 'Anything big coming up in the next few weeks?',
    items: [],
    dated: [
      {
        statement: "Alex is flying to Porto for their sister Ana's birthday.",
        about_date: '2026-11-01',
        about_date_end: '2026-11-04',
        state: 'planned',
        private: false,
      },
      {
        statement: 'Alex plans to start a half marathon training plan.',
        about_date: '2026-10-12',
        about_date_end: null,
        state: 'planned',
        private: false,
      },
    ],
    expect: { rows: 0, mentions: /porto/i },
  },
  {
    id: 'proud-lately',
    kind: 'Look back',
    text: 'What have i been proud of lately?',
    items: [],
    memories: [
      {
        source: 'journal',
        about_date: '2026-09-28',
        title: 'Launch shipped',
        body: 'Proud of getting the new app version out after weeks of work.',
      },
      { source: 'win', about_date: '2026-10-01', title: 'First 10k since summer', body: 'Ran 10k for the first time since the summer.' },
    ],
    expect: { rows: 0, mentions: /brief|10k/i },
  },
  {
    id: 'how-do-you-know',
    kind: 'How Gremly knows',
    // Gremly brought it up; they ask where it came from. The fact on record says:
    // their own answer on Tuesday 29 September, when Gremly asked how work was going.
    history: [
      { role: 'user', content: 'morning' },
      { role: 'assistant', content: "Morning. How's the thinking going on the Lisbon move?" },
    ],
    text: 'Wait, how do you know about Lisbon?',
    items: [],
    memories: [
      {
        source: 'fact',
        about_date: '2026-09-29',
        state: 'current',
        title: 'Alex',
        body: 'Alex said work is busy but good, and that a move to the Lisbon office might be coming.',
        private: false,
        said_by: 'user',
        source_table: 'user_corrections',
        source_kind: 'question',
        source_question: 'How is work going these days?',
        source_quote: 'Busy but good. Might be moving to the Lisbon office in the new year, we will see',
        observed_at: '2026-09-30T05:10:00Z',
      },
    ],
    expect: { rows: 0, mentions: /29|tuesday|asked how work/i, notSaid: /someone else/i },
  },
  {
    id: 'how-do-you-know-nothing',
    kind: 'How Gremly knows',
    // Nothing on record shows it: said plainly, with no day, place or words of theirs made up
    history: [
      { role: 'user', content: 'morning' },
      { role: 'assistant', content: 'Morning. Hope the interview went well yesterday.' },
    ],
    text: 'What interview? How do you know about an interview?',
    items: [],
    memories: [],
    expect: { rows: 0, notSaid: /you (told|said|mentioned|wrote|added|saved)|someone else/i },
  },
  {
    id: 'exercise',
    kind: 'A feeling with a task in it',
    history: [
      { role: 'user', content: 'What do you think it is?' },
      {
        role: 'assistant',
        content: "I'd guess it's the week catching up with you, with family in town and a launch coming.",
      },
    ],
    text: 'Need to get back into exercise whilst I have family in town and a lot on my plate',
    items: [{ id: 'run', kind: 'habit', title: 'Run 3 Times A Week' }],
    expect: { maxRows: 1 },
  },
  {
    id: 'car-insurance',
    kind: 'Something new to keep',
    text: 'I need to renew my car insurance before it runs out next month',
    items: [],
    expect: {
      askOrRows: true,
      maxRows: 1,
      // a sensible day before next month, never the day it runs out
      row: (c) => c.op === 'add' && c.type === 'todo' && (!c.fields?.day || c.fields.day < '2026-11-01'),
    },
  },
];

/** The calendar for the week ahead, for the preload (context/weekAhead.js). */
// A heavy day: far more todos planned for it than meetings (on 4 Oct a real
// one had 49 todos, and Ask Gremly named two and called the day mostly open).
const HEAVY_TITLES = [
  'Fix the onboarding crash', 'Write the launch email', 'Submit the app for review', 'Reply to the landlord',
  'Book the dentist', 'Renew the passport', 'Pay the water bill', 'Update the pitch deck',
  'Call the bank about the card', 'Order the birthday cake', 'Send the invoice to Harbour', 'Plan the team offsite',
  'Draft the board update', 'Clean out the garage', 'Back up the laptop', 'Return the library books',
  'Schedule the car service', 'Review the contract changes', 'Prep the QBR slides', 'Buy running shoes',
  'Sort the tax receipts', 'Email the accountant', 'Fix the shed door', 'Write the blog post',
  'Test the new build', 'Update the privacy policy', 'Record the demo video', 'Set up the analytics dashboard',
  'Book flights for Denver', 'Find a present for Sam', 'Call Mum', 'Plan the week',
  'Tidy the inbox', 'Answer the recruiter', 'Read the onboarding notes', 'Renew the gym membership',
  'Fix the bike light', 'Order printer ink', 'Cancel the old phone plan', 'Write the thank you cards',
];
const HEAVY_DAY = HEAVY_TITLES.map((title, i) => ({ id: `h${i + 1}`, kind: 'todo', title, due_day: '2026-10-05' }));

SCENARIOS.push({
  id: 'heavy-day',
  kind: 'A day full of todos',
  text: "What's on Monday?",
  items: HEAVY_DAY,
  expect: {
    rows: 0,
    // the day's todos, by number, not only its one meeting
    mentions: /\b40\b|forty/i,
    notSaid: /\b(mostly|pretty|fairly|wide|largely) (open|clear|free|light)\b|light day|quiet day/i,
  },
});

// After midnight and before their day ends (3am): still Saturday for them.
SCENARIOS.push(
  {
    id: 'late-call-afternoon',
    kind: 'After midnight',
    nowIso: '2026-10-04T08:20:00Z',
    today: '2026-10-03',
    text: 'Can you remind me to call mum this afternoon?',
    items: [],
    expect: {
      askOrRows: true,
      rows: 1,
      row: (c) => c.op === 'add' && c.type === 'todo' && c.fields?.day === '2026-10-04',
      notSaid: /saturday/i,
    },
  },
  {
    id: 'late-tomorrow',
    kind: 'After midnight',
    nowIso: '2026-10-04T07:30:00Z',
    today: '2026-10-03',
    text: "What's on tomorrow?",
    items: [
      { id: 'plants', kind: 'todo', title: 'Water the plants', due_day: '2026-10-04' },
      { id: 'deck', kind: 'todo', title: 'Send the partner deck', due_day: '2026-10-05' },
    ],
    expect: { rows: 0, mentions: /denver|flight|plants/i, notSaid: /deck|huddle/i },
  },
);

export const WEEK = {
  timed: [
    ['2026-10-04T22:56:00Z', '2026-10-05T00:38:00Z', 'Flight to Denver'],
    ['2026-10-05T15:00:00Z', '2026-10-05T15:30:00Z', 'Team huddle'],
    ['2026-10-06T15:30:00Z', '2026-10-06T16:30:00Z', 'Client weekly status'],
    ['2026-10-06T17:00:00Z', '2026-10-06T17:30:00Z', 'Weekly analytics review'],
    ['2026-10-07T15:00:00Z', '2026-10-07T15:30:00Z', 'Media status'],
    ['2026-10-07T17:00:00Z', '2026-10-07T17:45:00Z', 'Social status'],
    ['2026-10-07T19:00:00Z', '2026-10-07T19:30:00Z', '1:1 with Priya'],
    ['2026-10-08T02:00:00Z', '2026-10-08T03:00:00Z', 'Concert with friends'],
    ['2026-10-08T14:00:00Z', '2026-10-08T15:00:00Z', 'Agency weekly meeting'],
    ['2026-10-08T16:30:00Z', '2026-10-08T17:00:00Z', 'Leadership weekly'],
  ],
  allDay: [['2026-10-09T00:00:00Z', '2026-10-10T23:59:59Z', 'Office closed']],
};

/**
 * Their week (the weekly review), as an app build that can show it sends it
 * with a message (lib/cortex/CortexClient.ts WeekTurnContext). THEIR_WEEK is
 * what --with-week gives every scenario that has none of its own: Sunday is
 * their weekly day, this week's review is not done, and the extra is free.
 */
export const THEIR_WEEK = { weekly_day: 0, days_off: [0, 6], review: null, extra_used: false };

// Asking Gremly for their week in Ask Gremly: the button goes under the reply
// (offer_week), and nothing about their week goes on the card, which cannot
// change it from here. expect.offer: 'plan' (the button reads Plan your week),
// 'week' (it reads Your week), 'may' (a button is fine and so is none), or
// left out (no button).
SCENARIOS.push(
  {
    id: 'week-plan',
    kind: 'Their week',
    text: 'Can we plan my week?',
    items: [],
    // Thursday is their weekly day, so Saturday is inside the review's window
    theirWeek: { weekly_day: 4, days_off: [0, 6], review: null, extra_used: false },
    expect: { rows: 0, offer: 'plan' },
  },
  {
    id: 'week-see',
    kind: 'Their week',
    text: 'Show me the week I planned',
    items: [],
    theirWeek: {
      weekly_day: 4,
      days_off: [0, 6],
      review: { week_start: '2026-10-02', span_start: '2026-10-02', status: 'done', kind: 'weekly' },
      extra_used: false,
    },
    expect: { rows: 0, offer: 'week' },
  },
  {
    id: 'week-extra-used',
    kind: 'Their week',
    text: "I'd like to do another weekly review today",
    items: [],
    // Monday is their weekly day, so Saturday would be the extra, and it is used
    theirWeek: {
      weekly_day: 1,
      days_off: [0, 6],
      review: { week_start: '2026-09-29', span_start: '2026-09-30', status: 'done', kind: 'extra' },
      extra_used: true,
    },
    // no review can be started, and the weekly day cannot be moved from Ask
    // Gremly, so nothing goes on the card. The button to the week they planned
    // may be there or not.
    expect: { rows: 0, offer: 'may' },
  },
);

// A habit paused, given a lighter version or set back to usual (the change
// model's ease). Ask Gremly offers it only to an app build that sends the
// habits eased now with their week (theirWeek.eased), so the first of these is
// a build that does not. Saturday 3 October 2026; Sunday is their weekly day.
const RUN = { id: 'run', kind: 'habit', title: 'Run 3 Times A Week' };
SCENARIOS.push(
  {
    id: 'ease-old-build',
    kind: 'A habit eased',
    noEase: true,
    text: 'Work is flat out. Pause my running until the end of next week',
    items: [RUN],
    theirWeek: THEIR_WEEK,
    // no pause can be made from this build, so none goes on the card
    expect: { maxRows: 1, row: (c) => c.op !== 'ease' && c.op !== 'archive' },
  },
  {
    id: 'ease-pause',
    kind: 'A habit eased',
    text: 'Work is flat out. Pause my running until the end of next week',
    items: [RUN],
    theirWeek: { ...THEIR_WEEK, eased: [] },
    expect: {
      rows: 1,
      row: (c) => c.op === 'ease' && c.id === 'run' && c.ease?.mode === 'pause' && c.ease.last === '2026-10-11',
    },
  },
  {
    id: 'ease-lighter',
    kind: 'A habit eased',
    text: 'For this next week can my run just be a twenty minute walk instead?',
    items: [RUN],
    theirWeek: { ...THEIR_WEEK, eased: [] },
    expect: {
      rows: 1,
      row: (c) => c.op === 'ease' && c.id === 'run' && c.ease?.mode === 'lighter' && /walk/i.test(c.ease.note || ''),
    },
  },
  {
    id: 'ease-usual',
    kind: 'A habit eased',
    text: "I'm back from my trip, so I can start running again",
    items: [RUN],
    theirWeek: {
      ...THEIR_WEEK,
      eased: [{ habit_id: 'run', title: 'Run 3 Times A Week', mode: 'pause', first: '2026-09-28', last: '2026-10-11', note: '' }],
    },
    expect: { rows: 1, row: (c) => c.op === 'ease' && c.id === 'run' && c.ease?.mode === 'usual' },
  },
  {
    id: 'ease-sooner',
    kind: 'A habit eased',
    text: 'Actually I only need the running pause until Wednesday',
    items: [RUN],
    theirWeek: {
      ...THEIR_WEEK,
      eased: [{ habit_id: 'run', title: 'Run 3 Times A Week', mode: 'pause', first: '2026-09-28', last: '2026-10-18', note: '' }],
    },
    // a pause is made to end sooner by going back to usual from the day after: Thursday 8 October
    expect: {
      rows: 1,
      row: (c) => c.op === 'ease' && c.id === 'run' && c.ease?.mode === 'usual' && c.ease.first === '2026-10-08' && c.ease.last === '2026-10-18',
    },
  },
);

// Something private, in chat (data fabric stage 6): chat is a place they open
// on purpose, so what is private is welcome when it bears on what they asked,
// in their own words and never framed as a problem (careRules.js PRIVATE_RULES).
SCENARIOS.push({
  id: 'private-own-words',
  kind: 'Something private, in chat',
  text: 'How has this month been for me, honestly?',
  items: [],
  memories: [
    {
      source: 'journal',
      about_date: '2026-09-20',
      title: 'Two weeks',
      body: 'Two weeks off the booze now. Sleeping so much better.',
      private: true,
    },
    {
      source: 'fact',
      about_date: '2026-09-27',
      state: 'current',
      title: 'Cutting out alcohol',
      body: 'They have not had a drink this month and say they sleep better for it.',
      private: true,
      said_by: 'user',
    },
    { source: 'win', about_date: '2026-10-01', title: 'Shipped the redesign', body: 'Got the redesign out the door after a long month.' },
  ],
  expect: {
    rows: 0,
    // never framed as a problem, and no clinical words for it
    notSaid: /addict|alcoholi|disorder|relaps|recovery|sobriety journey|problem with|issue with|battle/i,
  },
});
