/**
 * @jest-environment node
 */
// The week spread (workers/inngest-jobs/week/spread.js): what it is made
// from, what the model is given, and the check on what comes back. The person
// here is made up.

import {
  SPREAD_SCHEMA,
  WEEK_SPREAD_VERSION,
  checkSpread,
  readBoard,
  renderSpread,
  runWeekSpread,
  spreadFrame,
  spreadSystem,
  storedSpread,
} from '../spread';
import { jsonCall } from '../../context/llm';

jest.mock('../../context/llm', () => ({
  ...jest.requireActual('../../context/llm'),
  jsonCall: jest.fn(),
}));

// Sunday 4 October 2026: the review plans Monday 5 to Sunday 11
const TODAY = '2026-10-04';
const [MON, TUE, WED, THU, FRI, SAT, SUN] = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];
const id = (n) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const REPORT = id('a');
const VENUE = id('b');
const PLUMBER = id('c');
const TAXES = id('d');
const GIFT = id('e');
const PASSPORT = id('f');
const DENTIST = id('0');
const IDEA = id('1');
const RUN = id('7');
const READ = id('8');
const SMOKE = id('9');

const todo = (tid, o = {}) => ({
  id: tid,
  title: o.title ?? 'A todo',
  minutes: o.minutes ?? null,
  created: o.created ?? '2026-09-20',
  moved: o.moved ?? 0,
  due_day: o.due_day ?? null,
  deadline: o.deadline ?? null,
  back_on: o.back_on ?? null,
});
const habit = (hid, o = {}) => ({
  id: hid,
  title: o.title ?? 'A habit',
  cadence: o.cadence ?? 'weekly',
  target: o.cadence === 'daily' ? null : (o.target ?? 3),
  days_active: [],
  breaking: !!o.breaking,
  minutes: o.minutes ?? null,
  start_date: null,
  end_date: null,
  last_week: 1,
  before: 2,
  planned: o.planned ?? [],
});

function gathered(over = {}) {
  return {
    tz: 'Europe/London',
    today: TODAY,
    now: 15 * 60,
    first: MON,
    last: SUN,
    week_start: MON,
    days_off: [0, 6],
    person: { first_name: 'Robin' },
    worlds: [],
    chapters: [],
    todos: [
      todo(REPORT, { title: 'Write the report', minutes: 120, deadline: '2026-10-20', moved: 11 }),
      todo(VENUE, { title: 'Book the venue', minutes: 20, due_day: TUE }),
      todo(PLUMBER, { title: 'Call the plumber' }),
      todo(TAXES, { title: 'Do the taxes', minutes: 60, due_day: '2026-10-01' }),
      todo(GIFT, { title: 'Find a present', minutes: 45, back_on: '2026-10-15' }),
      todo(PASSPORT, { title: 'Renew the passport', minutes: 30, deadline: WED }),
      todo(DENTIST, { title: 'Dentist forms', due_day: '2026-10-14' }),
      todo(IDEA, { title: 'Look at standing desks', minutes: 20 }),
    ],
    done: [],
    habits: [
      habit(RUN, { title: 'Run', target: 3, minutes: 40 }),
      habit(READ, { title: 'Read', cadence: 'daily' }),
      habit(SMOKE, { title: 'No cigarettes', breaking: true }),
    ],
    dated: [],
    calendar: { connected: false, days: [] },
    last_review: null,
    ...over,
  };
}

function review(over = {}) {
  return {
    id: 'row-1',
    read: {
      free_hours_guess: { normal_day: 1.5, busy_day: 0.5, weekend_day: 3 },
      busy_days: [FRI],
      habit_days: [{ habit_id: RUN, days: [MON, WED, SAT], reason: 'Spread out.' }],
    },
    answers: {
      hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
      busy_days: [THU],
      priorities: [{ text: 'Get the report started', item_ids: [REPORT] }],
      intention: 'One thing at a time',
      said: [{ step: 'shape', text: 'My sister is staying on Saturday' }],
      ...over.answers,
    },
    ...(over.read ? { read: over.read } : {}),
  };
}

/** The frame, the input and a way to name a todo as the model is given it. */
function made(g = gathered(), row = review(), board) {
  const frame = spreadFrame(g, row, board);
  const r = renderSpread(g, frame);
  const refOf = new Map([...r.refs.todos].map(([ref, tid]) => [tid, ref]));
  return { g, frame, r, ref: (tid) => refOf.get(tid) };
}

