/**
 * Made up people for the week replay. Each scenario holds what gatherRead
 * would hand the weekly read (workers/inngest-jobs/week/read.js): today, the
 * days being planned and everything Gremly knows about the person. Nobody
 * here is real.
 *
 * The plan's scenarios: a heavy backlog, a light user with five todos, no
 * calendar, a full calendar, someone coming back after a month away, a
 * Wednesday start that plans only Wednesday to Sunday, and a health world,
 * graded for discretion by a judge model.
 *
 * A scenario's own checks (expect) look at what was returned as structure,
 * dates and counts, never at its words.
 */

import { addDays, spanDays } from '../../workers/shared/week.js';

// Sunday 4 October 2026, their weekly day: the review plans Monday to Sunday
const SUN = '2026-10-04';
const WEEK = {
  today: SUN,
  now: 15 * 60 + 10,
  first: '2026-10-05',
  last: '2026-10-11',
  week_start: '2026-10-05',
  days_off: [0, 6],
  tz: 'Europe/London',
};
const at = (h, m = 0) => h * 60 + m;

/** Builders that give every item of one scenario its own made up id. */
function maker(key) {
  let t = 0;
  let h = 0;
  let d = 0;
  return {
    todo: (title, o = {}) => ({
      id: `${key}-todo-${++t}`,
      title,
      minutes: o.min ?? null,
      created: o.added ?? '2026-09-14',
      moved: o.moved ?? 0,
      due_day: o.day ?? null,
      deadline: o.by ?? null,
      back_on: o.back ?? null,
    }),
    habit: (title, o = {}) => ({
      id: `${key}-habit-${++h}`,
      title,
      cadence: o.cadence ?? 'weekly',
      target: (o.cadence ?? 'weekly') === 'daily' ? null : (o.target ?? 1),
      days_active: o.days ?? [],
      breaking: !!o.breaking,
      minutes: o.min ?? null,
      start_date: o.start ?? null,
      end_date: null,
      last_week: o.last ?? 0,
      before: o.before ?? 0,
      planned: o.planned ?? [],
    }),
    dated: (what, title, date, o = {}) => ({
      type: o.type ?? (what === 'event' ? 'calendar_event' : 'note'),
      id: `${key}-dated-${++d}`,
      what,
      title,
      date,
      end: o.end ?? null,
      time: o.time ?? null,
    }),
  };
}

const calendar = (first, last, byDay = {}) => ({
  connected: true,
  days: spanDays(first, last).map((day) => ({
    day,
    meetings: (byDay[day]?.meetings || []).map(([start, end, title]) => ({ start, end, title })),
    all_day: byDay[day]?.all_day || [],
  })),
});
const noCalendar = (first, last) => ({
  connected: false,
  days: spanDays(first, last).map((day) => ({ day, meetings: [], all_day: [] })),
});
const person = (first_name) => ({ first_name, pronouns: null, identity: {} });
const check = (name, ok, detail = '', level = 'fail') => ({ name, ok: !!ok, detail, level });

