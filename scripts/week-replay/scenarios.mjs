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
 * And one for what the review of 6 October 2026 got wrong: a calendar that
 * holds a life as well as a working week, a long list beside one piece of work
 * the week turns on, and dated todos that are one piece of work each.
 *
 * A scenario's own checks (expect) look at what was returned as structure,
 * dates and counts, never at its words. What a scenario says of itself
 * (checks.mjs, run.mjs reads these):
 *   calendar      'none' when nothing on the calendar is a meeting, so Gremly calls
 *                 none of it one; 'mixed' when only some of it is, so Gremly never
 *                 counts or describes it all as meetings
 *   specific      one particular thing is where the week could go wrong, so the
 *                 size of the list as a whole is not the challenge (a judge reads it)
 *   deliverables  the dated todos that are deliverables needing work before them;
 *                 every other todo is one piece of work, and never gets a milestone
 *   spreadMiss    what the spread is known to get wrong for this person: the
 *                 spread's replay (spread.mjs) names it and runs them only by name
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
    // an entry with an id is one the read can name as a moment that is coming up
    meetings: (byDay[day]?.meetings || [])
      .map(([start, end, title, id]) => ({ start, end, title, ...(id ? { id } : {}) }))
      .sort((a, b) => a.start - b.start),
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
    // the spreads for Lantern Press are what the week turns on, not the length of the list
    specific: true,
    // two work calls among school pick ups, an appointment and a parents' evening
    calendar: 'mixed',
    // a costume is made over days
    deliverables: [todos.find((t) => t.title === 'Costume for the school play').id],
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
    specific: true,
    // an assembly is planned over days
    deliverables: [g.todos.find((t) => t.title === 'Plan the harvest assembly').id],
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
    // a lunch and a gym class sit among the meetings
    calendar: 'mixed',
    specific: true,
    deliverables: [g.todos.find((t) => t.title === 'Draft the quarterly review deck').id],
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
    // her calendar is her shifts
    calendar: 'none',
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
    // his calendar is the cafe's opening hours and a tasting
    calendar: 'none',
    specific: true,
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
    calendar: 'none',
    deliverables: [g.todos.find((t) => t.title === 'Draft the Hallam year end accounts').id],
    expect: () => [],
  };
}

