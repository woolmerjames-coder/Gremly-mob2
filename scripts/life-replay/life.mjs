/**
 * The life replay's made up person (data fabric stage 4d): a few weeks of
 * what they wrote, said and planned, read in order by the reader that ships,
 * and the morning it all leads to. Every name, place and record here is made
 * up. What a friend would know that morning (TRUTH) was set when this was
 * written, from the records alone.
 */

import {
  noteRecord,
  todoRecord,
  chatRecord,
  calendarRecord,
} from '../../workers/inngest-jobs/context/records.js';

export const USER = 'life-replay-user';
export const TZ = 'America/New_York';
export const PERSON = { first_name: 'Noor', pronouns: 'she/her', identity: {} };

/** The morning everything leads to: Thursday 12 November 2026. */
export const TARGET = '2026-11-12';

// New York is four hours behind UTC until 1 November 2026, five after
const offsetHours = (day) => (day < '2026-11-01' ? 4 : 5);
export function at(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + offsetHours(day), m)).toISOString();
}

export const note = (id, day, time, subtype, title, body, over = {}) => ({
  id,
  owner_id: USER,
  subtype,
  journal_subtype: null,
  title,
  body,
  date: null,
  target_date: null,
  end_date: null,
  event_time: null,
  mood: null,
  views: {},
  list_items: null,
  origin: null,
  archived: false,
  external_source: null,
  swept_at: null,
  created_at: at(day, time),
  ...over,
});
export const todo = (id, day, time, title, over = {}) => ({
  id,
  owner_id: USER,
  title,
  name: title,
  body: null,
  notes: null,
  due_day: null,
  due_date: null,
  scheduled_date: null,
  target_date: null,
  status: 'active',
  completed_at: null,
  archived: false,
  archived_reason: null,
  resurface_at: null,
  views: {},
  list_items: null,
  time_estimate_minutes: null,
  skipped_in_sweep_at: null,
  created_at: at(day, time),
  ...over,
});
export const cal = (id, made, title, day, from, to, over = {}) => ({
  id,
  owner_id: USER,
  title,
  location: null,
  start_at: at(day, from),
  end_at: at(day, to),
  is_all_day: false,
  archived: false,
  cancelled_at: null,
  created_at: made,
  ...over,
});
export const chat = (id, day, time, content) => ({ id, content, created_at: at(day, time) });

// ── what they wrote, said and planned ─────────────────────────────────────

const NOTES = [
  note('n-swim', '2026-10-19', '20:10', 'journal', 'Monday', 'Swam before work again. That is three mornings this week now, I am actually keeping it up.'),
  note('n-mira', '2026-11-05', '21:30', 'journal', 'Thursday', 'Lunch with my sister Mira. She starts the new job at the museum on Monday and she is nervous about it.'),
  note('n-getaway', '2026-11-02', '12:00', 'event', 'Anniversary weekend in Hudson', 'Getaway with Eli', {
    date: '2026-11-06',
    target_date: '2026-11-06',
    end_date: '2026-11-08',
  }),
  note('n-grant', '2026-10-30', '22:00', 'journal', 'Friday', 'Cannot stop thinking about the grant decision. They said we would hear by Friday the 13th.'),
  note('n-pitch', '2026-11-10', '21:45', 'journal', 'Tuesday', 'Wiped out after the client pitch today. Early night.'),
];
const TODOS = [
  todo('t-lisbon', '2026-10-28', '09:15', 'Flights to Lisbon', {
    body: 'Book flights for the Lisbon work trip, 17 to 20 November',
  }),
  todo('t-invoice', '2026-11-11', '08:30', 'Send invoice to Hartley and Co', { due_day: TARGET }),
  todo('t-dinner', '2026-11-11', '08:31', 'Book a table for dinner tonight', { due_day: TARGET }),
];
const CALENDAR = [
  cal('c-gig', at('2026-11-03', '19:00'), 'Big Thief at the Anthem', '2026-11-11', '20:00', '23:00'),
  cal('c-standup', at('2026-11-09', '08:00'), 'Team standup', TARGET, '10:00', '10:30'),
  cal('c-priya', at('2026-11-09', '08:00'), '1:1 with Priya', TARGET, '14:00', '14:30'),
];
const CHATS = [
  {
    ...chat('m-mum', '2026-03-02', '19:40', 'Mostly work. I need to start thinking about Mum\'s 70th, it is on 20 November so I have ages.'),
    gremly: 'Anything fun on this week?',
  },
  {
    ...chat('m-early', '2026-10-21', '12:05', 'Can you not suggest anything before 9? Early meetings wreck my whole day, I hate them.'),
    gremly: 'You have a free slot at 8am tomorrow if you want to get ahead on the deck.',
  },
  {
    ...chat('m-anniv', '2026-11-06', '18:20', 'Ha, thank you! That is actually not until the 12th, this is just our getaway. Still need to find Eli a present before then.'),
    gremly: 'Happy anniversary to you and Eli! Any plans for the day?',
  },
];