describe('what the spread is made from', () => {
  it('sorts every open todo by where it already is', () => {
    const { frame } = made();
    expect([...frame.fixed]).toEqual([[VENUE, TUE]]);
    expect([...frame.later]).toEqual([[GIFT, '2026-10-15']]);
    // the dentist forms have a day of their own in another week: not on the board at all
    expect(frame.free.map((t) => t.id)).toEqual([REPORT, PLUMBER, TAXES, PASSPORT, IDEA]);
  });

  it('takes a todo already put off back into the spread when it is one of the things that matter most', () => {
    const { frame } = made(
      gathered(),
      review({ answers: { priorities: [{ text: 'The present', item_ids: [GIFT] }] } }),
    );
    expect(frame.later.size).toBe(0);
    expect(frame.free.map((t) => t.id)).toContain(GIFT);
  });

  it('uses the hours and busy days they set, over the ones Gremly guessed', () => {
    const { frame } = made();
    expect(frame.hours).toEqual({ normal_day: 2, busy_day: 1, weekend_day: 4 });
    expect(frame.busy).toEqual([THU]);
    const guessed = made(
      gathered(),
      review({ answers: { hours: undefined, busy_days: undefined } }),
    );
    expect(guessed.frame.hours).toEqual({ normal_day: 1.5, busy_day: 0.5, weekend_day: 3 });
    expect(guessed.frame.busy).toEqual([FRI]);
  });

  it('puts each habit on the days chosen for it, and leaves out one they are breaking', () => {
    const { frame } = made();
    expect(frame.habits).toEqual([
      { id: RUN, title: 'Run', minutes: 40, days: [MON, WED, SAT], allow: 3 },
      // nothing chosen for it yet: it is on no day
      { id: READ, title: 'Read', minutes: 30, days: [], allow: 7 },
    ]);
  });

  it('takes the days saved for a habit over Gremly’s, and their own on the board over both', () => {
    const saved = gathered();
    saved.habits[0].planned = [TUE, FRI];
    expect(made(saved).frame.habits[0].days).toEqual([TUE, FRI]);
    const mine = made(saved, review(), {
      habit_days: [{ id: RUN, days: [SUN, MON, '2026-10-20'] }],
    });
    expect(mine.frame.habits[0].days).toEqual([MON, SUN]);
    // they took it off the week themselves: Gremly's days do not come back
    const off = made(gathered(), review(), { habit_days: [{ id: RUN, days: [] }] });
    expect(off.frame.habits[0].days).toEqual([]);
  });

  it('never puts a habit on more days than they aim for from Gremly’s suggestion', () => {
    const row = review({
      read: { habit_days: [{ habit_id: RUN, days: [MON, TUE, WED, THU, FRI] }] },
    });
    expect(made(gathered(), row).frame.habits[0].days).toEqual([MON, TUE, WED]);
  });

  it('puts a habit Gremly suggested only on a day with room for it beside what is theirs', () => {
    const g = gathered();
    // Monday already holds most of its two hours
    g.todos.push(todo(id('3'), { title: 'Clear the garage', minutes: 100, due_day: MON }));
    const { frame } = made(g);
    // the run is forty minutes and Monday has twenty left: it is not put there
    expect(frame.habits[0].days).toEqual([WED, SAT]);
    expect(frame.room.find((x) => x.day === MON)).toMatchObject({
      habits: 0,
      fixed: 100,
      left: 20,
      over: 0,
    });
    // a day that is theirs stands, room or not
    const saved = gathered();
    saved.todos.push(todo(id('3'), { title: 'Clear the garage', minutes: 100, due_day: MON }));
    saved.habits[0].planned = [MON];
    expect(made(saved).frame.room.find((x) => x.day === MON)).toMatchObject({
      habits: 40,
      left: 0,
      over: 20,
    });
  });

  it('works out the room each day has left', () => {
    const { frame } = made();
    expect(frame.room).toEqual([
      { day: MON, kind: 'normal_day', minutes: 120, habits: 40, fixed: 0, left: 80, over: 0 },
      { day: TUE, kind: 'normal_day', minutes: 120, habits: 0, fixed: 20, left: 100, over: 0 },
      { day: WED, kind: 'normal_day', minutes: 120, habits: 40, fixed: 0, left: 80, over: 0 },
      { day: THU, kind: 'busy_day', minutes: 60, habits: 0, fixed: 0, left: 60, over: 0 },
      { day: FRI, kind: 'normal_day', minutes: 120, habits: 0, fixed: 0, left: 120, over: 0 },
      { day: SAT, kind: 'weekend_day', minutes: 240, habits: 40, fixed: 0, left: 200, over: 0 },
      { day: SUN, kind: 'weekend_day', minutes: 240, habits: 0, fixed: 0, left: 240, over: 0 },
    ]);
    expect(frame.returns[0]).toBe('2026-10-12');
    expect(frame.returns).toHaveLength(21);
  });

  it('keeps what they placed themselves on the board, which is not saved yet', () => {
    const { frame } = made(gathered(), review(), {
      placed: [
        { id: PLUMBER, day: FRI },
        { id: VENUE, day: MON },
        { id: IDEA, day: '2026-10-20' },
        { id: 'not an id', day: MON },
      ],
      later: [{ id: TAXES, back_on: '2026-10-19' }],
    });
    // the plumber is on Friday, the venue moved from its saved Tuesday to Monday
    expect(Object.fromEntries(frame.fixed)).toEqual({ [PLUMBER]: FRI, [VENUE]: MON });
    expect(frame.later.get(TAXES)).toBe('2026-10-19');
    // a day that is not being planned is no place on the board
    expect(frame.free.map((t) => t.id)).toEqual([REPORT, PASSPORT, IDEA]);
    expect(frame.room.find((x) => x.day === FRI).left).toBe(90);
    expect(frame.room.find((x) => x.day === TUE).left).toBe(120);
  });

  it('plans only from today in a review begun part way through the week', () => {
    const g = gathered({ today: WED, first: WED });
    const { frame } = made(g);
    expect(frame.days).toEqual([WED, THU, FRI, SAT, SUN]);
    // Tuesday has gone by, so the venue is theirs to place again
    expect(frame.free.map((t) => t.id)).toContain(VENUE);
  });
});