// ── A calendar that holds a life ────────────────────────────────────────────
// Kofi is head of music at a secondary school and conducts a community choir.
// His calendar is his timetable, with two moments of his own among the
// lessons. His list is long, most of it on the days being planned, and one
// piece of work is what the week turns on: the Year 11 coursework marks. Three
// of his dated todos are one piece of work each, and the winter concert is the
// one thing ahead that needs preparing for.
function calendarLife() {
  const m = maker('kofi');
  const concert = m.dated('event', 'Winter concert', '2026-11-05', { time: '19:00' });
  const DINNER = 'kofi-entry-dinner';
  const FINAL = 'kofi-entry-final';
  let n = 0;
  const lesson = (start, end, title) => [start, end, title, `kofi-entry-${++n}`];
  const school = (extra = []) => ({
    meetings: [
      lesson(at(8, 40), at(9), 'Tutor group'),
      lesson(at(9), at(10), 'Year 8 music'),
      lesson(at(10), at(11), 'Year 10 music'),
      lesson(at(11, 20), at(12, 20), 'Year 11 music'),
      lesson(at(13, 10), at(14, 10), 'Year 7 music'),
      lesson(at(14, 10), at(15, 10), 'Year 9 music'),
      ...extra,
    ],
  });
  const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  let i = 0;
  // most of the list sits on the days being planned, a handful on each
  const onDay = (title, o = {}) => m.todo(title, { day: days[i++ % 5], added: '2026-09-21', ...o });
  const old = (title, o = {}) => m.todo(title, { added: '2026-04-13', moved: 11, ...o });
  const marks = m.todo('Enter the Year 11 coursework marks', { min: 180, by: '2026-10-16', added: '2026-09-14', moved: 4 });
  const minibus = m.todo('Book the minibus for the concert', { min: 15, by: '2026-10-21', added: '2026-09-25' });
  const insurance = m.todo('Renew the car insurance', { min: 20, by: '2026-10-27', added: '2026-09-20', moved: 2 });
  const programmes = m.todo('Order the concert programmes', { min: 20, by: '2026-10-30', added: '2026-09-28' });
  const todos = [
    marks,
    m.todo('Moderate the Year 11 compositions', { min: 240, day: '2026-10-07', added: '2026-09-14', moved: 5 }),
    m.todo('Listen to the last six Year 11 recordings', { min: 120, day: '2026-10-06', added: '2026-09-21', moved: 3 }),
    minibus,
    insurance,
    programmes,
    onDay('Mark the Year 9 listening tests', { min: 60 }),
    onDay('Write the Year 8 homework sheet', { min: 30 }),
    onDay('Restring the two class guitars', { min: 40, moved: 3 }),
    onDay('Print the choir parts for the carol service', { min: 20 }),
    onDay('Email the parents about concert tickets', { min: 20 }),
    onDay('Tune the practice room piano', { min: 30, moved: 2 }),
    onDay('Update the seating plan for the orchestra', { min: 25 }),
    onDay('Choose the Year 7 class song', { min: 15 }),
    onDay('Photocopy the theory booklets', { min: 15 }),
    onDay('Reply to the head about the music budget', { min: 20, moved: 2 }),
    onDay('Book the hall for the dress rehearsal', { min: 10 }),
    onDay('Mark the Year 10 composition drafts', { min: 90, moved: 2 }),
    onDay('Order new drum sticks', { min: 10 }),
    onDay('Tidy the instrument store', { min: 45, moved: 4 }),
    onDay('Write the choir newsletter', { min: 30 }),
    onDay('Send the rehearsal dates to the brass players', { min: 10 }),
    onDay('Fix the music stand trolley', { min: 20, moved: 3 }),
    onDay('Check the microphones for the concert', { min: 30 }),
    onDay('Plan the Year 9 samba lesson', { min: 40 }),
    onDay('Fill in the trip risk assessment', { min: 30, moved: 2 }),
    onDay('Ring the piano tuner', { min: 10 }),
    onDay('Write the cover work for Friday period two', { min: 20 }),
    onDay('Sort the sheet music cupboard', { min: 60, moved: 6 }),
    onDay('Buy a card for Ama', { min: 10 }),
    onDay('Wash the football kit for Kwame', { min: 15 }),
    old('Unpack the boxes in the spare room', { min: 90 }),
    old('Put up the shelves in the hall', { min: 60 }),
    old('Take the old sofa to the tip', { min: 45, moved: 13 }),
    old('Register with the new dentist', { min: 15, moved: 12 }),
    old('Change the address on the driving licence', { min: 15, moved: 14 }),
    old('Hang the pictures', { min: 40 }),
    old('Find the piano removal quote', { min: 20, moved: 10 }),
    old('Paint the bedroom', { min: 240, moved: 10 }),
    old('Fix the bathroom extractor fan', { min: 60, moved: 12 }),
    old('Sort the old phone contracts', { min: 30, moved: 10 }),
    old('Scan the degree certificates', { min: 15 }),
    old('Back up the choir recordings', { min: 30, moved: 10 }),
  ];
  const g = {
    ...WEEK,
    person: person('Kofi'),
    worlds: [
      { name: 'School', phase: 'active', summary: 'Head of music at a secondary school. The Year 11 coursework marks go to the exams officer on 16 October, and the winter concert is on 5 November.', priorities: ['Year 11 coursework marks in on time', 'A winter concert the students are proud of'] },
      { name: 'Community choir', phase: 'active', summary: 'Conducts a community choir on Thursday evenings, with a carol service in December.', priorities: [] },
      { name: 'Family', phase: 'active', summary: 'His sister Ama finishes her degree this month, and his nephew Kwame plays football on Saturdays.', priorities: ['Be there for Ama and Kwame'] },
      { name: 'Home', phase: 'dormant', summary: 'A flat he moved into in the spring and has not finished unpacking.', priorities: [] },
    ],
    chapters: [],
    todos,
    done: ['Mark the Year 7 rhythm tests', 'Book the brass tutor', 'Order the concert posters', 'Pay the choir hall hire'].map((title) => ({ title })),
    habits: [
      m.habit('Piano practice', { target: 4, min: 30, last: 2, before: 7 }),
      m.habit('Run', { target: 2, min: 30, last: 1, before: 4 }),
    ],
    dated: [
      concert,
      m.dated('note', 'Year 11 coursework marks due to the exams officer', '2026-10-16'),
      m.dated('note', 'Half term starts', '2026-10-26'),
    ],
    calendar: calendar(WEEK.first, WEEK.last, {
      '2026-10-05': school([lesson(at(12, 20), at(13, 10), 'Lunch duty')]),
      '2026-10-06': school([lesson(at(15, 30), at(17), 'Orchestra rehearsal')]),
      '2026-10-07': school([lesson(at(12, 20), at(13, 10), 'Lunch duty')]),
      '2026-10-08': school([lesson(at(19, 30), at(21, 30), 'Community choir')]),
      '2026-10-09': school([[at(19), at(22), "Dinner for Ama's graduation", DINNER]]),
      '2026-10-10': { meetings: [[at(14), at(16), "Kwame's cup final", FINAL]] },
    }),
    last_review: null,
  };
  const ordinary = new Set(
    g.calendar.days.flatMap((d) => d.meetings.map((x) => x.id)).filter((id) => id !== DINNER && id !== FINAL),
  );
  // a calendar moment is named by its id; a read that cannot name it gives its day alone
  const has = (read, id, day) => read.coming_up.some((c) => c.item?.id === id || (c.when === day && !c.item));
  return {
    id: 'calendar-life',
    about: 'A timetable with two moments of his own in it, a long list, and marks due next week',
    g,
    calendar: 'none',
    specific: true,
    deliverables: [marks.id],
    // Found on 9 October 2026, the same before and after the read's change.
    // The spread still does it; the app's board now says so before the week
    // is finished, and offers a day or a split (lib/week/board/model.ts unfitted).
    spreadMiss:
      'the spread leaves his three hour priority, the marks, off every day in 4 runs of 5, though a day off has room for it',
    expect: (read) => [
      check('The graduation dinner is coming up', has(read, DINNER, '2026-10-09'), read.coming_up.map((c) => `${c.when.slice(5)} ${c.what}`).join('; ')),
      check('The cup final is coming up', has(read, FINAL, '2026-10-10'), ''),
      check(
        'No lesson or rehearsal is coming up',
        !read.coming_up.some((c) => ordinary.has(c.item?.id)),
        read.coming_up.filter((c) => ordinary.has(c.item?.id)).map((c) => c.what).join('; '),
      ),
      check('A milestone leads up to the winter concert', read.milestones.some((x) => x.about.id === concert.id), read.milestones.map((x) => x.about.title).join('; ') || 'no milestones', 'warn'),
    ],
  };
}