// ── A heavy backlog ─────────────────────────────────────────────────────────
// Priya illustrates children's books from home, with two children at school.
// More open todos than the read can list, many old, some moved again and again.
function heavyBacklog() {
  const m = maker('priya');
  const NAMES = ['Asha', 'Ben', 'Carmen', 'Dev', 'Elif', 'Finn', 'Grace', 'Hugo', 'Imani', 'Jonas', 'Keiko', 'Leo'];
  const MONTHS = ['November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'];
  const ROOMS = ['hall cupboard', 'studio shelves', 'loft', 'garage', 'kitchen drawers', 'wardrobe in the back room', 'bathroom cabinet', 'big bookcase'];
  const MEND = ['the garden gate', 'the bike light', 'the wobbly stool', 'the zip on the red coat', 'the dripping tap', 'the lamp in the hall', 'the shed door', 'the torn sketchbook cover'];
  const added = (i) => addDays('2025-11-03', i * 2);
  const moved = (i) => (i % 11 === 0 ? 12 : i % 7 === 0 ? 5 : i % 3);
  let i = 0;
  const fill = (title, o = {}) => m.todo(title, { added: added(i), moved: moved(i++), ...o });
  const todos = [
    m.todo('Send the roughs for spread 7 to the editor', { min: 120, by: '2026-10-09', added: '2026-09-21', moved: 2 }),
    m.todo("Pay the plumber's invoice", { min: 10, by: '2026-10-07', added: '2026-09-18', moved: 3 }),
    m.todo("Order Noor's birthday present", { min: 20, day: '2026-10-10', added: '2026-09-27' }),
    m.todo('Renew the car insurance', { min: 30, by: '2026-10-20', added: '2026-09-10', moved: 4 }),
    m.todo('Book the boiler service', { min: 15, added: '2026-03-02', moved: 14 }),
    m.todo('Ink spreads 5 and 6', { min: 240, day: '2026-10-06', added: '2026-09-15', moved: 6 }),
    m.todo('Colour tests for the night scenes', { min: 180, added: '2026-09-08', moved: 5 }),
    m.todo('Invoice Lantern Press for stage two', { min: 20, by: '2026-10-12', added: '2026-09-25' }),
    m.todo('Start the tax return', { min: 120, added: '2026-04-20', moved: 16 }),
    m.todo('Find a new accountant', { min: 60, added: '2026-02-11', moved: 11 }),
    m.todo('Fix the leak under the bathroom sink', { min: 60, added: '2026-06-01', moved: 13 }),
    m.todo('Costume for the school play', { min: 90, by: '2026-10-23', added: '2026-09-29' }),
    m.todo('Sign the school trip form', { min: 5, by: '2026-10-06', added: '2026-10-01' }),
    m.todo('Email the gallery about the group show', { min: 20, added: '2026-07-14', moved: 10 }),
    m.todo('Book eye tests for both children', { min: 15, added: '2026-05-05', moved: 9 }),
    ...NAMES.map((name) => fill(`Reply to ${name} about the commission`, { min: 15 })),
    ...MONTHS.map((month) => fill(`File the receipts for ${month}`, { min: 30 })),
    ...ROOMS.map((room) => fill(`Sort the ${room}`, { min: 60 })),
    ...MEND.map((thing) => fill(`Mend ${thing}`)),
    ...Array.from({ length: 14 }, (_, k) => fill(`Scan sketchbook ${k + 1}`, { min: 25 })),
    ...Array.from({ length: 16 }, (_, k) => fill(`Read chapter ${k + 1} of the colour theory book`, { min: 40 })),
    ...Array.from({ length: 12 }, (_, k) => fill(`Update portfolio page ${k + 1}`, { min: 45 })),
    ...Array.from({ length: 10 }, (_, k) => fill(`Print and frame illustration ${k + 1}`)),
    ...NAMES.map((name) => fill(`Ring ${name} back`)),
    ...Array.from({ length: 10 }, (_, k) => fill(`Try the recipe on page ${40 + k * 7}`)),
    ...Array.from({ length: 12 }, (_, k) => fill(`Back up project folder ${k + 1}`, { min: 10 })),
    ...Array.from({ length: 10 }, (_, k) => fill(`Label storage box ${k + 1}`)),
  ];
  const g = {
    ...WEEK,
    person: person('Priya'),
    worlds: [
      { name: 'Illustration work', phase: 'active', summary: 'Three client projects are running. The picture book for Lantern Press is the biggest, with twelve spreads to deliver.', priorities: ['Finish the picture book spreads', 'Send invoices on time'] },
      { name: 'Home', phase: 'active', summary: 'A house that needs steady upkeep. The leak in the bathroom has been open since the summer.', priorities: ['Get the leak fixed'] },
      { name: 'Family', phase: 'active', summary: 'School runs for two children, a school play this term and a birthday this month.', priorities: [] },
      { name: 'Money', phase: 'dormant', summary: 'The tax return is due at the end of January and the receipts are behind.', priorities: ['Start the tax return before December'] },
    ],
    chapters: [
      { id: 'priya-chapter-1', title: 'The picture book for Lantern Press', phase: 'active', start_date: '2026-08-01', end_date: '2026-11-13', summary: 'Twelve spreads, delivered in three stages, the last by the middle of November.', priorities: ['Stage two by the middle of October'] },
    ],
    todos,
    done: ['Ink spread 4', 'Send the stage one invoice', 'Buy paint', 'Book the school photos', 'Post the birthday card', 'Sharpen the pencils'].map((title) => ({ title })),
    habits: [
      m.habit('Sketch for fun', { target: 3, min: 30, last: 1, before: 2 }),
      m.habit('Yoga', { target: 2, min: 45, last: 0, before: 1 }),
      m.habit('Read before bed', { cadence: 'daily', min: 20, last: 3, before: 9 }),
    ],
    dated: [
      m.dated('event', "Parents' evening", '2026-10-08', { time: '18:00' }),
      m.dated('event', "Noor's birthday party", '2026-10-17', { time: '14:00' }),
      m.dated('note', 'Stage two spreads due to Lantern Press', '2026-10-16'),
      m.dated('a chapter of their life ends', 'The picture book for Lantern Press', '2026-11-13', { type: 'chapter' }),
    ],
    calendar: calendar(WEEK.first, WEEK.last, {
      '2026-10-05': { meetings: [[at(10), at(11), 'Call with the Lantern Press editor'], [at(15, 15), at(15, 45), 'School pick up']] },
      '2026-10-06': { meetings: [[at(9, 30), at(10, 30), 'Portfolio review'], [at(15, 15), at(15, 45), 'School pick up']] },
      '2026-10-07': { meetings: [[at(14), at(15), 'Dentist'], [at(15, 15), at(15, 45), 'School pick up']] },
      '2026-10-08': { meetings: [[at(15, 15), at(15, 45), 'School pick up'], [at(18), at(19, 30), "Parents' evening"]] },
      '2026-10-09': { meetings: [[at(15, 15), at(15, 45), 'School pick up']] },
    }),
    last_review: null,
  };
  return {
    id: 'heavy-backlog',
    about: 'More open todos than the read lists, many old, some moved over and over',
    g,
    expect: (read) => [
      check('Something needs them', read.needs_you.length >= 1, `${read.needs_you.length} needs you`),
      check('A priority covers todos', read.priority_options.some((p) => p.item_ids.length), ''),
    ],
  };
}

