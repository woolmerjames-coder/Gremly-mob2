/**
 * The Chapter questions replay's made up days (data fabric stage 4c). Every
 * name, place and item is made up. What each scenario should give was set
 * when it was written, from what the drops and records plainly show.
 */

export const TODAY = '2026-10-07';
export const PERSON = { first_name: 'Robin', pronouns: null };

export const WORLDS = [
  { id: 'w-travel', name: 'Travel' },
  { id: 'w-work', name: 'Work' },
  { id: 'w-home', name: 'Home' },
  { id: 'w-running', name: 'Running' },
];

let n = 0;
const item = (type, title, body, date, extra = {}) => {
  n += 1;
  return {
    type,
    id: `${type}-${String(n).padStart(3, '0')}`,
    title,
    body,
    subtype: null,
    date,
    created_at: `${date}T09:00:00Z`,
    done: null,
    private: false,
    health: false,
    ...extra,
  };
};

const TRIP = [
  item('todo', 'Flights to Porto', 'Look at flights to Porto for November', '2026-10-02'),
  item('todo', 'Porto dates', 'Ask Sam if the Porto dates work for them', '2026-10-02'),
  item('todo', 'Porto hotel', 'Book a riverside hotel in Porto, 10 to 14 November', '2026-10-04'),
  item('note', 'Porto', 'Find a port cellar tour for the Porto trip', '2026-10-05'),
];
const BATHROOM = [
  item('todo', 'Bathroom quotes', 'Get three quotes for the bathroom refit', '2026-09-29'),
  item('note', 'Tiles', 'Pick tiles for the bathroom, leaning towards green', '2026-10-01'),
  item('todo', 'Plumber', 'Plumber can start the bathroom on the 20th, confirm with him', '2026-10-03'),
  item('todo', 'Sink', 'Order the new bathroom sink', '2026-10-06'),
];
const GARDEN = [
  item('todo', 'Measure garden', 'Measure the back garden for the new raised beds', '2026-09-30'),
  item('todo', 'Sleepers', 'Order oak sleepers for the raised beds', '2026-10-02'),
  item('note', 'Raised beds', 'Dan said he can help build the raised beds, ask him which weekend', '2026-10-03'),
  item('todo', 'Compost', 'Get compost and topsoil to fill the raised beds', '2026-10-05'),
];
const NOISE = [
  item('todo', 'Milk', 'Buy milk', '2026-10-01'),
  item('todo', 'Car insurance', 'Renew the car insurance', '2026-10-02'),
  item('todo', 'Deck', 'Send the Q3 deck to Lena', '2026-10-03'),
  item('habit', 'Tomatoes', 'Water the tomatoes', '2026-09-25'),
  item('note', 'Book', 'Started reading the new detective novel', '2026-10-04'),
  item('todo', 'Dentist', 'Book a dentist check up', '2026-10-05', { private: true, health: true }),
];

const ids = (list) => list.map((i) => i.id);

/** Suggesting: what is given, and what a right answer is. */
export const SUGGESTS = [
  {
    key: 'trip-forming',
    what: 'a trip forming over four drops on three days, among other drops',
    chapters: [],
    drops: [...TRIP, ...NOISE],
    declined: [],
    want: { suggest: true, from: ids(TRIP), world: 'w-travel', atLeast: 3, dates: ['2026-11-10', '2026-11-14'] },
  },
  {
    key: 'undated-forming',
    what: 'raised beds being planned over four drops, with no days said for them',
    chapters: [],
    drops: [...GARDEN, ...NOISE],
    declined: [],
    want: { suggest: true, from: ids(GARDEN), world: 'w-home', atLeast: 3, noDates: true },
  },
  {
    key: 'nothing-forming',
    what: 'only drops that make no Chapter',
    chapters: [],
    drops: NOISE,
    declined: [],
    want: { suggest: false },
  },
  {
    key: 'two-at-once',
    what: 'a trip and a bathroom refit forming at once',
    chapters: [],
    drops: [...TRIP, ...BATHROOM, ...NOISE],
    declined: [],
    want: { suggest: true, fromOneOf: [ids(TRIP), ids(BATHROOM)], atLeast: 3 },
  },
  {
    key: 'said-no',
    what: 'the trip, which they already turned down',
    chapters: [],
    drops: [...TRIP, ...NOISE],
    declined: [{ title: 'Porto in November', items: TRIP.map((i) => ({ table: `${i.type}s`, id: i.id })) }],
    want: { suggest: false },
  },
  {
    key: 'already-have-it',
    what: 'the trip, which they already have a Chapter for',
    chapters: [{ id: 'c-porto', title: 'Porto in November', start_date: '2026-11-10', end_date: '2026-11-14', primary_world_id: 'w-travel' }],
    drops: [...TRIP, ...NOISE],
    declined: [],
    want: { suggest: false },
  },
];