// ── A long list on the days being planned ───────────────────────────────────
// Halima runs a small bookshop. Most of her open todos sit on the days being
// planned, many of them old and moved again and again, and her calendar holds
// about twelve hours of school runs, supplier calls and a book club. Nothing
// in her worlds says what matters most, so the length of the list is the easy
// thing to call the challenge. Two dated pieces of work in the next fortnight
// are what the week should turn on. The cottage is one todo, however far off.
function longList() {
  const m = maker('halima');
  const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  let i = 0;
  const onDay = (title, o = {}) => m.todo(title, { day: days[i++ % 6], added: '2026-09-07', ...o });
  const stale = (title, o = {}) => onDay(title, { added: '2026-03-16', moved: 11, ...o });
  const stocktake = m.todo('Finish the stocktake for the insurer', { min: 180, by: '2026-10-18', day: '2026-10-08', added: '2026-05-11', moved: 12 });
  const cottage = m.todo('Book the cottage for the new year trip', { by: '2026-11-01', added: '2026-08-24', moved: 3 });
  const evening = m.dated('event', 'Author evening with Noor Rahimi', '2026-10-22', { time: '18:30' });
  const todos = [
    stocktake,
    m.todo('Fill in the fire safety forms', { min: 120, by: '2026-10-20', day: '2026-10-09', added: '2026-04-20', moved: 10 }),
    m.todo('Send the VAT figures to the bookkeeper', { min: 45, by: '2026-10-08', day: '2026-10-07', added: '2026-09-28', moved: 2 }),
    m.todo('Plan the December window display', { min: 60, day: '2026-10-10', added: '2026-09-21' }),
    cottage,
    stale('Chase the unpaid school invoice', { min: 15, moved: 14 }),
    stale('Reprice the second hand shelves', { min: 90, moved: 13 }),
    stale('Fix the till receipt printer', { min: 30, moved: 12 }),
    stale('Clear the stock room floor', { min: 60, moved: 15 }),
    stale('Update the shop website hours', { min: 15, moved: 10 }),
    stale('Return the damaged delivery', { min: 20, moved: 12 }),
    stale('Write the staff handbook page on returns', { min: 45, moved: 10 }),
    stale('Order new carrier bags', { min: 10, moved: 11 }),
    stale('Sort the loyalty card list', { min: 40, moved: 13 }),
    stale('Mend the reading corner lamp', { min: 20, moved: 10 }),
    stale('Reply to the school librarian', { min: 15, moved: 12 }),
    stale('Photograph the signed editions', { min: 30, moved: 10 }),
    stale('Cancel the old card reader contract', { min: 20, moved: 16 }),
    stale('Clean the shop awning', { min: 40, moved: 11 }),
    stale('Label the poetry section', { min: 30, moved: 10 }),
    stale('File the supplier statements', { min: 30, moved: 12 }),
    stale('Find a new window cleaner', { min: 15, moved: 10 }),
    stale('Renew the music licence', { min: 15, moved: 13 }),
    stale('Tidy the staff kitchen', { min: 20, moved: 10 }),
    stale('Back up the till', { min: 15, moved: 12 }),
    stale('Take the old shelving to the tip', { min: 45, moved: 14 }),
    stale('Write up the summer sales figures', { min: 60, moved: 10 }),
    stale('Replace the door bell battery', { min: 5, moved: 11 }),
    onDay('Order the book club title for November', { min: 15 }),
    onDay('Put up the half term posters', { min: 20 }),
    onDay('Email the publisher rep about proofs', { min: 15, moved: 2 }),
    onDay('Do the staff rota', { min: 30 }),
    onDay('Wrap the school order', { min: 40 }),
    onDay('Pick the staff picks for October', { min: 20 }),
    onDay('Buy a present for Laila', { min: 30 }),
    onDay("Book Idris's swimming lessons", { min: 10, moved: 3 }),
    onDay('Take the cat to be weighed', { min: 30 }),
    m.todo('Read the proof of the spring lead title', { min: 180, added: '2026-09-14', moved: 4 }),
    m.todo('Look into a second till', { min: 45, added: '2026-06-01', moved: 6 }),
    m.todo('Ask about the flat above the shop', { min: 20, added: '2026-07-13', moved: 5 }),
  ];
  const run = [at(8, 30), at(9), 'School run'];
  const g = {
    ...WEEK,
    person: person('Halima'),
    worlds: [
      { name: 'The bookshop', phase: 'active', summary: 'Owns and runs a small independent bookshop with two part time staff.', priorities: [] },
      { name: 'Family', phase: 'active', summary: 'One son, Idris, at primary school. Her friend Laila turns forty this month.', priorities: [] },
      { name: 'Home', phase: 'active', summary: 'A terraced house near the shop.', priorities: [] },
    ],
    chapters: [],
    todos,
    done: ['Order the Christmas catalogue titles', 'Pay the staff', 'Bank the takings', 'Change the window for autumn'].map((title) => ({ title })),
    habits: [
      m.habit('Read for an hour', { target: 3, min: 60, last: 1, before: 5 }),
      m.habit('Swim', { target: 2, min: 45, last: 1, before: 3 }),
    ],
    dated: [
      evening,
      m.dated('note', "Laila's 40th in Leeds", '2026-10-24'),
      m.dated('note', 'Half term starts', '2026-10-26'),
    ],
    calendar: calendar(WEEK.first, WEEK.last, {
      '2026-10-05': { meetings: [run, [at(10), at(11), 'Call with the wholesaler'], [at(15, 15), at(15, 45), 'School pick up']] },
      '2026-10-06': { meetings: [run, [at(11), at(12), 'Publisher rep visit'], [at(15, 15), at(15, 45), 'School pick up'], [at(19), at(20, 30), 'Shop book club']] },
      '2026-10-07': { meetings: [run, [at(14), at(15), 'Staff meeting'], [at(15, 15), at(15, 45), 'School pick up']] },
      '2026-10-08': { meetings: [run, [at(15, 15), at(15, 45), 'School pick up'], [at(16), at(17), "Idris's swimming lesson"]] },
      '2026-10-09': { meetings: [run, [at(10), at(11, 30), 'School order delivery'], [at(15, 15), at(15, 45), 'School pick up']] },
      '2026-10-10': { meetings: [[at(10), at(11), 'Story time at the shop']] },
    }),
    last_review: null,
  };
  return {
    id: 'long-list',
    about: 'Most of a long, old list sits on the days being planned, with two dated pieces of work in it',
    g,
    calendar: 'mixed',
    specific: true,
    // a stocktake is done over days; the forms and the cottage are one piece of work each
    deliverables: [stocktake.id],
    expect: (read) => [
      check('A milestone leads up to the author evening', read.milestones.some((x) => x.about.id === evening.id), read.milestones.map((x) => x.about.title).join('; ') || 'no milestones', 'warn'),
    ],
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
  calendarLife(),
  longList(),
];
