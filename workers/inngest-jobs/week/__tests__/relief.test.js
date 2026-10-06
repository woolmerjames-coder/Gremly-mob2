/**
 * @jest-environment node
 */
// Relief for their over-full days (workers/inngest-jobs/week/relief.js): which
// days are over, what the model is given, and the check on what it suggests.
// The person here is made up.

import {
  RELIEF_SCHEMA,
  WEEK_RELIEF_VERSION,
  checkRelief,
  overfullDays,
  reliefSystem,
  renderRelief,
  runWeekRelief,
  storedRelief,
} from '../relief';
import { spreadFrame } from '../spread';
import { jsonCall } from '../../context/llm';
import { reliefBasis } from '../../../shared/weekBoard.js';

jest.mock('../../context/llm', () => ({
  ...jest.requireActual('../../context/llm'),
  jsonCall: jest.fn(),
}));

// Sunday 4 October 2026: the review plans Monday 5 to Sunday 11
const TODAY = '2026-10-04';
const [MON, , WED, THU, FRI, SAT, SUN] = [
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
];
const id = (n) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const PREP = id('a');
const SHOP = id('b');
const FORMS = id('c');
const DENTIST = id('d');
const CALL = id('e');
const IDEA = id('f');
const TAX = id('0');
const RUN = id('7');

const todo = (tid, o = {}) => ({
  id: tid,
  title: o.title ?? 'A todo',
  minutes: o.minutes ?? null,
  created: '2026-09-20',
  moved: 0,
  due_day: o.due_day ?? null,
  deadline: o.deadline ?? null,
  back_on: o.back_on ?? null,
  timed: !!o.timed,
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
      // Wednesday, by their own hand: two hours of room, forty minutes of it the run
      todo(PREP, { title: 'Prepare for the review', minutes: 60, due_day: WED }),
      todo(SHOP, { title: 'Order the paint', minutes: 45, due_day: WED }),
      todo(FORMS, { title: 'Fill in the forms', minutes: 30, due_day: WED, deadline: THU }),
      todo(DENTIST, { title: 'The dentist', minutes: 30, due_day: WED, timed: true }),
      // Thursday, a busy day with an hour: one thing on it already
      todo(CALL, { title: 'Call the school', minutes: 20, due_day: THU }),
      // no day, and a day gone by
      todo(IDEA, { title: 'Look at standing desks', minutes: 20 }),
      todo(TAX, {
        title: 'Do the taxes',
        minutes: 60,
        due_day: '2026-10-01',
        deadline: '2026-10-20',
      }),
    ],
    done: [],
    habits: [
      {
        id: RUN,
        title: 'Run',
        cadence: 'weekly',
        target: 3,
        days_active: [],
        breaking: false,
        minutes: 40,
        start_date: null,
        end_date: null,
        last_week: 1,
        before: 2,
        // their own days for it, saved already
        planned: [MON, WED, SAT],
      },
    ],
    dated: [],
    calendar: { connected: false, days: [] },
    last_review: null,
    ...over,
  };
}

const review = (answers = {}) => ({
  id: 'row-1',
  read: {
    free_hours_guess: { normal_day: 2, busy_day: 1, weekend_day: 4 },
    habit_days: [{ habit_id: RUN, days: [MON, WED, SAT], reason: 'Spread out.' }],
  },
  answers: { hours: { normal_day: 2, busy_day: 1, weekend_day: 4 }, busy_days: [THU], ...answers },
});

function made(g = gathered(), row = review(), board) {
  const frame = spreadFrame(g, row, board);
  const r = renderRelief(g, frame);
  const refOf = new Map([...r.refs.todos].map(([ref, tid]) => [tid, ref]));
  return { g, frame, r, ref: (tid) => refOf.get(tid) };
}
const days = (moves, note = '') => ({ days: [{ day: WED, moves, note }] });
const move = (ref, to = '', back = '') => ({ todo_id: ref, to_day: to, back_on: back });