const chapter = (id, title, world, start, end) => ({
  id,
  title,
  phase: 'active',
  start_date: start,
  end_date: end,
  closed_at: null,
  primary_world_id: world,
});

/** Closing: Chapters past their end date, with their records and the guesses that are right. */
export const CLOSES = [
  {
    chapter: chapter('c-half', 'Half marathon training', 'w-running', '2026-07-01', '2026-09-28'),
    records: {
      items: [
        item('note', 'Race day', 'Finished the half marathon in 1:58, so happy', '2026-09-28'),
        item('todo', 'Long run', 'Long run, 16 miles along the canal', '2026-09-20'),
      ],
      facts: [{ statement: 'Ran the half marathon in 1 hour 58', about_date: '2026-09-28', state: 'happened', private: false, health: false }],
    },
    right: ['over'],
  },
  {
    chapter: chapter('c-kitchen', 'Kitchen redo', 'w-home', '2026-08-15', '2026-09-30'),
    records: {
      items: [
        item('note', 'Cabinets', 'The cabinets now arrive on 10 October, two weeks late', '2026-10-02'),
        item('todo', 'Electrician', 'Electrician booked for the kitchen on 14 October', '2026-10-03'),
      ],
      facts: [{ statement: 'Kitchen cabinets arrive on 10 October', about_date: '2026-10-10', state: 'planned', private: false, health: false }],
    },
    right: ['still_going', 'moved'],
  },
  // no end date, and nothing new filed in it for a while (since 18 Oct)
  {
    chapter: { ...chapter('c-10k', 'Training for the city 10K', 'w-running', '2026-03-01', null), quiet_since: '2026-05-18' },
    records: {
      items: [
        item('note', 'Race day', 'Ran the city 10K this morning, legs like jelly but so proud', '2026-05-17'),
        item('todo', 'Tempo run', 'Tempo run, 6k at race pace', '2026-05-10'),
      ],
      facts: [{ statement: 'Planned to run the city 10K on 17 May', about_date: '2026-05-17', state: 'planned', private: false, health: false }],
    },
    right: ['over'],
  },
  {
    chapter: { ...chapter('c-guitar', 'Learning the guitar', 'w-home', '2026-02-01', null), quiet_since: '2026-08-20' },
    records: {
      items: [item('note', 'Guitar', 'Got through the whole of the first song without stopping', '2026-08-20')],
      facts: [{ statement: 'Practises the guitar most evenings', about_date: null, state: 'current', private: false, health: false }],
    },
    right: ['still_going', 'unsure'],
  },
  {
    chapter: chapter('c-spanish', 'Spanish evening class', 'w-work', '2026-09-01', '2026-10-01'),
    records: {
      items: [item('todo', 'Spanish homework', 'Spanish homework for Thursday class', '2026-09-15')],
      facts: [],
    },
    right: ['over', 'unsure'],
  },
];

