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
  // A note's kind (note, event, idea), modelled on a real chat of 7 October:
  // two plans saved as plain notes, and asking why they were not events.
  {
    id: 'notes-into-events',
    kind: "A note's kind",
    history: [
      { role: 'user', content: "I've got Friday off work and I'm seeing Robin tomorrow night" },
      { role: 'assistant', content: 'A long weekend coming, nice. How are you feeling about seeing Robin?' },
      // the Save items pill's receipts, as the app tells them (lib/chat/useChatCard.ts chatHistoryOf)
      { role: 'user', content: '(They saved “Friday off work” from this conversation, as a note.)' },
      { role: 'user', content: '(They saved “See Robin” from this conversation, as a note.)' },
    ],
    text: 'Those two notes you just made, why didn’t you make them events?',
    items: [
      { id: 'off', kind: 'note', title: 'Friday off work', subtype: 'catchall' },
      { id: 'robin', kind: 'note', title: 'See Robin', subtype: 'catchall' },
    ],
    expect: {
      minRows: 1,
      maxRows: 2,
      row: (c) => c.op === 'change' && c.fields?.kind === 'event' && !!c.fields?.day,
      some: (c) => c.id === 'off' && c.fields?.day === '2026-10-09',
    },
  },
  {
    id: 'can-you-make-them-events',
    kind: "A note's kind",
    history: [
      { role: 'user', content: "I've got Friday off work and I'm seeing Robin tomorrow night" },
      { role: 'assistant', content: 'A long weekend coming, nice. How are you feeling about seeing Robin?' },
      // the Save items pill's receipts, as the app tells them (lib/chat/useChatCard.ts chatHistoryOf)
      { role: 'user', content: '(They saved “Friday off work” from this conversation, as a note.)' },
      { role: 'user', content: '(They saved “See Robin” from this conversation, as a note.)' },
      { role: 'user', content: 'There should be a way to turn those notes into events, with their days and times' },
      { role: 'assistant', content: 'That would make them much easier to see on your days.' },
    ],
    text: 'So can you do that for me?',
    items: [
      { id: 'off', kind: 'note', title: 'Friday off work', subtype: 'catchall' },
      { id: 'robin', kind: 'note', title: 'See Robin', subtype: 'catchall' },
    ],
    expect: {
      minRows: 1,
      maxRows: 2,
      row: (c) => c.op === 'change' && c.fields?.kind === 'event' && !!c.fields?.day,
      // asking what time they see Robin is fair; Friday needs nothing more
      some: (c) => c.id === 'off' && c.fields?.day === '2026-10-09',
    },
  },
  {
    id: 'notes-into-events-old-build',
    kind: "A note's kind, on an older build",
    oldBuild: true,
    history: [
      { role: 'user', content: "I've got Friday off work and I'm seeing Robin tomorrow night" },
      { role: 'assistant', content: 'A long weekend coming, nice. How are you feeling about seeing Robin?' },
      // the Save items pill's receipts, as the app tells them (lib/chat/useChatCard.ts chatHistoryOf)
      { role: 'user', content: '(They saved “Friday off work” from this conversation, as a note.)' },
      { role: 'user', content: '(They saved “See Robin” from this conversation, as a note.)' },
    ],
    text: 'Those two notes you just made, why didn’t you make them events?',
    items: [
      { id: 'off', kind: 'note', title: 'Friday off work', subtype: 'catchall' },
      { id: 'robin', kind: 'note', title: 'See Robin', subtype: 'catchall' },
    ],
    // an older build cannot write the kind: the day alone makes each an event
    expect: {
      minRows: 1,
      maxRows: 2,
      row: (c) => c.op === 'change' && !!c.fields?.day && !('kind' in (c.fields || {})),
    },
  },
  {
    id: 'new-idea',
    kind: "A note's kind",
    text: 'Idea: a short podcast about the history of street food. Keep that for me',
    items: [],
    expect: { rows: 1, row: (c) => c.op === 'add' && c.type === 'note' && c.fields?.kind === 'idea' },
  },
  {
    id: 'new-event',
    kind: "A note's kind",
    text: "Jo's birthday dinner is on the 17th at 7pm, can you add it?",
    items: [],
    expect: {
      minRows: 1,
      maxRows: 2,
      some: (c) =>
        c.op === 'add' &&
        c.type === 'note' &&
        c.fields?.kind === 'event' &&
        c.fields?.day === '2026-10-17' &&
        c.fields?.time === '19:00',
    },
  },
  {
    id: 'event-moved',
    kind: 'Change an event',
    text: 'Dinner with Priya moved to Thursday at 8pm',
    items: [{ id: 'priya', kind: 'note', title: 'Dinner with Priya', subtype: 'event', day: '2026-10-06', time: '19:30' }],
    expect: {
      rows: 1,
      row: (c) => c.op === 'change' && c.id === 'priya' && c.fields?.day === '2026-10-08' && c.fields?.time === '20:00',
    },
  },
  {
    id: 'event-cancelled',
    kind: 'Cancel an event',
    text: "Dinner with Priya on Tuesday is off, she can't make it",
    items: [{ id: 'priya', kind: 'note', title: 'Dinner with Priya', subtype: 'event', day: '2026-10-06', time: '19:30' }],
    expect: { askOrRows: true, rows: 1, row: (c) => c.op === 'archive' && c.id === 'priya' },
  },
  {
    id: 'journal-stays',
    kind: "A note's kind",
    text: 'Make my Sunday reflections an idea instead',
    items: [{ id: 'sun', kind: 'note', title: 'Sunday reflections', subtype: 'journal' }],
    // a journal entry stays one: nothing on the card, and it says so
    expect: { rows: 0 },
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

// Worlds and Chapters (Worlds rebuild, stage 2): an app build that can change
// them sends worldsCard, and Gremly is told Alex's Worlds and Chapters with
// ids. James's rules: Gremly suggests and the person taps; a Chapter is offered
// once for each thing, a maybe gets one short question first and an idea makes
// nothing; filing is never asked about; nothing is deleted from a card; words
// and an outfit only when asked. Today is Saturday 3 October 2026.
export const PLACES = {
  worlds: [
    { id: 'wHome', name: 'Home' },
    { id: 'wWork', name: 'Work' },
    { id: 'wHealth', name: 'Health and fitness' },
    { id: 'wTravel', name: 'Travel' },
    { id: 'wFriends', name: 'Friends' },
    { id: 'wSide', name: 'Side project' },
    { id: 'wBand', name: 'Old band', hidden: true },
  ],
  chapters: [
    { id: 'cLisbon', title: 'Lisbon trip', world: 'wTravel', start: '2026-11-20', end: '2026-11-22' },
    { id: 'cFence', title: 'Garden fence', world: 'wHome', end: '2026-09-30' },
    { id: 'cBook', title: 'Book club', world: 'wWork' },
    { id: 'cMove', title: 'Summer move', world: 'wHome', end: '2026-08-30', closed: true },
  ],
};
const P = PLACES;
// a reply that asks them where something belongs, which Gremly never does
const ASKS_WHERE = /which (world|chapter)|what (world|chapter)|where should (i|this|that|it) (go|live|sit)/i;

SCENARIOS.push(
  {
    id: 'places-start-mention',
    kind: 'Worlds and Chapters',
    text: "I've signed up for the Oakland half marathon on Sunday 15 November, so I need to start training properly",
    items: [
      { id: 'shoes', kind: 'todo', title: 'Buy running shoes' },
      { id: 'run', kind: 'habit', title: 'Run 3 times a week' },
    ],
    ...P,
    expect: {
      askOrRows: true,
      some: (c) => c.op === 'add' && c.type === 'chapter' && c.fields?.world === 'wHealth' && c.fields?.end_day === '2026-11-15',
      notSaid: ASKS_WHERE,
    },
  },
  {
    id: 'places-vague',
    kind: 'Worlds and Chapters',
    text: "Maybe one day I'll learn the piano, it would be nice",
    items: [],
    ...P,
    expect: { rows: 0, notSaid: ASKS_WHERE },
  },
  {
    id: 'places-only-idea',
    kind: 'Worlds and Chapters',
    history: [
      { role: 'user', content: "I keep thinking about turning the spare room into a studio" },
      { role: 'assistant', content: 'That sounds lovely. Is it something you are planning to do soon, or more of an idea for now?' },
    ],
    text: "Just an idea for now, not happening anytime soon",
    items: [],
    ...P,
    expect: { rows: 0 },
  },
  {
    id: 'places-rename',
    kind: 'Worlds and Chapters',
    text: 'Can you rename my Lisbon trip chapter to Portugal trip? We are doing Porto too',
    items: [],
    ...P,
    expect: { keep: false, rows: 1, row: (c) => c.op === 'change' && c.type === 'chapter' && c.id === 'cLisbon' && /portugal trip/i.test(c.fields?.name || '') },
  },
  {
    id: 'places-dates-moved',
    kind: 'Worlds and Chapters',
    text: "The Lisbon trip moved, it's now the 27th to the 29th of November",
    items: [],
    ...P,
    expect: {
      keep: false,
      rows: 1,
      row: (c) => c.op === 'change' && c.type === 'chapter' && c.id === 'cLisbon' && c.fields?.start_day === '2026-11-27' && c.fields?.end_day === '2026-11-29',
    },
  },
  {
    id: 'places-done',
    kind: 'Worlds and Chapters',
    text: 'The garden fence is finally finished!',
    items: [],
    ...P,
    expect: { rows: 1, row: (c) => c.op === 'close' && c.type === 'chapter' && c.id === 'cFence' },
  },
  {
    id: 'places-move',
    kind: 'Worlds and Chapters',
    text: 'Book club should be under Friends really, not Work',
    items: [],
    ...P,
    expect: { rows: 1, row: (c) => c.op === 'change' && c.type === 'chapter' && c.id === 'cBook' && c.fields?.world === 'wFriends' },
  },
  {
    id: 'places-merge',
    kind: 'Worlds and Chapters',
    text: 'Merge my Side project world into Work, it is all the same thing now',
    items: [],
    ...P,
    expect: { rows: 1, row: (c) => c.op === 'merge' && c.type === 'world' && c.id === 'wSide' && c.into === 'wWork' },
  },
  {
    id: 'places-hide',
    kind: 'Worlds and Chapters',
    text: "I'm not in the band any more, can you hide that world",
    items: [],
    worlds: [...P.worlds.filter((w) => w.id !== 'wBand'), { id: 'wBand', name: 'Old band' }],
    chapters: P.chapters,
    expect: { keep: false, rows: 1, row: (c) => c.op === 'archive' && c.type === 'world' && c.id === 'wBand' },
  },
  {
    id: 'places-delete',
    kind: 'Worlds and Chapters',
    text: 'Delete the Summer move chapter, I do not need it',
    items: [],
    ...P,
    // nothing is deleted from a card: they are told they can delete it from its page
    expect: { maxRows: 0, mentions: /page|yourself|by hand/i, notSaid: /\b(deleted|removed)\b/i },
  },
  {
    id: 'places-todo-no-asking',
    kind: 'Worlds and Chapters',
    text: 'Add a todo to book the ferry from Lisbon to Porto, sometime next week',
    items: [],
    ...P,
    expect: { askOrRows: true, some: (c) => c.op === 'add' && c.type === 'todo', notSaid: ASKS_WHERE },
  },
  {
    id: 'places-declined',
    kind: 'Worlds and Chapters',
    text: "I'm thinking of redoing the kitchen next spring, we've been talking about it a lot",
    items: [],
    ...P,
    declined: ['Kitchen redo'],
    expect: { rows: 0 },
  },
  {
    id: 'places-words-unasked',
    kind: 'Worlds and Chapters',
    text: 'So excited for Lisbon, it is going to be the best trip',
    items: [],
    ...P,
    expect: { rows: 0 },
  },
);

// A World's or a Chapter's own chat (Worlds rebuild, stage 2): the chat is on
// the page, so "this" is the page, and what is on it comes with every turn
// (cortex context/pageDetail.js). page names it; links say which items are in
// which World or Chapter.
SCENARIOS.push(
  {
    id: 'page-chapter-done',
    kind: 'A page of its own',
    page: { type: 'chapter', id: 'cFence', title: 'Garden fence' },
    text: 'This is done!',
    items: [],
    ...P,
    expect: { keep: false, rows: 1, row: (c) => c.op === 'close' && c.type === 'chapter' && c.id === 'cFence' },
  },
  {
    id: 'page-chapter-dates',
    kind: 'A page of its own',
    page: { type: 'chapter', id: 'cLisbon', title: 'Lisbon trip' },
    text: "The dates changed, it's now the 27th to the 29th",
    items: [],
    ...P,
    expect: {
      rows: 1,
      row: (c) => c.op === 'change' && c.type === 'chapter' && c.id === 'cLisbon' && c.fields?.start_day === '2026-11-27' && c.fields?.end_day === '2026-11-29',
    },
  },
  {
    id: 'page-chapter-step',
    kind: 'A page of its own',
    page: { type: 'chapter', id: 'cLisbon', title: 'Lisbon trip' },
    text: 'Add a step to book the airport taxi',
    items: [{ id: 'flights', kind: 'todo', title: 'Book flights', due_day: '2026-10-09' }],
    links: [{ item: 'flights', chapter: 'cLisbon', world: 'wTravel' }],
    ...P,
    // a step added on a Chapter's page belongs to that Chapter
    expect: { askOrRows: true, rows: 1, row: (c) => c.op === 'add' && c.type === 'todo' && (c.fields?.chapters?.add || []).includes('cLisbon') },
  },
  {
    id: 'page-chapter-tick',
    kind: 'A page of its own',
    page: { type: 'chapter', id: 'cLisbon', title: 'Lisbon trip' },
    text: 'I booked the flights',
    items: [{ id: 'flights', kind: 'todo', title: 'Book flights', due_day: '2026-10-09' }],
    links: [{ item: 'flights', chapter: 'cLisbon', world: 'wTravel' }],
    ...P,
    expect: { keep: false, rows: 1, row: (c) => c.op === 'done' && c.id === 'flights' },
  },
  {
    id: 'page-world-start',
    kind: 'A page of its own',
    page: { type: 'world', id: 'wHome', title: 'Home' },
    text: 'Start a chapter here for repainting the hallway, I want it done before Christmas',
    items: [],
    ...P,
    expect: {
      askOrRows: true,
      some: (c) => c.op === 'add' && c.type === 'chapter' && c.fields?.world === 'wHome',
    },
  },
);

// Save from chat (Worlds rebuild, stage 2, decision 3): under a reply worth
// keeping, a Save button naming the Chapter or World it belongs in. Gremly
// judges which replies are worth keeping (cortex context/keep.js, after every
// reply). On a page's own chat a button with no place names the page, so no
// place passes there.
SCENARIOS.push(
  {
    id: 'keep-packing-page',
    kind: 'Save from chat',
    page: { type: 'chapter', id: 'cLisbon', title: 'Lisbon trip' },
    text: 'Make me a packing list for this',
    items: [],
    ...P,
    // the agent may make the list itself, on the card, in this Chapter; a list in the reply has the Save button
    expect: {
      maxRows: 1,
      keepOr: (c) => c.op === 'add' && c.type === 'note' && (c.fields?.chapters?.add || []).includes('cLisbon'),
      keep: { kind: 'list', place: ['cLisbon', null], minLines: 5 },
    },
  },
  {
    id: 'keep-ideas-home',
    kind: 'Save from chat',
    text: 'What should we do in Lisbon? Give me a few ideas',
    items: [],
    ...P,
    expect: { keep: { place: 'cLisbon', minLines: 3 } },
  },
  {
    id: 'keep-plan-world',
    kind: 'Save from chat',
    text: 'Can you give me a simple four week plan to get back into running? Nothing too hard',
    items: [],
    ...P,
    expect: { keep: { place: 'wHealth', minLines: 4 } },
  },
  // things that belong in a World and in none of its Chapters: the button
  // names the World, so Save does not have to ask where (the place is what
  // these check; a reply in a paragraph or two keeps one or two lines)
  {
    id: 'keep-world-cosy',
    kind: 'Save from chat',
    text: 'Give me a few ideas to make the flat feel cosier this winter',
    items: [],
    ...P,
    expect: { keep: { place: 'wHome', minLines: 1 } },
  },
  {
    id: 'keep-world-review',
    kind: 'Save from chat',
    text: 'Give me a few tips for my performance review next week',
    items: [],
    ...P,
    expect: { keep: { place: 'wWork', minLines: 1 } },
  },
  {
    id: 'keep-world-breakfasts',
    kind: 'Save from chat',
    text: 'Give me five quick high protein breakfasts',
    items: [],
    ...P,
    expect: { keep: { place: ['wHealth', 'wHome'], minLines: 5 } },
  },
  {
    id: 'keep-world-night-in',
    kind: 'Save from chat',
    text: 'Any ideas for a fun, low key night in with friends?',
    items: [],
    ...P,
    expect: { keep: { place: 'wFriends', minLines: 1 } },
  },
  // the World, not a Chapter in it that is about something else
  {
    id: 'keep-world-weekend-away',
    kind: 'Save from chat',
    text: 'Give me some ideas for a weekend away in the spring',
    items: [],
    ...P,
    expect: { keep: { place: 'wTravel', minLines: 3 } },
  },
  {
    id: 'keep-world-shade',
    kind: 'Save from chat',
    text: 'What are some easy plants for a shady corner of the garden?',
    items: [],
    ...P,
    expect: { keep: { place: 'wHome', minLines: 1 } },
  },
  {
    id: 'keep-chat-only',
    kind: 'Save from chat',
    text: 'Ugh, long day. Work was a lot',
    items: [],
    ...P,
    expect: { rows: 0, keep: false },
  },
  {
    id: 'keep-quick-answer',
    kind: 'Save from chat',
    page: { type: 'chapter', id: 'cLisbon', title: 'Lisbon trip' },
    text: 'Is Lisbon an hour ahead of London or the same?',
    items: [],
    ...P,
    expect: { rows: 0, keep: false },
  },
  {
    // a Chapter they said no to is never offered again, but when they ask for it, it is made
    id: 'places-declined-asked',
    kind: 'Worlds and Chapters',
    text: 'Actually we are doing the kitchen redo after all. Start a chapter for it, starting in March',
    items: [],
    ...P,
    declined: ['Kitchen redo'],
    expect: { askOrRows: true, some: (c) => c.op === 'add' && c.type === 'chapter' && c.fields?.world === 'wHome' },
  },
);

// Putting things they already have into a World or Chapter, when they ask
// (James, 9 Oct: on a Chapter's page Gremly named two todos that belonged and
// then said it could not put them there). Each item is moved on the card by
// its chapters; on a page, here is that page.
const PARTY = {
  worlds: P.worlds,
  chapters: [...P.chapters, { id: 'cParty', title: "Sam's 40th in Rome", world: 'wFriends', end: '2026-10-24' }],
};
const PARTY_ITEMS = [
  { id: 'ali', kind: 'todo', title: "Talk to Ali about Sam's birthday", due_day: '2026-10-10' },
  { id: 'rome', kind: 'todo', title: 'Look into Rome flights if we go', due_day: '2026-10-13' },
  { id: 'dentist', kind: 'todo', title: 'Book the dentist', due_day: '2026-10-15' },
];
const INTO_PARTY = (c) =>
  c.op === 'change' && c.type === 'todo' && ['ali', 'rome'].includes(c.id) && (c.fields?.chapters?.add || []).includes('cParty');
SCENARIOS.push(
  {
    id: 'page-chapter-gather',
    kind: 'A page of its own',
    page: { type: 'chapter', id: 'cParty', title: "Sam's 40th in Rome" },
    text: 'Aren’t there todos to put in here?',
    items: PARTY_ITEMS,
    ...PARTY,
    expect: { keep: false, minRows: 1, row: INTO_PARTY },
  },
  {
    id: 'page-chapter-gather-yes',
    kind: 'A page of its own',
    page: { type: 'chapter', id: 'cParty', title: "Sam's 40th in Rome" },
    history: [
      { role: 'user', content: 'Aren’t there todos to put in here?' },
      {
        role: 'assistant',
        content:
          "There are two that go with it: talking to Ali about Sam's birthday, due Saturday 10 October, and looking into Rome flights if you go, due Tuesday 13 October.",
      },
    ],
    text: 'Ok so do it',
    items: PARTY_ITEMS,
    ...PARTY,
    expect: { keep: false, rows: 2, row: INTO_PARTY },
  },
  {
    id: 'places-file-asked',
    kind: 'Worlds and Chapters',
    text: 'Put the Rome flights todo in the Sam’s 40th chapter',
    items: PARTY_ITEMS,
    ...PARTY,
    expect: { keep: false, rows: 1, row: (c) => INTO_PARTY(c) && c.id === 'rome' },
  },
);