describe('their over-full days', () => {
  it('are the days that hold more of their own than they have room for, with what could move', () => {
    const { g, frame } = made();
    // 40 of habits and 165 of todos on a day with 120
    expect(overfullDays(g, frame)).toEqual([{ day: WED, over: 85, movable: [PREP, SHOP, FORMS] }]);
  });

  it('are none when every day is inside its room, or when they freed what filled one', () => {
    const light = gathered();
    light.todos = light.todos.filter((t) => t.id !== PREP && t.id !== SHOP);
    expect(overfullDays(light, spreadFrame(light, review()))).toEqual([]);
    const g = gathered();
    expect(overfullDays(g, spreadFrame(g, review({ keep: 'none' })))).toEqual([]);
  });

  it('are only days that hold todos of theirs: habits alone leave nothing to move', () => {
    const g = gathered();
    // nothing of theirs on Monday, and its run is longer than a short day gives
    const frame = spreadFrame(
      g,
      review({ hours: { normal_day: 0.5, busy_day: 1, weekend_day: 4 } }),
    );
    expect(frame.room.find((x) => x.day === MON)).toMatchObject({ fixed: 0, habits: 40, over: 10 });
    expect(overfullDays(g, frame).map((d) => d.day)).toEqual([WED]);
  });

  it('count a todo they placed on the board, which is not saved yet', () => {
    const g = gathered();
    const frame = spreadFrame(g, review(), {
      placed: [
        { id: IDEA, day: THU },
        { id: TAX, day: THU },
      ],
    });
    // the call, the desks and the taxes on a day with an hour
    expect(overfullDays(g, frame).map((d) => [d.day, d.over])).toEqual([
      [WED, 85],
      [THU, 40],
    ]);
  });
});

describe('what the model is given', () => {
  it('is the week as it stands, then each over-full day with what could move', () => {
    const { r, ref } = made();
    expect(r.text).toContain('THEIR ANSWERS IN THE REVIEW:');
    expect(r.text).toContain(
      'Wednesday 2026-10-07, a normal day: 120 free, 40 taken by habits, 165 by todos already on it, so it is over by 85 minutes.',
    );
    expect(r.text).toContain(`day ${WED}, which they chose`);
    expect(r.text).toContain(
      `THE OVER-FULL DAYS (each with the todos of theirs on it that could move, id and minutes):\nWednesday 2026-10-07, over by 85 minutes: ${ref(PREP)} (60), ${ref(SHOP)} (45), ${ref(FORMS)} (30)`,
    );
    // the dentist has a time of day: it is on the day, and not offered
    expect(r.text).not.toContain(`${ref(DENTIST)} (30)`);
    expect(r.text).toContain(
      'A todo that goes to later can come back on any day from 2026-10-12 to 2026-11-01.',
    );
    expect(r.days).toEqual([{ day: WED, over: 85, movable: [PREP, SHOP, FORMS] }]);
  });

  it('is asked with semantic rules only, and a schema that asks for every field', () => {
    const s = reliefSystem({ first_name: 'Robin' });
    expect(s.varying).toBe('Their first name is Robin.');
    expect(s.fixed).toContain('nothing moves unless they agree');
    expect(s.fixed).toContain('Keep on a day what belongs to that day');
    expect(s.fixed).toContain('Suggest moves only for the todos listed under an over-full day');
    // no dash used as punctuation, anywhere in it
    expect(s.fixed).not.toMatch(/ [–—-] /);
    const walk = (node) => {
      if (node.type === 'object') {
        expect(node.required.sort()).toEqual(Object.keys(node.properties).sort());
        Object.values(node.properties).forEach(walk);
      }
      if (node.type === 'array') walk(node.items);
    };
    walk(RELIEF_SCHEMA);
  });
});