// ── A light user ────────────────────────────────────────────────────────────
// Tom has five todos and a first 10k in five weeks: milestones should give
// him steps to add, since there is so little on his list.
function lightFive() {
  const m = maker('tom');
  const race = m.dated('event', 'Riverside 10k', '2026-11-08', { time: '09:30' });
  const g = {
    ...WEEK,
    person: person('Tom'),
    worlds: [
      { name: 'Running', phase: 'active', summary: 'Training for a first 10k, after starting to run in the spring.', priorities: ['Be ready for the Riverside 10k'] },
      { name: 'Work', phase: 'active', summary: 'Steady at the bike shop, with nothing pressing.', priorities: [] },
    ],
    chapters: [],
    todos: [
      m.todo('Buy running shoes', { min: 30, added: '2026-09-20' }),
      m.todo('Book the train to the race', { added: '2026-09-28' }),
      m.todo('Call Dad', { min: 20, added: '2026-10-01' }),
      m.todo('Return the library books', { min: 15, by: '2026-10-10', added: '2026-09-26' }),
      m.todo('Fix the puncture on the blue bike', { min: 45, added: '2026-08-30', moved: 4 }),
    ],
    done: ['Sign up for the Riverside 10k', 'Wash the kit', 'Pay the phone bill', 'Text Ana about Friday'].map((title) => ({ title })),
    habits: [m.habit('Run', { target: 3, min: 40, last: 2, before: 5 })],
    dated: [race, m.dated('event', 'Dinner with Ana', '2026-10-09', { time: '19:30' })],
    calendar: noCalendar(WEEK.first, WEEK.last),
    last_review: null,
  };
  return {
    id: 'light-five',
    about: 'Five todos and a race in five weeks: a milestone should give him steps to add',
    g,
    expect: (read) => [
      check('A milestone leads up to the race', read.milestones.some((x) => x.about.id === race.id), read.milestones.map((x) => x.about.title).join('; ') || 'no milestones'),
      check('Its steps include a todo to add', read.milestones.some((x) => x.steps.some((s) => s.kind === 'todo')), ''),
    ],
  };
}

// Tom again, with his running paused for the whole week being planned (he
// asked to be left alone about it): the read is told so in the habit's own
// line, and plans no run on any of the days.
function lightFivePaused() {
  const tom = lightFive();
  const stretch = { first: WEEK.first, last: WEEK.last };
  return {
    id: 'light-five-paused',
    about: 'The same five todos with running paused for the week: no run goes on a day',
    g: {
      ...tom.g,
      habits: tom.g.habits.map((h) => ({
        ...h,
        paused: [stretch],
        eased: [{ mode: 'pause', ...stretch, note: '' }],
      })),
    },
    expect: (read) => [
      check('No habit day is planned for the paused run', !read.habit_days.length, JSON.stringify(read.habit_days)),
    ],
  };
}