describe('reading the board the app sent', () => {
  it('keeps ids with real days, and nothing else', () => {
    const b = readBoard({
      placed: [{ id: PLUMBER, day: FRI }, { id: PLUMBER }, 'x', { id: 'abc', day: FRI }],
      later: [
        { id: TAXES, back_on: '2026-10-19' },
        { id: PLUMBER, back_on: '2026-10-19' },
      ],
      habit_days: [{ id: RUN, days: [SUN, MON, MON, 'Friday'] }],
    });
    expect([...b.placed]).toEqual([[PLUMBER, FRI]]);
    // a todo on a day is not also put off
    expect([...b.later]).toEqual([[TAXES, '2026-10-19']]);
    expect(b.habit_days.get(RUN)).toEqual([MON, SUN]);
    expect(readBoard(null).placed.size).toBe(0);
    expect(readBoard('board').later.size).toBe(0);
  });
});

describe('what the model is given', () => {
  it('is the read’s input, then their answers, each day’s room and what to spread', () => {
    const { r, ref } = made();
    const text = r.text;
    expect(text).toContain('OPEN TODOS (id | title | length | added | moved | dates):');
    expect(text).toContain('THEIR ANSWERS IN THE REVIEW:');
    expect(text).toContain(`1. "Get the report started" (todos ${ref(REPORT)})`);
    expect(text).toContain('Their intention for the week: "One thing at a time"');
    expect(text).toContain(
      'Free hours for their own things: 2 on a normal day, 1 on a busy day, 4 on a day off.',
    );
    expect(text).toContain(`Their busy days: Thursday ${THU}.`);
    expect(text).toContain('"My sister is staying on Saturday"');
    expect(text).toContain(`| Run | 40 minutes | ${MON}, ${WED}, ${SAT}`);
    expect(text).toContain(
      `Monday ${MON}, a normal day: 120 free, 40 taken by habits, 0 by todos already on it, so 80 minutes of room.`,
    );
    expect(text).toContain(`${TUE}: ${ref(VENUE)}`);
    expect(text).toContain(`${ref(GIFT)} back 2026-10-15`);
    // the todos to spread, in the order the list above has them
    const inOrder = [REPORT, PLUMBER, TAXES, PASSPORT, IDEA].sort(
      (a, b) => Number(ref(a).slice(1)) - Number(ref(b).slice(1)),
    );
    expect(inOrder[0]).toBe(TAXES);
    expect(text).toContain(
      `${inOrder.map(ref).join(', ')}\nA todo that goes to later can come back on any day from 2026-10-12 to 2026-11-01.`,
    );
    expect(r.listed).toEqual(inOrder);
    // no real id reaches the model
    expect(text).not.toContain(REPORT);
  });

  it('says so plainly when they answered nothing', () => {
    const { r } = made(
      gathered({ habits: [] }),
      review({ answers: { priorities: [], intention: null, busy_days: [], said: [] } }),
    );
    expect(r.text).toContain('They picked nothing as mattering most this week.');
    expect(r.text).toContain('They set no intention.');
    expect(r.text).toContain('They marked no day as busy.');
    expect(r.text).toContain('(none planned)');
    expect(r.text).not.toContain('What they said to Gremly along the way');
  });

  it('is asked with semantic rules only, and a schema that asks for every field', () => {
    const system = spreadSystem({ first_name: 'Robin' });
    expect(system.varying).toBe('Their first name is Robin.');
    expect(system.fixed).toContain('Count a todo with no length as thirty minutes.');
    expect(system.fixed).toContain('never name a condition');
    expect(system.fixed).not.toMatch(/ — | – | - /);
    expect(SPREAD_SCHEMA.required).toEqual(['days', 'later']);
    expect(SPREAD_SCHEMA.properties.days.items.required).toEqual(['day', 'todo_ids', 'note']);
  });
});