describe('the check on what is suggested', () => {
  it('keeps moves that hold: to a day with room, and to later with a day to come back', () => {
    const { g, frame, r, ref } = made();
    const out = checkRelief(
      days(
        [move(ref(SHOP), FRI), move(ref(PREP), '', '2026-10-13')],
        'The forms are due Thursday — they stay.',
      ),
      g,
      frame,
      r,
    );
    expect(out.days).toEqual([
      {
        day: WED,
        over: 85,
        asked: 2,
        moves: [
          { id: SHOP, to: FRI, back_on: null },
          { id: PREP, to: null, back_on: '2026-10-13' },
        ],
        // 105 minutes would leave, which is more than it is over by
        still: 0,
        note: 'The forms are due Thursday, they stay.',
      },
    ]);
    expect(out.dropped).toEqual([]);
    expect(out.counts).toMatchObject({ over_full: 1, moves: 2, to_later: 1, still_over: 0 });
  });

  it('says how far over a day would still be with every move taken', () => {
    const { g, frame, r, ref } = made();
    const out = checkRelief(days([move(ref(SHOP), FRI)]), g, frame, r);
    expect(out.days[0]).toMatchObject({ still: 40 });
    expect(out.counts).toMatchObject({ still_over: 1 });
  });

  it('drops what was never theirs to move from that day, and says what', () => {
    const { g, frame, r, ref } = made();
    const out = checkRelief(
      {
        days: [
          {
            day: WED,
            moves: [
              move('t99', FRI),
              // on another day, on no day, and with a time of day
              move(ref(CALL), FRI),
              move(ref(IDEA), FRI),
              move(ref(DENTIST), FRI),
              move(ref(SHOP), FRI),
              move(ref(SHOP), SAT),
            ],
            note: 'A line about moves that did not all hold.',
          },
          // a day that is not over
          { day: THU, moves: [move(ref(CALL), FRI)], note: '' },
        ],
      },
      g,
      frame,
      r,
    );
    expect(out.days[0].moves).toEqual([{ id: SHOP, to: FRI, back_on: null }]);
    // the line was written for the moves as the model made them
    expect(out.days[0].note).toBe('');
    expect(out.dropped.map((d) => d.why).sort()).toEqual([
      'not_over_full',
      'not_theirs_on_that_day',
      'not_theirs_on_that_day',
      'not_theirs_on_that_day',
      'twice',
      'unknown_id',
    ]);
  });

  it('drops a move to a day that cannot take it', () => {
    const g = gathered();
    // Thursday is over too, with the taxes put on it on the board
    const { frame, r, ref } = made(g, review(), { placed: [{ id: TAX, day: THU }] });
    const out = checkRelief(
      days([
        // not being planned, the day itself, and another over-full day
        move(ref(PREP), '2026-10-14'),
        move(ref(PREP), WED),
        move(ref(PREP), THU),
        // the forms are due on Thursday: Friday is past their date
        move(ref(FORMS), FRI),
      ]),
      g,
      frame,
      r,
    );
    expect(out.days.find((d) => d.day === WED).moves).toEqual([]);
    expect(out.dropped.map((d) => d.why)).toEqual([
      'not_a_day_to_move_to',
      'not_a_day_to_move_to',
      'to_an_over_full_day',
      'after_its_hard_date',
    ]);
  });

  it('counts what is already on a day, and what is already suggested for it, against its room', () => {
    const { g, frame, r, ref } = made();
    // Thursday has an hour and the call on it: forty minutes of room
    const out = checkRelief(days([move(ref(FORMS), THU), move(ref(SHOP), THU)]), g, frame, r);
    expect(out.days[0].moves).toEqual([{ id: FORMS, to: THU, back_on: null }]);
    expect(out.dropped).toEqual([{ what: 'move', why: 'no_room' }]);
  });

  it('never puts off a todo with a hard date this week, and keeps a later one before its date', () => {
    const g = gathered();
    g.todos = g.todos.map((t) => (t.id === SHOP ? { ...t, deadline: '2026-10-16' } : t));
    const { frame, r, ref } = made(g);
    const out = checkRelief(
      days([move(ref(FORMS), '', '2026-10-13'), move(ref(SHOP), '', '2026-10-20')]),
      g,
      frame,
      r,
    );
    expect(out.dropped).toEqual([{ what: 'move', why: 'has_a_hard_date_this_week' }]);
    // asked for the 20th, due by the 16th
    expect(out.days[0].moves).toEqual([{ id: SHOP, to: null, back_on: '2026-10-16' }]);
  });

  it('holds a todo to nothing when its hard date had gone by before these days', () => {
    const g = gathered();
    g.todos = g.todos.map((t) => (t.id === SHOP ? { ...t, deadline: '2026-09-30' } : t));
    const { frame, r, ref } = made(g);
    const out = checkRelief(days([move(ref(SHOP), FRI)]), g, frame, r);
    expect(out.days[0].moves).toEqual([{ id: SHOP, to: FRI, back_on: null }]);
    const later = checkRelief(days([move(ref(SHOP), '', '2026-10-13')]), g, frame, r);
    expect(later.days[0].moves).toEqual([{ id: SHOP, to: null, back_on: '2026-10-13' }]);
    expect(later.dropped).toEqual([]);
  });

  it('drops a move whose day cannot be read, unless its day to come back can', () => {
    const { g, frame, r, ref } = made();
    const out = checkRelief(
      days(
        [move(ref(SHOP), 'the weekend'), move(ref(PREP), 'later', '2026-10-13')],
        'These two can wait.',
      ),
      g,
      frame,
      r,
    );
    expect(out.dropped).toEqual([{ what: 'move', why: 'not_a_day' }]);
    expect(out.days[0].moves).toEqual([{ id: PREP, to: null, back_on: '2026-10-13' }]);
    // his line was written for both moves
    expect(out.days[0]).toMatchObject({ asked: 2, note: '' });
  });

  it('keeps how many moves were offered for a day, so a day left alone is told from one whose moves fell', () => {
    const { g, frame, r, ref } = made();
    expect(checkRelief(days([], 'It all belongs there.'), g, frame, r).days[0]).toMatchObject({
      asked: 0,
      moves: [],
      note: 'It all belongs there.',
    });
    // the dentist has a time of day: not one that could move
    expect(checkRelief(days([move(ref(DENTIST), FRI)]), g, frame, r).days[0]).toMatchObject({
      asked: 1,
      moves: [],
      note: '',
    });
  });

  it('gives a todo put off with no day asked for a day to come back on', () => {
    const { g, frame, r, ref } = made();
    const out = checkRelief(days([move(ref(SHOP)), move(ref(PREP), '', 'next week')]), g, frame, r);
    expect(out.days[0].moves.map((m) => [m.id, m.to])).toEqual([
      [SHOP, null],
      [PREP, null],
    ]);
    expect(out.days[0].moves.every((m) => frame.returns.includes(m.back_on))).toBe(true);
  });

  it('still names an over-full day the model said nothing for, with no moves', () => {
    const { g, frame, r } = made();
    for (const reply of [{ days: [] }, null, 'no']) {
      expect(checkRelief(reply, g, frame, r).days).toEqual([
        { day: WED, over: 85, asked: 0, moves: [], still: 85, note: '' },
      ]);
    }
  });
});