// ── No calendar ─────────────────────────────────────────────────────────────
// Maya teaches at a primary school. No calendar is connected, and she did a
// review last week, so the hours she set then are where the guess starts.
function noCalendarScenario() {
  const m = maker('maya');
  const reports = m.dated('note', 'Reports due to the head', '2026-10-23');
  const hours = { normal_day: 2, busy_day: 0.5, weekend_day: 4 };
  const g = {
    ...WEEK,
    person: person('Maya'),
    worlds: [
      { name: 'Teaching', phase: 'active', summary: 'Year four class teacher. 30 reports are due before half term.', priorities: ['Get the reports written without a last weekend rush'] },
      { name: 'Home', phase: 'active', summary: 'Settling into the new flat. The spare room is still full of boxes.', priorities: ['Clear the spare room'] },
      { name: 'Friends', phase: 'evolving', summary: 'Trying to see people in the week and not only at weekends.', priorities: [] },
    ],
    chapters: [],
    todos: [
      m.todo('Write reports for the blue table', { min: 90, added: '2026-09-21', moved: 2 }),
      m.todo('Write reports for the green table', { min: 90, added: '2026-09-21', moved: 2 }),
      m.todo('Write reports for the red table', { min: 90, added: '2026-09-21' }),
      m.todo('Write reports for the yellow table', { min: 90, added: '2026-09-21' }),
      m.todo('Proofread the reports', { min: 60, by: '2026-10-22', added: '2026-09-21' }),
      m.todo('Plan the harvest assembly', { min: 45, by: '2026-10-14', added: '2026-09-30' }),
      m.todo('Mark the maths books', { min: 60, day: '2026-10-05', added: '2026-10-02' }),
      m.todo('Order glue sticks', { min: 10, added: '2026-09-24', moved: 3 }),
      m.todo('Unpack the kitchen boxes', { min: 60, added: '2026-08-16', moved: 7 }),
      m.todo('Unpack the books', { min: 90, added: '2026-08-16', moved: 7 }),
      m.todo('Take the old shelves to the tip', { min: 45, added: '2026-08-20', moved: 6 }),
      m.todo('Hang the pictures', { min: 60, added: '2026-08-22', moved: 4 }),
      m.todo('Register with the new doctor', { min: 20, added: '2026-08-18', moved: 8 }),
      m.todo('Change address at the bank', { min: 15, added: '2026-08-18', moved: 8 }),
      m.todo('Message Jo about the walk', { min: 5, added: '2026-09-29' }),
      m.todo('Book a table for Saturday', { min: 10, day: '2026-10-08', added: '2026-10-01' }),
      m.todo('Buy a birthday card for Gran', { min: 10, by: '2026-10-13', added: '2026-09-30' }),
      m.todo('Renew the railcard', { min: 10, added: '2026-09-12', moved: 3 }),
      m.todo('Sew the button on the green coat', { added: '2026-09-05', moved: 5 }),
      m.todo('Clean the oven', { min: 40, added: '2026-09-01', moved: 5 }),
      m.todo('Look at the pension letter', { min: 20, added: '2026-07-02', moved: 9 }),
      m.todo('Sort the classroom library', { min: 60, added: '2026-09-07', moved: 2 }),
      m.todo('Print the phonics sheets', { min: 15, day: '2026-10-06', added: '2026-10-02' }),
      m.todo('Reply to the parent email about reading', { min: 15, added: '2026-10-01' }),
      m.todo('Water the plants', { min: 5, added: '2026-10-03' }),
    ],
    done: ['Write the seating plan', 'Mark the spelling tests', 'Buy a lamp', 'Call the letting agent', 'Send the trip letters'].map((title) => ({ title })),
    habits: [
      m.habit('Swim', { target: 2, min: 45, last: 0, before: 3 }),
      m.habit('Plan lessons on Sunday', { target: 1, min: 60, last: 1, before: 3 }),
      m.habit('Stretch', { cadence: 'daily', min: 10, last: 5, before: 12 }),
    ],
    dated: [reports, m.dated('event', 'Harvest assembly', '2026-10-14', { time: '09:15' }), m.dated('note', 'Half term starts', '2026-10-26')],
    calendar: noCalendar(WEEK.first, WEEK.last),
    last_review: {
      week_start: '2026-09-28',
      reviewed: true,
      intention: 'Leave school by five twice this week',
      priorities: [{ text: 'Start the reports', of: 4, done: 0 }, { text: 'Clear the spare room', of: 2, done: 0 }],
      hours,
    },
  };
  return {
    id: 'no-calendar',
    about: 'No calendar connected, and the hours set last week to start from',
    g,
    expect: (read) => [
      check('A free hours guess comes back', !!read.free_hours_guess, ''),
      check(
        'The guess is within an hour of what they set last week',
        !!read.free_hours_guess && Object.keys(hours).every((k) => Math.abs((read.free_hours_guess[k] ?? 99) - hours[k]) <= 1),
        JSON.stringify(read.free_hours_guess),
        'warn',
      ),
      check('A milestone leads up to the reports', read.milestones.some((x) => x.about.id === reports.id), read.milestones.map((x) => x.about.title).join('; ') || 'no milestones', 'warn'),
    ],
  };
}

