/**
 * The sample days for the morning replay (data fabric stage 3): made up days
 * with known truth, as the database would hand them to the daily picture.
 * Every person, item and record here is made up.
 *
 * Each day gives its rows by table, the moment the picture is made and its
 * truth: the facts a glanceable line must never rest on. A cancelled entry
 * carries the stamp the reader gives it (cancelled_at); that it is never busy
 * time is held by code, and how the day speaks of it is for a person to read.
 */

const OFFSET = { 'Europe/London': 60, 'America/New_York': -240 };

/** A local time on a day as the UTC instant a row stores. */
function at(tz, day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Date.UTC(...day.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0)), h, m);
  return new Date(t - OFFSET[tz] * 60e3).toISOString();
}

const cal = (tz, id, title, day, from, to, over = {}) => ({
  id,
  title,
  location: null,
  start_at: at(tz, day, from),
  end_at: at(tz, day, to),
  is_all_day: false,
  cancelled_at: null,
  ...over,
});

const fact = (id, statement, over = {}) => ({
  id,
  statement,
  subject: null,
  about_date: null,
  about_date_end: null,
  state: 'current',
  date_confidence: 'exact',
  observed_at: '2026-10-05T09:00:00Z',
  last_confirmed_at: '2026-10-05T09:00:00Z',
  private: false,
  health: false,
  item_table: null,
  item_id: null,
  ...over,
});

const todo = (id, title, over = {}) => ({
  id,
  title,
  due_day: null,
  scheduled_date: null,
  time_estimate_minutes: null,
  priority_kind: null,
  created_at: '2026-10-03T09:00:00Z',
  skipped_in_sweep_at: null,
  ...over,
});

const habit = (id, name, over = {}) => ({
  id,
  name,
  title: null,
  frequency: null,
  cadence: 'weekly',
  target_per_period: 3,
  subtype: null,
  ...over,
});

const usage = (activeDays) => ({
  periods: [
    {
      active_days: activeDays,
      drops: 4,
      todos_done: 6,
      habit_checkins: 3,
      journals: 2,
      chat_messages: 12,
      sweeps: 1,
      fed_days: activeDays,
    },
    { active_days: 6 },
    { active_days: 5 },
  ],
});

const present = { days_away_before_today: 0, last_active_day_before_today: '2026-10-07', active_today: false, active_days_last_7: 6, active_days_last_30: 24 };

const TODAY = '2026-10-08';
const LDN = 'Europe/London';