/** The welcome back: away from 15 September, back today. */
export const WELCOME = {
  since: '2026-09-15',
  chapters: [
    {
      chapter: chapter('c-lisbon', 'Lisbon with Sam', 'w-travel', '2026-09-18', '2026-09-25'),
      records: {
        items: [
          item('todo', 'Lisbon flights', 'Flights to Lisbon booked for 18 September, back on the 25th', '2026-09-01'),
          item('note', 'Lisbon', 'Packing list for Lisbon: sun cream, walking shoes', '2026-09-14'),
        ],
        facts: [{ statement: 'Going to Lisbon with Sam from 18 to 25 September', about_date: '2026-09-18', state: 'planned', private: false, health: false }],
      },
      right: ['over', 'unsure'],
    },
    {
      chapter: chapter('c-wedding', "Ana's wedding", 'w-home', '2026-10-24', '2026-10-24'),
      records: {
        items: [item('todo', 'Wedding outfit', "Buy an outfit for Ana's wedding on 24 October", '2026-09-10')],
        facts: [{ statement: "Ana's wedding is on 24 October", about_date: '2026-10-24', state: 'planned', private: false, health: false }],
      },
      right: ['still_ahead', 'unsure'],
    },
  ],
};

/**
 * Made up answers to the Chapter questions, for the answer reader
 * (context/chapterAnswers.js). Each gives whether the words answer the
 * question, the outcomes that are right for them, and the days they give,
 * when they give any.
 */
const RACE_CH = { id: 'ch-race', title: 'Training for the city 10K', phase: 'active', start_date: '2026-06-01', end_date: '2026-09-20', end_date_source: 'synthesis', closed_at: null };
const GARDEN_CH = { id: 'ch-garden', title: 'Garden redesign', phase: 'active', start_date: '2026-08-01', end_date: '2026-09-30', end_date_source: 'synthesis', closed_at: null };
const raceQ = { kind: 'close_chapter', question: 'Training for the city 10K had its day on 20 September. Is it behind you now?', proposed_change: { type: 'close', chapter_id: 'ch-race', guess: 'over' } };
const portoQ = {
  kind: 'start_chapter',
  question: 'Your Porto plans are coming together. Would you like to make "Porto trip" a Chapter?',
  proposed_change: { type: 'start', title: 'Porto trip', world_id: 'w-travel', start_date: '2026-11-10', end_date: '2026-11-14' },
};
const gardenQ = { kind: 'while_away', question: 'Welcome back! Did the Garden redesign get finished while you were away?', proposed_change: { type: 'while_away', chapter_id: 'ch-garden', guess: 'over' } };

export const ANSWERS = [
  { key: 'race-tap-over', question: raceQ, chapter: RACE_CH, said: "It's over", answers: true, right: ['over'] },
  { key: 'race-ran-it', question: raceQ, chapter: RACE_CH, said: 'Yes, ran it and finished it on the day', answers: true, right: ['over'] },
  { key: 'race-moved', question: raceQ, chapter: RACE_CH, said: 'No, the race got moved to 15 November so I am still training', answers: true, right: ['moved'], end: '2026-11-15' },
  { key: 'race-going', question: raceQ, chapter: RACE_CH, said: 'Still going', answers: true, right: ['going'] },
  { key: 'race-pulled-out', question: raceQ, chapter: RACE_CH, said: 'I pulled out, it is not happening for me this year', answers: true, right: ['not_happening', 'over'] },
  { key: 'race-not-sure', question: raceQ, chapter: RACE_CH, said: 'Not sure yet', answers: null, right: ['unsure', null] },
  { key: 'race-what', question: raceQ, chapter: RACE_CH, said: 'What do you mean?', answers: false, right: [null, 'unsure'] },
  { key: 'race-else', question: raceQ, chapter: RACE_CH, said: 'Can you remind me to buy oat milk tomorrow', answers: false, right: [null, 'unsure'] },
  { key: 'porto-yes', question: portoQ, said: 'Yes', answers: true, right: ['start'] },
  { key: 'porto-later', question: portoQ, said: 'Not right now', answers: true, right: ['later'] },
  { key: 'porto-no', question: portoQ, said: 'No thanks', answers: true, right: ['no'] },
  { key: 'porto-other-days', question: portoQ, said: 'Yes, but it is actually 12 to 16 November', answers: true, right: ['start'], start: '2026-11-12', end: '2026-11-16' },
  { key: 'garden-done', question: gardenQ, chapter: GARDEN_CH, said: 'Finished it last week', answers: true, right: ['over'] },
  { key: 'garden-later', question: gardenQ, chapter: GARDEN_CH, said: 'Nope, still at it, it should be done by the end of October', answers: true, right: ['moved', 'going'], end: '2026-10-31' },
];