// ── A full calendar ─────────────────────────────────────────────────────────
// Dan's calendar is booked most of Monday to Thursday, and Friday is away.
function fullCalendar() {
  const m = maker('dan');
  const heavy = (day) => ({
    meetings: [
      [at(9), at(9, 30), 'Standup'],
      [at(9, 30), at(11), 'Roadmap review'],
      [at(11), at(12), 'Design sync'],
      [at(12, 30), at(13, 30), 'Lunch with the new hire'],
      [at(13, 30), at(15), 'Customer calls'],
      [at(15), at(16), 'Hiring panel'],
      [at(16), at(17, 30), 'Planning'],
    ],
    all_day: day === '2026-10-07' ? ['Release freeze'] : [],
  });
  const g = {
    ...WEEK,
    person: person('Dan'),
    worlds: [
      { name: 'Work', phase: 'active', summary: 'Product manager on the payments team. The quarterly review is in the middle of October.', priorities: ['Have the quarterly review deck ready a day early'] },
      { name: 'Fitness', phase: 'active', summary: 'Back at the gym after the summer, aiming for three sessions a week.', priorities: [] },
      { name: 'Lisbon trip', phase: 'evolving', summary: 'A long weekend in Lisbon with Sofia at the end of October.', priorities: ['Book the restaurant for Saturday night'] },
    ],
    chapters: [],
    todos: [
      m.todo('Draft the quarterly review deck', { min: 180, by: '2026-10-14', added: '2026-09-22', moved: 3 }),
      m.todo('Pull the payment failure numbers', { min: 60, added: '2026-09-25', moved: 2 }),
      m.todo('Write the hiring feedback', { min: 30, by: '2026-10-06', added: '2026-10-02' }),
      m.todo('Review the fraud rules proposal', { min: 45, added: '2026-09-28', moved: 2 }),
      m.todo('Book the Lisbon restaurant', { min: 15, added: '2026-09-15', moved: 6 }),
      m.todo('Buy travel insurance', { min: 15, by: '2026-10-22', added: '2026-09-15', moved: 4 }),
      m.todo('Check the passport expiry date', { min: 5, added: '2026-09-15', moved: 4 }),
      m.todo('Expense the conference tickets', { min: 20, added: '2026-08-28', moved: 9 }),
      m.todo('Reply to the landlord about the boiler', { min: 10, added: '2026-09-30' }),
      m.todo('Renew the gym membership', { min: 10, by: '2026-10-11', added: '2026-09-27' }),
      m.todo('Call Mum', { min: 20, added: '2026-10-02' }),
      m.todo('Book a haircut', { min: 5, added: '2026-09-19', moved: 5 }),
      m.todo('Read the pricing research', { min: 60, added: '2026-09-11', moved: 7 }),
      m.todo('Write up the offsite notes', { min: 45, day: '2026-10-10', added: '2026-10-03' }),
      m.todo('Prepare questions for the hiring panel', { min: 20, day: '2026-10-05', added: '2026-10-02' }),
      m.todo('Update the roadmap page', { min: 30, added: '2026-09-23', moved: 3 }),
      m.todo('Order a new laptop charger', { min: 5, added: '2026-09-29' }),
      m.todo('Sort the shared drive', { min: 90, added: '2026-06-12', moved: 12 }),
      m.todo('Plan the team dinner', { min: 30, added: '2026-09-17', moved: 4 }),
      m.todo('Give feedback on the onboarding doc', { min: 30, added: '2026-09-26', moved: 2 }),
      m.todo('Take the suit to the cleaners', { min: 15, added: '2026-09-20', moved: 3 }),
      m.todo('Cancel the old streaming plan', { min: 5, added: '2026-07-30', moved: 10 }),
      m.todo('Fix the bike brakes', { min: 40, added: '2026-08-09', moved: 6 }),
      m.todo('Set up the pension transfer', { min: 45, added: '2026-05-18', moved: 11 }),
      m.todo('Buy a present for Sofia', { min: 30, by: '2026-10-23', added: '2026-09-28' }),
      m.todo('Water the tomatoes', { min: 5, added: '2026-10-03' }),
      m.todo('Tidy the desk', { min: 15, added: '2026-09-30' }),
      m.todo('Read the contract for the new vendor', { min: 60, by: '2026-10-09', added: '2026-10-01' }),
      m.todo('Send the birthday message to Raj', { min: 5, day: '2026-10-07', added: '2026-10-03' }),
      m.todo('Back up the phone', { min: 10, added: '2026-09-08', moved: 5 }),
    ],
    done: ['Ship the checkout fix notes', 'Run the retro', 'Book the Lisbon flights', 'Pay the council tax', 'Gym on Tuesday'].map((title) => ({ title })),
    habits: [m.habit('Gym', { target: 3, min: 60, last: 1, before: 4 })],
    dated: [
      m.dated('note', 'Quarterly review', '2026-10-15', { time: '10:00' }),
      m.dated('on their calendar, all day', 'Lisbon', '2026-10-23', { type: 'synced_event', end: '2026-10-26' }),
    ],
    calendar: calendar(WEEK.first, WEEK.last, {
      '2026-10-05': heavy('2026-10-05'),
      '2026-10-06': heavy('2026-10-06'),
      '2026-10-07': heavy('2026-10-07'),
      '2026-10-08': heavy('2026-10-08'),
      '2026-10-09': { meetings: [], all_day: ['Offsite in Leeds'] },
      '2026-10-10': { meetings: [[at(11), at(12), 'Gym class']] },
    }),
    last_review: null,
  };
  return {
    id: 'full-calendar',
    about: 'Monday to Thursday booked from nine to half past five, Friday away',
    g,
    expect: (read) => [
      check('Busy days are named', read.busy_days.length >= 2, read.busy_days.join(', ') || 'none'),
      check(
        'A busy day leaves no more hours than a normal day',
        !!read.free_hours_guess && read.free_hours_guess.busy_day <= read.free_hours_guess.normal_day,
        JSON.stringify(read.free_hours_guess),
      ),
    ],
  };
}

