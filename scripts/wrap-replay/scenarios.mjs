/**
 * Evenings for the wrap up replay (agent plan step 10). Every name, item and
 * calendar entry is made up. Each evening is the facts the app sends for a
 * moment (lib/wrapup/gremlyWords.ts), with what Gremly knows about the day
 * (person, dco), and the moments to write. expect holds what a moment must
 * get right beyond the rules every line keeps (run.mjs checks).
 */

const recap = (done, habits, missed, planned, drops = 2) => ({
  counts: { todos: done.length, habits: habits.length, meetings: 0, drops },
  done: [
    ...done.map((title) => ({ title, kind: 'todo' })),
    ...habits.map((title) => ({ title, kind: 'habit' })),
  ],
  missed: missed.map((title, i) => ({ id: `m${i}`, title })),
  planned,
});

const person = { first_name: 'Alex', pronouns: null };

const BOARD_DAY = {
  lead_story: {
    what: 'The board deck goes out',
    why_today: 'The deck for Thursday’s review has to reach the board today.',
  },
};

export const EVENINGS = [
  {
    id: 'evening-cards',
    kind: 'An evening with cards, one planned thing missed',
    person,
    dco: BOARD_DAY,
    facts: {
      day: '2026-09-30',
      weekday: 'Wednesday',
      part: 'evening',
      clock: '8:40 PM',
      tomorrow_word: 'tomorrow',
      recap: recap(
        ['Send the board deck', 'Call the vet about Pip'],
        ['Morning run'],
        ['Book the car service'],
        { done: 4, total: 5 },
      ),
      meetings: [
        '9:00 AM Team standup',
        '10:30 AM Board prep',
        '12:00 PM Lunch with Priya',
        '2:00 PM Budget review',
        '3:30 PM Hiring panel',
        '4:30 PM One to one with Sam',
      ],
      cards: 3,
      tonight: {
        decisions: [
          { title: 'Book the car service', outcome: 'moved to tomorrow' },
          { title: 'Read the onboarding notes', outcome: 'let go' },
          { title: 'Plan the team offsite', outcome: 'kept for Friday' },
        ],
        logged: ['Stretch before bed'],
        journal: 'written',
        path: 'cards',
      },
      next: {
        meetings: ['9:00 AM Team standup', '11:00 AM Board review', '3:00 PM Design crit'],
        lined: ['Book the car service', 'Pick up the dry cleaning'],
      },
    },
    moments: ['open', 'journal_ask', 'close'],
  },
  {
    id: 'clear-night',
    kind: 'Nothing to sort, everything planned done',
    person,
    dco: { lead_story: { what: 'A quiet day at home', why_today: 'No meetings, time to get through the list.' } },
    facts: {
      day: '2026-09-27',
      weekday: 'Sunday',
      part: 'evening',
      clock: '9:15 PM',
      tomorrow_word: 'tomorrow',
      recap: recap(['Clean the fridge', 'Pay the water bill', 'Water the plants'], ['Read 20 pages'], [], {
        done: 3,
        total: 3,
      }),
      meetings: [],
      cards: 0,
      tonight: { path: 'clear', journal: null },
      next: { meetings: ['9:30 AM Weekly planning'], lined: [] },
    },
    moments: ['open', 'journal_ask', 'close'],
  },
  {
    id: 'early-afternoon',
    kind: 'Wrapped up at 2pm, the day not over',
    person,
    dco: { lead_story: { what: 'Half day before the long weekend', why_today: 'Finishing early to head to the coast.' } },
    facts: {
      day: '2026-10-02',
      weekday: 'Friday',
      part: 'early',
      clock: '2:10 PM',
      tomorrow_word: 'tomorrow',
      recap: recap(['Submit the timesheet', 'Reply to the landlord'], [], [], { done: 2, total: 2 }),
      meetings: ['10:00 AM Client check in'],
      cards: 2,
      tonight: {
        decisions: [
          { title: 'Fix the bike light', outcome: 'moved to Monday' },
          { title: 'Order printer ink', outcome: 'done' },
        ],
        journal: 'written',
        path: 'cards',
      },
      next: { meetings: [], lined: ['Pack for the coast'] },
    },
    moments: ['open', 'journal_ask', 'close'],
  },
  {
    id: 'after-midnight',
    kind: 'Wrapped up at 12:30 AM, still Wednesday',
    person,
    dco: BOARD_DAY,
    facts: {
      day: '2026-09-30',
      weekday: 'Wednesday',
      part: 'late',
      clock: '12:30 AM',
      day_end: '3 AM',
      tomorrow_word: 'Thursday',
      recap: recap(['Send the board deck'], [], ['Book the car service', 'Email the caterer'], {
        done: 3,
        total: 5,
      }),
      meetings: ['10:30 AM Board prep', '2:00 PM Budget review'],
      cards: 4,
      tonight: {
        decisions: [
          { title: 'Book the car service', outcome: 'moved to Thursday' },
          { title: 'Email the caterer', outcome: 'moved to Thursday' },
        ],
        journal: 'skipped',
        path: 'cards',
      },
      next: { meetings: ['11:00 AM Board review'], lined: ['Book the car service', 'Email the caterer'] },
    },
    moments: ['open', 'journal_ask', 'close'],
  },
  {
    id: 'travel-day',
    kind: 'Flying home, nothing on the plan done',
    person,
    dco: {
      lead_story: {
        what: 'Flight home from Lisbon',
        why_today: 'Heading home this afternoon after a week away with Jo.',
      },
    },
    facts: {
      day: '2026-10-04',
      weekday: 'Sunday',
      part: 'early',
      clock: '4:45 PM',
      tomorrow_word: 'tomorrow',
      recap: recap([], [], ['Book the dentist', 'Renew the passport'], { done: 0, total: 4 }, 0),
      meetings: ['3:55 PM Flight home'],
      travel: 'flying home this afternoon',
      cards: 2,
      tonight: {
        decisions: [
          { title: 'Book the dentist', outcome: 'moved to tomorrow' },
          { title: 'Renew the passport', outcome: 'kept for Wednesday' },
        ],
        held: ['No phone in bed'],
        journal: null,
        path: 'cards',
      },
      next: {
        meetings: ['9:00 AM Team standup', '1:00 PM Quarterly review', '4:00 PM Supplier call'],
        lined: ['Book the dentist'],
      },
    },
    moments: ['open', 'journal_ask', 'close'],
  },
  {
    id: 'skip-night',
    kind: 'Moved it all on, a busy week',
    person,
    dco: { lead_story: { what: 'Launch week', why_today: 'The app goes live on Thursday.' } },
    facts: {
      day: '2026-10-06',
      weekday: 'Tuesday',
      part: 'evening',
      clock: '10:05 PM',
      tomorrow_word: 'tomorrow',
      recap: recap(['Fix the sign up bug', 'Write the release notes'], [], [], null, 4),
      meetings: ['9:00 AM Launch standup', '1:00 PM Press briefing', '5:00 PM Go live rehearsal'],
      cards: 6,
      tonight: { path: 'skip', journal: 'mood' },
      next: { meetings: ['9:00 AM Launch standup', '4:00 PM Go live check'], lined: ['Answer the beta emails'] },
    },
    moments: ['open', 'close'],
  },
];