export const TABLES = {
  notes: NOTES,
  todos: TODOS,
  synced_calendar_events: CALENDAR,
};

/** Every record the reader reads, in the order they happened, built as the reader builds them. */
export const RECORDS = [
  ...NOTES.map(noteRecord),
  ...TODOS.filter((t) => t.id !== 't-invoice' && t.id !== 't-dinner').map(todoRecord),
  ...CALENDAR.filter((c) => c.id === 'c-gig').map((c) => calendarRecord(c, TZ)),
  ...CHATS.map((m) => chatRecord(m, m.gremly)),
].sort((a, b) => a.at.localeCompare(b.at));

/**
 * What a friend would know on the morning of 12 November, set from the
 * records alone. must: the brief misses the day without it. should: a friend
 * would bring it up. could: worth a word when it fits. never: untrue.
 */
export const TRUTH = {
  ledger: [
    { key: 'anniversary-day', record: 'm-anniv', monthDay: '11-12', timing: 'yearly' },
    // her 70th is one day; her birthday comes every year: either keeps the date
    { key: 'mum-birthday', record: 'm-mum', monthDay: '11-20', timing: ['yearly', 'day'] },
    { key: 'swims', record: 'n-swim', timing: 'standing' },
    { key: 'early-meetings', record: 'm-early', timing: 'standing' },
  ],
  morning: [
    { key: 'anniversary', weight: 'must', what: 'Today, 12 November, is Noor and Eli\'s anniversary.' },
    { key: 'gig', weight: 'should', what: 'Last night Noor went to see Big Thief at the Anthem.' },
    { key: 'grant', weight: 'could', what: 'Noor expects to hear about the grant decision by tomorrow, Friday 13 November.' },
    { key: 'mum', weight: 'could', what: 'Noor\'s mum turns 70 on 20 November, eight days away.' },
    { key: 'lisbon', weight: 'could', what: 'Noor has a work trip to Lisbon from 17 to 20 November.' },
    { key: 'mira', weight: 'could', what: 'Noor\'s sister Mira started a new job at the museum this week, on Monday 9 November, and was nervous.' },
    { key: 'tired', weight: 'could', what: 'Noor was wiped out after a client pitch on Tuesday.' },
  ],
  // their day's own items: all true, and fine to name
  day: [
    'Team standup, 10:00 to 10:30 today.',
    '1:1 with Priya, 14:00 to 14:30 today.',
    'Todo due today: send the invoice to Hartley and Co.',
    'Todo due today: book a table for dinner tonight.',
    'Todo with no day: flights to Lisbon, to book flights for the work trip.',
    'Apart from the two meetings, the day is clear, from 8am to 9pm.',
  ],
  never: [
    'The anniversary was the weekend of 6 to 8 November, or any day but 12 November.',
    'Anything the records do not hold, stated as fact.',
  ],
  // what Ask Gremly's context must hold this morning, checked by code: the
  // facts from these records under what falls today, and these calendar
  // titles under yesterday
  chat: {
    today: ['m-anniv'],
    yesterday: ['Big Thief at the Anthem'],
  },
};