describe('asking for the suggestions', () => {
  it('asks once at low effort, and keeps what the suggestions were made for', async () => {
    jsonCall.mockResolvedValue({ output: { days: [] }, model: 'gpt-6-luna' });
    const g = gathered();
    const row = review();
    const frame = spreadFrame(g, row);
    const out = await runWeekRelief({}, g, frame);
    expect(jsonCall).toHaveBeenCalledTimes(1);
    const asked = jsonCall.mock.calls[0][1];
    expect(asked.effort).toBe('low');
    expect(asked.schema).toBe(RELIEF_SCHEMA);
    expect(asked.user).toContain('THE OVER-FULL DAYS');
    const stored = storedRelief(g, frame, out);
    expect(stored).toMatchObject({
      version: WEEK_RELIEF_VERSION,
      model: 'gpt-6-luna',
      days: [{ day: WED, over: 85, moves: [] }],
    });
    expect(stored.basis).toBe(reliefBasis(row.answers, row.read, frame.days, TODAY));
    expect(stored).not.toHaveProperty('input');
    expect(stored.failed).toBeUndefined();
  });

  it('calls no model when no day is over-full', async () => {
    const g = gathered();
    const row = review({ keep: 'none' });
    const frame = spreadFrame(g, row);
    const out = await runWeekRelief({}, g, frame);
    expect(jsonCall).not.toHaveBeenCalled();
    expect(storedRelief(g, frame, out)).toMatchObject({ days: [] });
  });

  it('names the over-full days with no moves when the call failed', () => {
    const g = gathered();
    const row = review();
    const frame = spreadFrame(g, row);
    expect(storedRelief(g, frame, null)).toEqual({
      version: WEEK_RELIEF_VERSION,
      basis: reliefBasis(row.answers, row.read, frame.days, TODAY),
      failed: true,
      days: [{ day: WED, over: 85, asked: 0, moves: [], still: 85, note: '' }],
    });
  });
});