describe('the check on what comes back', () => {
  it('keeps a spread that holds, in the model’s order', () => {
    const { g, frame, r, ref } = made();
    const out = checkSpread(
      {
        days: [
          { day: MON, todo_ids: [ref(PLUMBER)], note: 'A gentle start.' },
          { day: TUE, todo_ids: [ref(TAXES)], note: '' },
          { day: WED, todo_ids: [ref(PASSPORT)], note: '' },
          { day: FRI, todo_ids: [ref(REPORT)], note: 'Your clear day — the report goes here.' },
        ],
        later: [{ todo_id: ref(IDEA), back_on: '2026-10-13' }],
      },
      g,
      frame,
      r,
    );
    expect(out.place).toEqual([
      { id: PLUMBER, day: MON },
      { id: TAXES, day: TUE },
      { id: PASSPORT, day: WED },
      { id: REPORT, day: FRI },
    ]);
    expect(out.later).toEqual([{ id: IDEA, back_on: '2026-10-13' }]);
    // Gremly's words lose their dashes
    expect(out.notes).toEqual([
      { day: MON, note: 'A gentle start.' },
      { day: FRI, note: 'Your clear day, the report goes here.' },
    ]);
    expect(out.dropped).toEqual([]);
    expect(out.counts).toMatchObject({
      to_spread: 5,
      placed: 4,
      later: 1,
      dropped: 0,
      late: 0,
      spilled: 0,
      left_out: 0,
      redated: 0,
    });
  });

  it('drops what was never the model’s to place, and says what', () => {
    const { g, frame, r, ref } = made();
    const out = checkSpread(
      {
        days: [
          { day: MON, todo_ids: ['t99', ref(VENUE), ref(DENTIST), ref(PLUMBER)], note: '' },
          { day: TUE, todo_ids: [ref(PLUMBER)], note: '' },
          { day: '2026-10-12', todo_ids: [ref(IDEA)], note: 'Next week.' },
        ],
        later: [
          { todo_id: ref(GIFT), back_on: '2026-10-13' },
          { todo_id: 't77', back_on: '2026-10-13' },
          { todo_id: ref(PLUMBER), back_on: '2026-10-13' },
        ],
      },
      g,
      frame,
      r,
    );
    expect(out.dropped).toEqual([
      { what: 'todo', why: 'unknown_id' },
      // already on Tuesday, and on a day of its own in another week
      { what: 'todo', why: 'not_to_spread' },
      { what: 'todo', why: 'not_to_spread' },
      { what: 'todo', why: 'twice' },
      { what: 'day', why: 'not_being_planned' },
      // already put off, with its own day
      { what: 'later', why: 'not_to_spread' },
      { what: 'later', why: 'unknown_id' },
    ]);
    // on a day and put off: the day stands
    expect(out.place).toContainEqual({ id: PLUMBER, day: MON });
    expect(out.later.some((l) => l.id === PLUMBER)).toBe(false);
    expect(out.notes).toEqual([]);
  });

  it('holds a todo to its hard date, whether it was placed after it, put off or left out', () => {
    const { g, frame, r, ref } = made();
    for (const output of [
      { days: [{ day: FRI, todo_ids: [ref(PASSPORT)], note: '' }], later: [] },
      { days: [], later: [{ todo_id: ref(PASSPORT), back_on: '2026-10-13' }] },
      { days: [], later: [] },
    ]) {
      const out = checkSpread(output, g, frame, r);
      expect(out.place).toContainEqual({ id: PASSPORT, day: WED });
      expect(out.later.some((l) => l.id === PASSPORT)).toBe(false);
      expect(out.counts.late).toBe(1);
    }
    // on its date or before it is left where the model put it
    const early = checkSpread(
      { days: [{ day: MON, todo_ids: [ref(PASSPORT)], note: '' }], later: [] },
      g,
      frame,
      r,
    );
    expect(early.place).toContainEqual({ id: PASSPORT, day: MON });
    expect(early.counts.late).toBe(0);
  });

  it('puts a todo held to a hard date on the latest day up to it with room, and on the date when none has', () => {
    const g = gathered();
    // Wednesday is taken by something of their own
    g.todos.push(todo(id('3'), { title: 'Clear the garage', minutes: 80, due_day: WED }));
    const { frame, r } = made(g);
    expect(frame.room.find((x) => x.day === WED).left).toBe(0);
    const out = checkSpread({ days: [], later: [] }, g, frame, r);
    // the passport, due Wednesday and left out: Tuesday has room for it
    expect(out.place).toContainEqual({ id: PASSPORT, day: TUE });
    expect(out.counts.late).toBe(1);

    // no day up to Wednesday has room: on its date all the same
    const full = gathered();
    full.todos.push(
      todo(id('3'), { title: 'Clear the garage', minutes: 60, due_day: MON }),
      todo(id('4'), { title: 'Sort the shed', minutes: 40, due_day: TUE }),
      todo(id('5'), { title: 'Fix the fence', minutes: 60, due_day: WED }),
    );
    const tight = made(full, review({ answers: { hours: { normal_day: 1 } } }));
    const held = checkSpread({ days: [], later: [] }, full, tight.frame, tight.r);
    expect(held.place).toContainEqual({ id: PASSPORT, day: WED });
    expect(held.later.some((l) => l.id === PASSPORT)).toBe(false);
  });

  it('never sends a todo held to a hard date past it when a day gives it up', () => {
    const SLIDES = id('2');
    const base = () => {
      const g = gathered();
      g.todos.push(todo(SLIDES, { title: 'Finish the slides', minutes: 90, deadline: FRI }));
      return g;
    };
    // due Friday, and put on Thursday, a busy day with an hour: Friday has room
    const one = made(base());
    const asked = (m) => ({
      days: [{ day: THU, todo_ids: [m.ref(SLIDES)], note: '' }],
      later: [],
    });
    const next = checkSpread(asked(one), one.g, one.frame, one.r);
    expect(next.place).toContainEqual({ id: SLIDES, day: FRI });

    // Friday is full: the nearest day before with room, never Saturday
    const g2 = base();
    g2.todos.push(todo(id('3'), { title: 'Clear the garage', minutes: 120, due_day: FRI }));
    const two = made(g2);
    const before = checkSpread(asked(two), g2, two.frame, two.r);
    expect(before.place).toContainEqual({ id: SLIDES, day: TUE });
    expect(before.counts).toMatchObject({ spilled: 1, spilled_to_later: 0, held_over: 0 });

    // No day up to Friday has room: it stays where the model put it, over the
    // room, and what is not held to a date is what leaves the day.
    const three = made(
      base(),
      review({ answers: { hours: { normal_day: 0.5, busy_day: 0.5, weekend_day: 0.5 } } }),
    );
    const stuck = checkSpread(
      {
        days: [{ day: THU, todo_ids: [three.ref(IDEA), three.ref(SLIDES)], note: '' }],
        later: [],
      },
      three.g,
      three.frame,
      three.r,
    );
    expect(stuck.place).toContainEqual({ id: SLIDES, day: THU });
    expect(stuck.place).toContainEqual({ id: IDEA, day: FRI });
    expect(stuck.later.some((l) => l.id === SLIDES)).toBe(false);
    expect(stuck.counts).toMatchObject({ spilled: 2, held_over: 1 });
  });

  it('holds a todo to nothing when its hard date has already gone by', () => {
    const FORM = id('2');
    const g = gathered();
    g.todos.push(todo(FORM, { title: 'Send the form', minutes: 50, deadline: '2026-09-30' }));
    const { frame, r, ref } = made(g);
    // Thursday has an hour: the form, placed last, is what it gives up
    const out = checkSpread(
      { days: [{ day: THU, todo_ids: [ref(TAXES), ref(FORM)], note: '' }], later: [] },
      g,
      frame,
      r,
    );
    expect(out.place).toContainEqual({ id: TAXES, day: THU });
    expect(out.place).toContainEqual({ id: FORM, day: FRI });
    // and left out, it waits in Later like the rest
    const none = checkSpread({ days: [], later: [] }, g, frame, r);
    expect(none.later.some((l) => l.id === FORM)).toBe(true);
    expect(none.counts.late).toBe(1);
  });

  it('gives the days to come back to the oldest first', () => {
    const g = gathered({
      todos: [
        todo(id('3'), { created: '2026-09-01' }),
        todo(id('4'), { created: '2026-03-01' }),
        todo(id('5'), { created: '2026-06-01' }),
      ],
    });
    const { frame, r } = made(g);
    const out = checkSpread({ days: [], later: [] }, g, frame, r);
    expect(out.later).toEqual([
      { id: id('4'), back_on: '2026-10-12' },
      { id: id('5'), back_on: '2026-10-13' },
      { id: id('3'), back_on: '2026-10-14' },
    ]);
  });

  it('empties a day that is over its room into the next days with room, what matters most last', () => {
    const { g, frame, r, ref } = made();
    // Thursday is busy: an hour, and the model put three and a half on it
    const out = checkSpread(
      {
        days: [
          { day: MON, todo_ids: [], note: 'Nothing today.' },
          { day: THU, todo_ids: [ref(REPORT), ref(TAXES), ref(PLUMBER)], note: 'The big one.' },
          { day: FRI, todo_ids: [ref(IDEA)], note: 'Only a quick look.' },
        ],
        later: [],
      },
      g,
      frame,
      r,
    );
    // the plumber and the taxes fit on Friday beside what was there; the report needs Saturday
    expect(out.place).toEqual([
      { id: PASSPORT, day: WED },
      { id: IDEA, day: FRI },
      { id: PLUMBER, day: FRI },
      { id: TAXES, day: FRI },
      { id: REPORT, day: SAT },
    ]);
    expect(out.counts).toMatchObject({ spilled: 3, spilled_to_later: 0 });
    // what Gremly wrote about a day holds only for the day as the model left it
    expect(out.notes).toEqual([{ day: MON, note: 'Nothing today.' }]);
  });

  it('puts off what a full week has no room for, and never moves what cannot go later', () => {
    const g = gathered();
    // an afternoon's work due on Wednesday, and no room anywhere
    g.todos.push(todo(id('2'), { title: 'Finish the slides', minutes: 200, deadline: WED }));
    const row = review({
      answers: { hours: { normal_day: 0.5, busy_day: 0.5, weekend_day: 0.5 } },
    });
    const { frame, r, ref } = made(g, row);
    const out = checkSpread(
      {
        days: [{ day: WED, todo_ids: [ref(id('2')), ref(TAXES)], note: '' }],
        later: [],
      },
      g,
      frame,
      r,
    );
    // the slides stay on their date though the day is over; no later day has an hour for the taxes
    expect(out.place).toContainEqual({ id: id('2'), day: WED });
    expect(out.place.some((p) => p.id === TAXES)).toBe(false);
    expect(out.later.some((l) => l.id === TAXES)).toBe(true);
    expect(out.counts.spilled_to_later).toBe(1);
  });

  it('gives everything on no day a day to come back on, spread out', () => {
    const { g, frame, r, ref } = made();
    const out = checkSpread(
      {
        days: [],
        // a day inside the week being planned is no day to come back on
        later: [{ todo_id: ref(IDEA), back_on: TUE }],
      },
      g,
      frame,
      r,
    );
    expect(out.place).toEqual([{ id: PASSPORT, day: WED }]);
    const back = Object.fromEntries(out.later.map((l) => [l.id, l.back_on]));
    // the report comes back by its hard date; the rest take the emptiest days in turn
    expect(back).toEqual({
      [IDEA]: '2026-10-12',
      [REPORT]: '2026-10-20',
      [PLUMBER]: '2026-10-13',
      [TAXES]: '2026-10-14',
    });
    expect(out.counts).toMatchObject({ left_out: 3, redated: 1, later: 4 });
  });

  it('leaves a todo that is already put off on the day it has', () => {
    const row = review({ answers: { priorities: [{ text: 'The present', item_ids: [GIFT] }] } });
    const { g, frame, r, ref } = made(gathered(), row);
    const out = checkSpread(
      { days: [], later: [{ todo_id: ref(GIFT), back_on: '2026-10-22' }] },
      g,
      frame,
      r,
    );
    expect(out.later.some((l) => l.id === GIFT)).toBe(false);
    expect(out.counts.kept_later).toBe(1);
    // and it can still be brought into the week
    const placed = checkSpread(
      { days: [{ day: SUN, todo_ids: [ref(GIFT)], note: '' }], later: [] },
      g,
      frame,
      r,
    );
    expect(placed.place).toContainEqual({ id: GIFT, day: SUN });
  });

  it('stands up to a reply that is no spread at all', () => {
    const { g, frame, r } = made();
    for (const bad of [null, 'sorry', { days: 'none', later: 7 }, { days: [null, { day: 5 }] }]) {
      const out = checkSpread(bad, g, frame, r);
      expect(out.place).toEqual([{ id: PASSPORT, day: WED }]);
      expect(out.later).toHaveLength(4);
    }
  });
});