/** Journal entries, each with whether it is one. */
export const ENTRIES = [
  {
    id: 'hard-day',
    evening: 'evening-cards',
    entry: 'Rough one. The pitch went badly and I am exhausted, but at least the deck is out.',
    expect: { journal: true, moods: ['tired', 'low', 'frustrated', 'overwhelmed', 'okay'] },
  },
  {
    id: 'good-day',
    evening: 'clear-night',
    entry: 'Really nice slow day. Cooked a proper dinner and called my sister.',
    expect: { journal: true, moods: ['good', 'great', 'calm', 'grateful'] },
  },
  {
    id: 'two-words',
    evening: 'early-afternoon',
    entry: 'pretty good',
    expect: { journal: true, moods: ['good', 'okay', 'great'] },
  },
  {
    id: 'asks-gremly',
    evening: 'evening-cards',
    entry: 'Can you move the car service to Friday instead?',
    expect: { journal: false },
  },
  {
    id: 'asks-question',
    evening: 'travel-day',
    entry: 'What have I got on tomorrow?',
    expect: { journal: false },
  },
  {
    id: 'feelings-question',
    evening: 'travel-day',
    entry: 'Tired but happy. Why do flights always wipe me out?',
    expect: { journal: true, moods: ['tired', 'good', 'great', 'grateful', 'okay'] },
  },
];

/** Gremly's open questions on an evening, and which may not be asked. */
export const QUESTIONS = [
  {
    id: 'settled-by-cards',
    evening: 'evening-cards',
    questions: [
      {
        id: 'q-car',
        question: 'Is the car service booked for Thursday or still to book?',
        about: { kind: 'todo', title: 'Book the car service' },
      },
      { id: 'q-anniv', question: 'Which day is your anniversary itself, Friday or Saturday?' },
      {
        id: 'q-onboard',
        question: 'Do you still want to read the onboarding notes this week?',
        about: { kind: 'todo', title: 'Read the onboarding notes' },
      },
      { id: 'q-trip', question: 'Is the Mexico trip still on for late November?' },
    ],
    // let go tonight: the question is answered
    expect: { notAsked: ['q-onboard'], most: 2 },
  },
  {
    id: 'none-fit',
    evening: 'clear-night',
    questions: [],
    expect: { most: 0 },
  },
];