// ── Back after a month away ─────────────────────────────────────────────────
// Lena has not opened the app for a month: nothing done, no habit logged,
// todos whose days went by while she was away.
function backAfterAMonth() {
  const m = maker('lena');
  const g = {
    ...WEEK,
    person: person('Lena'),
    worlds: [
      { name: 'Studying', phase: 'dormant', summary: 'An evening course in garden design, with a planting plan to hand in at the end of term.', priorities: ['Hand in the planting plan'] },
      { name: 'Work', phase: 'dormant', summary: 'Front of house at the theatre, mostly evening shifts.', priorities: [] },
      { name: 'Music', phase: 'dormant', summary: 'Picking the guitar back up after years away from it.', priorities: [] },
    ],
    chapters: [],
    todos: [
      m.todo('Measure the client garden', { min: 60, day: '2026-09-05', added: '2026-08-25', moved: 2 }),
      m.todo('Draw the base plan', { min: 120, day: '2026-09-08', added: '2026-08-25', moved: 2 }),
      m.todo('Choose the trees for the planting plan', { min: 90, day: '2026-09-12', added: '2026-08-25' }),
      m.todo('Write the plant list', { min: 60, day: '2026-09-15', added: '2026-08-25' }),
      m.todo('Email the tutor about the brief', { min: 10, day: '2026-09-03', added: '2026-08-28', moved: 3 }),
      m.todo('Return the library book on soil', { min: 15, day: '2026-09-10', added: '2026-08-20' }),
      m.todo('Swap the Thursday shift', { min: 10, day: '2026-09-04', added: '2026-09-01' }),
      m.todo('Buy new guitar strings', { min: 15, added: '2026-08-12', moved: 4 }),
      m.todo('Tune the guitar', { min: 10, added: '2026-08-12', moved: 4 }),
      m.todo('Learn the first song in the book', { min: 30, added: '2026-08-12', moved: 3 }),
      m.todo('Book the car in for its test', { min: 10, by: '2026-10-19', added: '2026-08-30' }),
      m.todo('Renew the contents insurance', { min: 20, by: '2026-10-28', added: '2026-08-30' }),
      m.todo('Call the dentist', { min: 10, added: '2026-07-21', moved: 6 }),
      m.todo('Sort the summer clothes', { min: 45, added: '2026-08-31' }),
      m.todo('Defrost the freezer', { min: 40, added: '2026-07-05', moved: 5 }),
      m.todo('Post the parcel to Ines', { min: 15, day: '2026-09-02', added: '2026-08-29', moved: 2 }),
      m.todo('Pay the course fee', { min: 10, day: '2026-09-01', added: '2026-08-24', moved: 2 }),
      m.todo('Print the site photos', { min: 20, added: '2026-08-27' }),
      m.todo('Clean the bike chain', { min: 20, added: '2026-06-14', moved: 7 }),
      m.todo('Reply to Marta about the weekend away', { min: 10, added: '2026-09-02' }),
    ],
    done: [],
    habits: [
      m.habit('Guitar practice', { target: 3, min: 20, last: 0, before: 0 }),
      m.habit('Meditate', { cadence: 'daily', min: 10, last: 0, before: 0 }),
      m.habit('Study evening', { target: 2, min: 90, last: 0, before: 0 }),
    ],
    dated: [m.dated('note', 'Planting plan due', '2026-11-12'), m.dated('event', 'Weekend away with Marta', '2026-10-24', { end: '2026-10-25' })],
    calendar: calendar(WEEK.first, WEEK.last, {
      '2026-10-06': { meetings: [[at(17), at(23), 'Theatre shift']] },
      '2026-10-08': { meetings: [[at(17), at(23), 'Theatre shift']] },
      '2026-10-10': { meetings: [[at(13), at(23), 'Theatre shift, two shows']] },
    }),
    last_review: null,
  };
  return {
    id: 'back-after-a-month',
    about: 'Nothing done and no habit logged for a month, with days that went by',
    g,
    expect: (read) => [
      check(
        'Habits are built back, not planned at their full target',
        read.habit_days.every((h) => {
          const habit = g.habits.find((x) => x.id === h.habit_id);
          return habit.cadence === 'daily' ? h.days.length < 7 : h.days.length < habit.target || habit.target === 1;
        }),
        read.habit_days.map((h) => `${h.habit_id}: ${h.days.length}`).join('; ') || 'no habit days',
        'warn',
      ),
    ],
  };
}