describe('the days they gave their todos themselves', () => {
  // the venue is on Tuesday by their own hand; so is a second todo, on Wednesday
  const WALK = id('2');
  const withTwo = () =>
    gathered({
      todos: [
        ...gathered().todos,
        todo(WALK, { title: 'Walk the route', minutes: 20, due_day: WED }),
      ],
    });
  const answered = (answers) => review({ answers });

  it('stay where they are, and the spread plans around them', () => {
    const { frame, r } = made(withTwo());
    expect([...frame.fixed]).toEqual([
      [VENUE, TUE],
      [WALK, WED],
    ]);
    expect([...frame.home]).toEqual([]);
    expect(frame.room.find((x) => x.day === WED)).toMatchObject({ fixed: 20 });
    // the model is told whose days they are
    expect(r.text).toContain(`day ${TUE}, which they chose`);
    expect(r.text).not.toContain('no longer fixed');
  });

  it('are given to the spread when they say rearrange it all, each still on its day until placed', () => {
    const { frame, r, ref } = made(withTwo(), answered({ keep: 'none' }));
    expect([...frame.fixed]).toEqual([]);
    expect([...frame.home]).toEqual([
      [VENUE, TUE],
      [WALK, WED],
    ]);
    expect(frame.free.map((t) => t.id)).toEqual(expect.arrayContaining([VENUE, WALK]));
    // their minutes are room again
    expect(frame.room.find((x) => x.day === WED)).toMatchObject({ fixed: 0 });
    // the model is told these days no longer hold, and is no longer told they chose them
    expect(r.text).toContain(
      `Of these, ${ref(VENUE)}, ${ref(WALK)} are on a day now. Those days are no longer fixed: place each afresh, where it fits best this time.`,
    );
    expect(r.text).not.toContain('which they chose');
  });

  it('are given one at a time when they keep some: only the ones they freed', () => {
    const { frame, r, ref } = made(withTwo(), answered({ keep: 'some', freed: [WALK] }));
    expect([...frame.fixed]).toEqual([[VENUE, TUE]]);
    expect([...frame.home]).toEqual([[WALK, WED]]);
    expect(r.text).toContain(
      `Of these, ${ref(WALK)} is on a day now. That day is no longer fixed: place each afresh, where it fits best this time.`,
    );
    expect(r.text).toContain(`day ${TUE}, which they chose`);
    expect(r.text).not.toContain(`day ${WED}, which they chose`);
  });

  it('never include a todo with a time of day, whatever they said', () => {
    const g = withTwo();
    g.todos = g.todos.map((t) => (t.id === WALK ? { ...t, timed: true } : t));
    const { frame } = made(g, answered({ keep: 'none' }));
    expect([...frame.fixed]).toEqual([[WALK, WED]]);
    expect([...frame.home]).toEqual([[VENUE, TUE]]);
  });

  it('are told apart from where Gremly’s own last spread of this week put a todo, which is his to place again', () => {
    const { frame } = made(
      withTwo(),
      answered({ keep: 'all', planned: { gremly: { [WALK]: WED, [VENUE]: MON } } }),
    );
    // the walk is where Gremly put it; the venue has moved since, so it is theirs
    expect([...frame.fixed]).toEqual([[VENUE, TUE]]);
    expect([...frame.home]).toEqual([[WALK, WED]]);
  });

  it('are made part of what the spread was made from', () => {
    const base = made(withTwo()).frame.basis;
    expect(made(withTwo(), answered({ keep: 'none' })).frame.basis).not.toBe(base);
    expect(made(withTwo(), answered({ keep: 'some', freed: [WALK] })).frame.basis).not.toBe(base);
    expect(made(withTwo(), answered({ keep: 'all' })).frame.basis).toBe(base);
  });

  it('put a freed todo the model leaves out into Later, with a day to come back, like any other', () => {
    const { g, frame, r, ref } = made(withTwo(), answered({ keep: 'none' }));
    const out = checkSpread(
      {
        days: [
          { day: WED, todo_ids: [ref(PASSPORT)], note: 'A full day.' },
          { day: FRI, todo_ids: [ref(VENUE)], note: '' },
        ],
        later: [],
      },
      g,
      frame,
      r,
    );
    // the venue goes where the model put it; nothing puts the walk back on its Wednesday
    expect(out.place).toEqual([
      { id: PASSPORT, day: WED },
      { id: VENUE, day: FRI },
    ]);
    expect(out.later.map((l) => l.id)).toContain(WALK);
    // so what the model wrote about Wednesday still holds
    expect(out.notes).toEqual([{ day: WED, note: 'A full day.' }]);
  });

  it('give their minutes back to the day as room, and write a freed todo that was also put off', () => {
    const g = withTwo();
    // the walk is on Wednesday and also has a day to come back, kept from before it was given its day
    g.todos = g.todos.map((t) => (t.id === WALK ? { ...t, back_on: '2026-10-16' } : t));
    const { frame, r, ref } = made(g, answered({ keep: 'none' }));
    // two hours, less the run: the walk's twenty minutes are room again
    expect(frame.room.find((x) => x.day === WED).left).toBe(80);
    const out = checkSpread(
      {
        days: [{ day: WED, todo_ids: [ref(IDEA), ref(PASSPORT), ref(PLUMBER)], note: '' }],
        later: [{ todo_id: ref(VENUE), back_on: '2026-10-13' }],
      },
      g,
      frame,
      r,
    );
    expect(out.place.filter((p) => p.day === WED).map((p) => p.id)).toEqual([
      IDEA,
      PASSPORT,
      PLUMBER,
    ]);
    expect(out.later).toEqual(
      expect.arrayContaining([
        { id: VENUE, back_on: '2026-10-13' },
        // left out: written, to take it off its day, for the day it was already coming back
        { id: WALK, back_on: '2026-10-16' },
      ]),
    );
  });

  it('are not released when the model would not be given them: only what it is given can be placed', () => {
    const many = (n, tag, o) =>
      Array.from({ length: n }, (_, i) =>
        todo(`${String(i).padStart(8, '0')}-${tag}-4111-8111-111111111111`, o),
      );
    // more open todos than the read lists, seventy of them on Wednesday by their own hand
    const g = gathered({
      todos: [
        ...many(70, 'aaaa', { due_day: WED, created: '2026-06-01' }),
        ...many(40, 'bbbb', { created: '2026-01-01' }),
        ...many(60, 'cccc', { created: '2026-10-03' }),
      ],
    });
    const { frame, r } = made(g, answered({ keep: 'none' }));
    expect(frame.home.size).toBeGreaterThan(0);
    expect(frame.fixed.size).toBeGreaterThan(0);
    expect(frame.home.size + frame.fixed.size).toBe(70);
    expect([...frame.home.keys()].every((tid) => r.listed.includes(tid))).toBe(true);
    // the ones it is not given stay on their day, and still count against its room
    expect(frame.room.find((x) => x.day === WED).fixed).toBe(frame.fixed.size * 30);
    const out = checkSpread({ days: [], later: [] }, g, frame, r);
    expect(out.later.some((l) => frame.fixed.has(l.id))).toBe(false);
    expect(out.place.some((p) => frame.fixed.has(p.id))).toBe(false);
  });
});