export const DAYS = [
  {
    id: 'busy-morning',
    about: 'Four meetings back to back in the morning, two todos due, a habit behind for the week, the sister visiting at the weekend',
    tz: LDN,
    now: at(LDN, TODAY, '06:30'),
    tables: {
      synced_calendar_events: [
        cal(LDN, 'cal-1', 'Planning with the platform team', TODAY, '09:00', '10:00'),
        cal(LDN, 'cal-2', 'Hiring panel', TODAY, '10:00', '11:30'),
        cal(LDN, 'cal-3', 'Standup', TODAY, '11:30', '12:00'),
        cal(LDN, 'cal-4', 'Lunch with Priya', TODAY, '13:00', '14:00'),
      ],
      todos: [
        todo('todo-1', 'Send the Q4 budget to finance', { due_day: TODAY, time_estimate_minutes: 30 }),
        todo('todo-2', 'Book the car service', { due_day: TODAY, time_estimate_minutes: 15 }),
        todo('todo-3', 'Write up the hiring notes', { due_day: '2026-10-09' }),
      ],
      habits: [habit('hab-1', 'Run', { target_per_period: 3 })],
      habit_progress: [{ habit_id: 'hab-1', occurred_day: '2026-10-06' }],
      life_facts_now: [
        fact('fact-1', 'Alex’s sister Maya is visiting from Saturday 10 October to Monday 12 October.', {
          about_date: '2026-10-10',
          about_date_end: '2026-10-12',
          state: 'planned',
        }),
      ],
      life_fact_people: [{ fact_id: 'fact-1', person_id: 'per-1' }],
      life_people: [{ id: 'per-1', name: 'Maya', relationship: 'sister' }],
      life_person_names: [{ person_id: 'per-1', name: 'Maya' }],
    },
    absence: present,
    usage: usage(5),
    truth: { glanceableNever: [] },
  },
  {
    id: 'quiet-day',
    about: 'Nothing on the calendar and nothing due; an undated todo and a weekly habit',
    tz: LDN,
    now: at(LDN, TODAY, '07:00'),
    tables: {
      synced_calendar_events: [],
      calendar_connected: true,
      todos: [todo('todo-1', 'Sort the spare room'), todo('todo-2', 'Return the library books')],
      habits: [habit('hab-1', 'Read before bed', { cadence: 'daily', target_per_period: 7 })],
      habit_progress: [
        { habit_id: 'hab-1', occurred_day: '2026-10-05' },
        { habit_id: 'hab-1', occurred_day: '2026-10-06' },
        { habit_id: 'hab-1', occurred_day: '2026-10-07' },
      ],
      life_facts_now: [fact('fact-1', 'Alex wants to get back into painting on weekends.', { kind: 'goal' })],
    },
    absence: present,
    usage: usage(6),
    truth: { glanceableNever: [] },
  },
  {
    id: 'return-after-away',
    about: 'Back after six days away, five todos past their dates, a trip in four days',
    tz: LDN,
    now: at(LDN, TODAY, '08:15'),
    tables: {
      synced_calendar_events: [cal(LDN, 'cal-1', 'Dentist check up', TODAY, '15:00', '15:30')],
      todos: [
        todo('todo-1', 'Renew the passport', { due_day: '2026-10-01' }),
        todo('todo-2', 'Pay the water bill', { due_day: '2026-10-03' }),
        todo('todo-3', 'Reply to the school', { due_day: '2026-10-04' }),
        todo('todo-4', 'Order the new cable', { due_day: '2026-10-05' }),
        todo('todo-5', 'Call the bank', { due_day: '2026-10-06' }),
      ],
      life_facts_now: [
        fact('fact-1', 'Alex is going to Edinburgh from 12 October to 15 October for a conference.', {
          about_date: '2026-10-12',
          about_date_end: '2026-10-15',
          state: 'planned',
        }),
      ],
    },
    absence: { days_away_before_today: 6, last_active_day_before_today: '2026-10-01', active_today: false, active_days_last_7: 0, active_days_last_30: 14 },
    usage: { periods: [{ active_days: 0, drops: 0, todos_done: 0, habit_checkins: 0, journals: 0, chat_messages: 0, sweeps: 0, fed_days: 0 }, { active_days: 4 }] },
    truth: { glanceableNever: [] },
  },
  {
    id: 'travel-day',
    about: 'Flying to Lisbon this afternoon, a morning meeting and one after they set off',
    tz: LDN,
    now: at(LDN, TODAY, '06:45'),
    tables: {
      synced_calendar_events: [
        cal(LDN, 'cal-1', 'Quarterly review', TODAY, '09:30', '10:30'),
        cal(LDN, 'cal-2', 'Supplier call', TODAY, '17:00', '17:30'),
      ],
      todos: [todo('todo-1', 'Pack the chargers', { due_day: TODAY, time_estimate_minutes: 10 })],
      life_facts_now: [
        fact('fact-1', 'Alex flies to Lisbon on 8 October, leaving for the airport at 14:00.', {
          about_date: TODAY,
          state: 'planned',
        }),
        fact('fact-2', 'Alex is in Lisbon from 8 October to 11 October for a friend’s wedding.', {
          about_date: TODAY,
          about_date_end: '2026-10-11',
          state: 'planned',
        }),
      ],
    },
    absence: present,
    usage: usage(6),
    truth: { glanceableNever: [] },
  },
  {
    id: 'no-calendar',
    about: 'No calendar connected; two todos due and a habit',
    tz: 'America/New_York',
    now: at('America/New_York', TODAY, '07:00'),
    tables: {
      synced_calendar_events: [],
      calendar_connected: false,
      todos: [
        todo('todo-1', 'Finish the grant draft', { due_day: TODAY, time_estimate_minutes: 90 }),
        todo('todo-2', 'Pick up the prescription', { due_day: TODAY }),
      ],
      habits: [habit('hab-1', 'Walk at lunch', { target_per_period: 4 })],
      habit_progress: [
        { habit_id: 'hab-1', occurred_day: '2026-10-05' },
        { habit_id: 'hab-1', occurred_day: '2026-10-07' },
      ],
    },
    absence: present,
    usage: usage(5),
    truth: { glanceableNever: [] },
  },
  {
    id: 'cancelled-plan',
    about: 'Dinner with Jordan is still on the calendar but was cancelled; a gym class in the morning',
    tz: LDN,
    now: at(LDN, TODAY, '07:10'),
    tables: {
      synced_calendar_events: [
        cal(LDN, 'cal-1', 'Spin class', TODAY, '07:45', '08:30'),
        cal(LDN, 'cal-2', 'Dinner with Jordan', TODAY, '19:00', '21:00', {
          cancelled_at: '2026-10-07T20:00:00Z',
        }),
      ],
      notes: [
        {
          kind: 'other',
          id: 'note-1',
          title: 'Jordan cancelled dinner tomorrow, rain check',
          body: null,
          created_at: '2026-10-07T19:30:00Z',
        },
      ],
      todos: [todo('todo-1', 'Buy a birthday card for Jordan', { due_day: '2026-10-10' })],
      life_facts_now: [
        fact('fact-1', 'Alex’s dinner with Jordan on 8 October was cancelled.', {
          about_date: TODAY,
          state: 'changed',
        }),
      ],
    },
    absence: present,
    usage: usage(6),
    truth: { glanceableNever: [] },
  },
  {
    id: 'people',
    about: 'A brother whose relationship Alex stated, and a Sam whose relationship is not known',
    tz: LDN,
    now: at(LDN, TODAY, '07:00'),
    tables: {
      synced_calendar_events: [cal(LDN, 'cal-1', 'Coffee with Sam', TODAY, '10:00', '10:45')],
      life_facts_now: [
        fact('fact-1', 'Alex is meeting Sam for coffee on 8 October to talk about the side project.', {
          about_date: TODAY,
          state: 'planned',
        }),
        fact('fact-2', 'Alex’s brother Theo is starting a new job in Leeds on 12 October.', {
          about_date: '2026-10-12',
          state: 'planned',
        }),
      ],
      life_fact_people: [
        { fact_id: 'fact-1', person_id: 'per-1' },
        { fact_id: 'fact-2', person_id: 'per-2' },
      ],
      life_people: [
        { id: 'per-1', name: 'Sam', relationship: null },
        { id: 'per-2', name: 'Theo', relationship: 'brother' },
      ],
      life_person_names: [
        { person_id: 'per-1', name: 'Sam' },
        { person_id: 'per-2', name: 'Theo' },
      ],
    },
    absence: present,
    usage: usage(6),
    truth: { glanceableNever: [] },
  },
  {
    id: 'private-near-lead',
    about: 'A work deadline today and a private appointment at five that could pull the lead',
    tz: LDN,
    now: at(LDN, TODAY, '06:50'),
    tables: {
      synced_calendar_events: [cal(LDN, 'cal-1', 'Launch review', TODAY, '14:00', '15:00')],
      todos: [todo('todo-1', 'Ship the release notes', { due_day: TODAY, time_estimate_minutes: 45 })],
      life_facts_now: [
        fact('fact-1', 'Alex has a counselling session at 17:00 on 8 October.', {
          about_date: TODAY,
          state: 'planned',
          private: true,
          health: true,
        }),
        fact('fact-2', 'The product launch is on 9 October and Alex leads it.', {
          about_date: '2026-10-09',
          state: 'planned',
        }),
      ],
    },
    absence: present,
    usage: usage(6),
    truth: { glanceableNever: ['fact-1'] },
  },
  {
    id: 'health-day',
    about: 'A physio appointment today known from a fact about health, not marked private',
    tz: LDN,
    now: at(LDN, TODAY, '07:05'),
    tables: {
      synced_calendar_events: [cal(LDN, 'cal-1', 'Team sync', TODAY, '10:00', '10:30')],
      todos: [todo('todo-1', 'Do the knee stretches', { due_day: TODAY, time_estimate_minutes: 20 })],
      life_facts_now: [
        fact('fact-1', 'Alex has physio for a knee injury at 12:30 on 8 October.', {
          about_date: TODAY,
          state: 'planned',
          health: true,
        }),
      ],
    },
    absence: present,
    usage: usage(6),
    truth: { glanceableNever: ['fact-1'] },
  },
];

export const PERSON = { first_name: 'Alex', pronouns: null, identity: {} };