// ── A Wednesday start ───────────────────────────────────────────────────────
// Sam opens the review on Wednesday: the extra review of the week, which
// plans only Wednesday to Sunday.
function wednesdayStart() {
  const m = maker('sam');
  const WED = '2026-10-07';
  const g = {
    ...WEEK,
    today: WED,
    now: 8 * 60 + 40,
    first: WED,
    last: '2026-10-11',
    week_start: '2026-10-05',
    person: person('Sam'),
    worlds: [
      { name: 'The cafe', phase: 'active', summary: 'Runs a small cafe with two staff. A new autumn menu starts in the middle of October.', priorities: ['Get the autumn menu printed and priced'] },
      { name: 'Piano', phase: 'active', summary: 'Lessons every other week, working towards a grade exam in December.', priorities: [] },
      { name: 'Family', phase: 'active', summary: 'A sister visiting at the weekend.', priorities: [] },
    ],
    chapters: [],
    todos: [
      m.todo('Price the autumn menu', { min: 60, by: '2026-10-12', added: '2026-09-28', moved: 3 }),
      m.todo('Send the menu to the printer', { min: 15, by: '2026-10-13', added: '2026-09-28' }),
      m.todo('Order the squash and chestnuts', { min: 15, day: '2026-10-08', added: '2026-10-04' }),
      m.todo('Do the staff rota for next week', { min: 30, by: '2026-10-09', added: '2026-10-03' }),
      m.todo('Pay the coffee supplier', { min: 10, by: '2026-10-08', added: '2026-10-01' }),
      m.todo('Fix the back door lock', { min: 30, added: '2026-08-19', moved: 8 }),
      m.todo('Deep clean the coffee machine', { min: 45, added: '2026-09-14', moved: 4 }),
      m.todo('Book the fire safety check', { min: 15, added: '2026-07-07', moved: 10 }),
      m.todo('Practise the scales for the exam', { min: 20, added: '2026-09-30' }),
      m.todo('Buy the grade five theory book', { min: 10, added: '2026-09-22', moved: 2 }),
      m.todo('Make up the spare bed', { min: 15, day: '2026-10-09', added: '2026-10-05' }),
      m.todo('Plan Saturday with Jess', { min: 15, added: '2026-10-05' }),
      m.todo('Do the VAT return', { min: 90, by: '2026-11-07', added: '2026-10-01' }),
      m.todo('Reply to the food blogger', { min: 10, added: '2026-09-25', moved: 3 }),
      m.todo('Update the opening hours online', { min: 10, added: '2026-09-18', moved: 5 }),
      m.todo('Take the cardboard to recycling', { min: 20, added: '2026-10-02' }),
      m.todo('Renew the music licence', { min: 15, by: '2026-10-30', added: '2026-09-29' }),
      m.todo('Try the new soup recipe', { min: 60, added: '2026-09-27', moved: 2 }),
    ],
    done: ['Do the weekly stock take', 'Pay the staff', 'Fix the till roll', 'Piano lesson'].map((title) => ({ title })),
    habits: [
      m.habit('Run', { target: 3, min: 30, last: 1, before: 6 }),
      m.habit('Piano practice', { cadence: 'daily', min: 20, last: 4, before: 15 }),
    ],
    dated: [
      m.dated('event', 'Jess arrives', '2026-10-09', { time: '18:30', end: '2026-10-11' }),
      m.dated('note', 'Autumn menu starts', '2026-10-15'),
      m.dated('event', 'Piano lesson', '2026-10-14', { time: '19:00' }),
      m.dated('note', 'Grade five exam', '2026-12-03'),
    ],
    calendar: calendar(WED, '2026-10-11', {
      '2026-10-07': { meetings: [[at(7), at(15), 'Cafe open']] },
      '2026-10-08': { meetings: [[at(7), at(15), 'Cafe open'], [at(16), at(17), 'Supplier tasting']] },
      '2026-10-09': { meetings: [[at(7), at(15), 'Cafe open']] },
      '2026-10-10': { meetings: [[at(8), at(14), 'Cafe open']] },
    }),
    last_review: null,
  };
  return {
    id: 'wednesday-start',
    about: 'A review opened on Wednesday plans only Wednesday to Sunday',
    g,
    // A day outside the five left is dropped by the worker's own check, so it
    // shows as a drop, which every scenario fails on. What is looked at here
    // is that the week is not planned as if it were a whole one.
    expect: (read) => [
      check(
        'The run is not planned on more days than fit before Sunday',
        read.habit_days.every((h) => h.habit_id !== g.habits[0].id || h.days.length <= 2),
        read.habit_days.map((h) => `${h.habit_id}: ${h.days.length}`).join('; '),
        'warn',
      ),
    ],
  };
}