describe('making a spread', () => {
  beforeEach(() => {
    jsonCall.mockResolvedValue({
      output: { days: [], later: [] },
      model: 'gpt-6-luna',
    });
  });

  it('asks once at low effort, and keeps what it was made from', async () => {
    const g = gathered();
    const out = await runWeekSpread({}, g, review());
    expect(jsonCall).toHaveBeenCalledTimes(1);
    const asked = jsonCall.mock.calls[0][1];
    expect(asked.effort).toBe('low');
    expect(asked.schema).toBe(SPREAD_SCHEMA);
    expect(asked.user).toContain('TODOS TO SPREAD');
    const stored = storedSpread(g, out, new Date('2026-10-04T15:00:00Z'));
    expect(stored).toMatchObject({
      version: WEEK_SPREAD_VERSION,
      made_at: '2026-10-04T15:00:00.000Z',
      made_on: TODAY,
      model: 'gpt-6-luna',
      effort: 'low',
      first: MON,
      last: SUN,
      habit_days: [
        { id: RUN, days: [MON, WED, SAT] },
        { id: READ, days: [] },
      ],
      place: [{ id: PASSPORT, day: WED }],
    });
    expect(stored.basis).toBe(out.frame.basis);
    expect(stored.later).toHaveLength(4);
    // the input is not kept on the row
    expect(stored).not.toHaveProperty('input');
  });

  it('calls no model when there is nothing to choose between', async () => {
    const g = gathered({ todos: [todo(VENUE, { due_day: TUE })] });
    const out = await runWeekSpread({}, g, review());
    expect(jsonCall).not.toHaveBeenCalled();
    expect(out.place).toEqual([]);
    expect(out.later).toEqual([]);
    expect(out.model).toBeNull();
  });
});