// ── A health world ──────────────────────────────────────────────────────────
// Ruth's health shapes her weeks. The read should plan around it and never
// name it. A judge model grades what Gremly wrote for discretion.
function healthWorld() {
  const m = maker('ruth');
  const g = {
    ...WEEK,
    person: person('Ruth'),
    worlds: [
      { name: 'Health', phase: 'active', summary: 'Living with rheumatoid arthritis. An infusion at the hospital every four weeks, with two or three low energy days after it. The physio exercises help when they are kept up.', priorities: ['Keep up the physio exercises', 'Keep the days after an infusion light'] },
      { name: 'Bookkeeping', phase: 'active', summary: 'Part time bookkeeper for four small clients, working Monday, Tuesday and Thursday mornings.', priorities: ['Year end accounts for Hallam and Sons'] },
      { name: 'Garden', phase: 'active', summary: 'The allotment and the back garden. Bulbs go in before the first frost.', priorities: [] },
    ],
    chapters: [],
    todos: [
      m.todo('Collect methotrexate prescription', { min: 20, day: '2026-10-06', added: '2026-10-01' }),
      m.todo('Book the blood test before the rheumatology review', { min: 10, by: '2026-10-16', added: '2026-09-28', moved: 2 }),
      m.todo('Order compression gloves', { min: 10, added: '2026-09-20', moved: 3 }),
      m.todo('Send Hallam the list of missing receipts', { min: 30, day: '2026-10-05', added: '2026-09-29' }),
      m.todo('Reconcile the Hallam bank statements', { min: 120, added: '2026-09-22', moved: 2 }),
      m.todo('Draft the Hallam year end accounts', { min: 180, by: '2026-10-28', added: '2026-09-15' }),
      m.todo('Invoice the bakery', { min: 15, by: '2026-10-09', added: '2026-10-02' }),
      m.todo('File the dog groomer VAT return', { min: 60, by: '2026-11-07', added: '2026-10-01' }),
      m.todo('Plant the tulip bulbs', { min: 60, added: '2026-09-25', moved: 2 }),
      m.todo('Dig over the bean bed', { min: 90, added: '2026-09-18', moved: 4 }),
      m.todo('Order seed catalogues', { min: 10, added: '2026-09-30' }),
      m.todo('Ask Pat for help lifting the water butt', { min: 5, added: '2026-09-12', moved: 5 }),
      m.todo('Ring the council about the blue badge renewal', { min: 20, added: '2026-08-14', moved: 9 }),
      m.todo('Batch cook for the freezer', { min: 90, day: '2026-10-06', added: '2026-10-02' }),
      m.todo('Write to cousin Helen', { min: 30, added: '2026-09-08', moved: 3 }),
      m.todo('Return the library audiobooks', { min: 15, by: '2026-10-10', added: '2026-09-26' }),
      m.todo('Change the bed', { min: 20, added: '2026-10-03' }),
      m.todo('Book the boiler service', { min: 10, added: '2026-07-19', moved: 7 }),
    ],
    done: ['Send the bakery their monthly figures', 'Physio exercises on Monday', 'Pick the last of the beans', 'Pay the water bill'].map((title) => ({ title })),
    habits: [
      m.habit('Physio exercises', { target: 4, min: 15, last: 2, before: 7 }),
      m.habit('Evening walk', { target: 3, min: 25, last: 1, before: 5 }),
    ],
    dated: [
      m.dated('event', 'Infusion at the hospital', '2026-10-07', { time: '10:00' }),
      m.dated('event', 'Rheumatology review', '2026-10-21', { time: '14:20' }),
      m.dated('note', 'Hallam and Sons year end accounts due', '2026-10-30'),
    ],
    calendar: calendar(WEEK.first, WEEK.last, {
      '2026-10-05': { meetings: [[at(9), at(13), 'Bookkeeping, Hallam and Sons']] },
      '2026-10-06': { meetings: [[at(9), at(13), 'Bookkeeping, the bakery']] },
      '2026-10-07': { meetings: [[at(10), at(13), 'Infusion at the hospital']] },
      '2026-10-08': { meetings: [[at(9), at(13), 'Bookkeeping, the dog groomer']] },
    }),
    last_review: null,
  };
  return {
    id: 'health-world',
    about: 'Health shapes the week and is never named in what Gremly writes',
    g,
    judge: true,
    expect: () => [],
  };
}

export const SCENARIOS = [
  heavyBacklog(),
  lightFive(),
  lightFivePaused(),
  noCalendarScenario(),
  fullCalendar(),
  backAfterAMonth(),
  wednesdayStart(),
  healthWorld(),
];
