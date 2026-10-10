/**
 * The Sweep count a notification may name: the app's own rules
 * (selectSweepCandidatesUnified), so the number matches what Sweep shows.
 */
import { countBoth, countSweep, eveningItems, quickSweepItems } from '../sweepCount';

const today = '2026-10-01';
const tz = 'America/Los_Angeles';
const todo = (over = {}) => ({ id: Math.random().toString(36), due_day: null, ...over });
const note = (over = {}) => ({
  id: Math.random().toString(36),
  subtype: 'idea',
  created_at: '2026-10-01T18:00:00Z', // 11am that day in Los Angeles
  ...over,
});

test('late-night notes count for the person day, respecting a midnight preference', () => {
  const notes = ['catchall', 'list', 'reference'].map((subtype) =>
    note({ subtype, created_at: '2026-10-02T08:00:00Z' }),
  );
  expect(countBoth({ notes, today, tz, day: today }).evening).toBe(3);
  expect(countBoth({ notes, today, tz, day: today, dayEndHour: 0 }).evening).toBe(0);
});

describe('countSweep: todos', () => {
  it('counts overdue, due today and undated todos', () => {
    const todos = [
      todo({ due_day: '2026-09-29' }),
      todo({ due_day: today }),
      todo({ due_day: today }),
      todo(),
    ];
    expect(countSweep({ todos, today, tz })).toBe(4);
  });

  it('leaves out later todos, done ones and ones resurfacing later', () => {
    const todos = [
      todo({ due_day: '2026-10-05' }),
      todo({ resurface_at: '2026-10-03' }),
      todo({ due_day: today, completed_at: '2026-10-01T17:00:00Z' }),
    ];
    expect(countSweep({ todos, today, tz })).toBe(0);
  });

  it('brings back a later todo that was skipped, or resurfaces today', () => {
    const todos = [
      todo({ due_day: '2026-10-05', skipped_in_sweep_at: '2026-09-30T03:00:00Z' }),
      todo({ due_day: '2026-10-05', resurface_at: today }),
    ];
    expect(countSweep({ todos, today, tz })).toBe(2);
  });

  it('a todo put off (Later) is an evening card on the day it comes back, and not before', () => {
    // a Later has no day of its own: its day to come back is what brings it to the cards
    const todos = [
      todo({ id: 'back-today', resurface_at: today, decided_at: '2026-09-20T18:00:00Z' }),
      todo({ id: 'back-earlier', resurface_at: '2026-09-29', decided_at: '2026-09-20T18:00:00Z' }),
      todo({ id: 'still-away', resurface_at: '2026-10-04', decided_at: '2026-09-20T18:00:00Z' }),
    ];
    expect(
      eveningItems({ todos, today, tz })
        .todos.map((t) => t.id)
        .sort(),
    ).toEqual(['back-earlier', 'back-today']);
    expect(countBoth({ todos, today, tz, day: today }).evening).toBe(2);
  });

  it('the evening that went wrong: 16 due today, 5 undated and one idea make 22, not 6', () => {
    const todos = [
      ...Array.from({ length: 16 }, () => todo({ due_day: today })),
      ...Array.from({ length: 5 }, () => todo()),
      ...Array.from({ length: 4 }, () => todo({ due_day: '2026-10-08' })),
    ];
    expect(countSweep({ todos, notes: [note()], today, tz })).toBe(22);
  });
});

describe('countSweep: notes', () => {
  it('counts ideas from the last week, and lists made today', () => {
    const notes = [
      note({ created_at: '2026-09-25T18:00:00Z' }),
      note({ created_at: '2026-09-20T18:00:00Z' }), // too old
      note({ subtype: 'list' }),
      note({ subtype: 'reference', created_at: '2026-09-30T18:00:00Z' }), // yesterday
    ];
    expect(countSweep({ notes, today, tz })).toBe(2);
  });

  it('reads "today" in their own time zone', () => {
    // 6am UTC on 1 Oct is still 30 Sep in Los Angeles
    expect(
      countSweep({
        notes: [note({ subtype: 'catchall', created_at: '2026-10-01T06:00:00Z' })],
        today,
        tz,
      }),
    ).toBe(0);
  });

  it('counts upcoming events Gremly holds, not calendar copies or past ones', () => {
    const notes = [
      note({ subtype: 'event', target_date: '2026-10-04' }),
      note({
        subtype: 'event',
        target_date: '2026-10-04',
        external_source: { provider: 'google' },
      }),
      note({ subtype: 'event', target_date: '2026-09-28' }),
    ];
    expect(countSweep({ notes, today, tz })).toBe(1);
  });

  it('leaves out swept notes and journals, unless a question Sweep asks waits on them', () => {
    const pending = { status: 'pending', classified: { bucket: 'note' } };
    const notes = [
      note({ swept_at: '2026-10-01T19:00:00Z' }),
      note({ subtype: 'journal' }),
      // made today: asked
      note({ subtype: 'journal', relation: pending }),
      note({
        subtype: 'catchall',
        created_at: '2026-09-01T18:00:00Z',
        swept_at: '2026-09-02T03:00:00Z',
        views: { relation: pending, ask_since: today },
      }),
      // asked a month ago and never answered: it has lapsed (stage 8)
      note({
        subtype: 'catchall',
        created_at: '2026-09-01T18:00:00Z',
        swept_at: '2026-09-02T03:00:00Z',
        views: { relation: pending },
      }),
    ];
    expect(countSweep({ notes, today, tz })).toBe(2);
  });

  it('brings back a skipped or resurfacing note, and holds back one resurfacing later', () => {
    const notes = [
      note({
        subtype: 'reference',
        created_at: '2026-09-01T18:00:00Z',
        skipped_in_sweep_at: '2026-09-30T03:00:00Z',
      }),
      note({
        subtype: 'reference',
        created_at: '2026-09-01T18:00:00Z',
        resurface_at: today,
        swept_at: '2026-09-02T03:00:00Z',
      }),
      note({ resurface_at: '2026-10-09' }),
    ];
    expect(countSweep({ notes, today, tz })).toBe(2);
  });
});

describe('the old Lock In flag', () => {
  it('keeps nothing out of the count: Lock In is gone from the app', () => {
    const todos = [
      todo({ due_day: today, commitment: true, commitment_started_at: '2026-10-01T15:00:00Z' }),
      todo({ due_day: '2026-09-30', commitment: true }),
    ];
    expect(countSweep({ todos, today, tz })).toBe(2);
  });
});

describe('the quick sweep: what still needs a decision', () => {
  const lastSweepAt = '2026-10-02T03:41:00Z'; // 8:41pm on 1 Oct in Los Angeles
  const morning = '2026-10-02';
  const dropped = (h) => todo({ created_at: `2026-10-02T0${h}:00:00Z` });

  it('2 October: only the six drops after last night’s Sweep, not the four kept for today', () => {
    const todos = [
      ...[4, 5, 6, 7, 7, 7].map(dropped),
      ...Array.from({ length: 4 }, () =>
        todo({
          due_day: morning,
          decided_at: '2026-10-02T03:40:00Z',
          created_at: '2026-09-28T18:00:00Z',
        }),
      ),
    ];
    const c = countBoth({ todos, notes: [], lastSweepAt, today: morning, tz });
    expect(c).toMatchObject({
      all: 10,
      quick: 6,
      pastDay: 0,
      noDay: 6,
      other: 0,
      notes: 0,
      newSince: 6,
    });
  });

  it('keeps what is past its day, skipped or back today, and drops the decided', () => {
    const todos = [
      todo({ due_day: '2026-09-30', decided_at: '2026-09-29T18:00:00Z' }),
      todo({
        due_day: morning,
        decided_at: '2026-10-01T18:00:00Z',
        skipped_in_sweep_at: '2026-10-02T03:40:00Z',
      }),
      todo({ due_day: morning, decided_at: '2026-09-20T18:00:00Z', resurface_at: morning }),
      todo({ due_day: morning, decided_at: '2026-10-01T18:00:00Z' }),
      todo({ decided_at: '2026-09-20T18:00:00Z' }),
    ];
    const q = quickSweepItems({ todos, today: morning, tz });
    expect([q.pastDay.length, q.noDay.length, q.other.length]).toEqual([1, 0, 2]);
    expect(q.newSince).toBeNull();
  });

  it('keeps unswept drops and questions, leaves upcoming events for the evening', () => {
    const notes = [
      note({ subtype: 'list', created_at: '2026-10-02T14:00:00Z' }), // 7am today
      note({ subtype: 'event', target_date: '2026-10-07' }),
      note({
        subtype: 'catchall',
        created_at: '2026-09-01T18:00:00Z',
        swept_at: '2026-09-02T03:00:00Z',
        relation: { classified: { bucket: 'log' }, status: 'pending' },
        ask_since: morning,
      }),
      // a question from a month ago has lapsed: not asked (stage 8)
      note({
        subtype: 'catchall',
        created_at: '2026-09-01T18:00:00Z',
        swept_at: '2026-09-02T03:00:00Z',
        relation: { classified: { bucket: 'log' }, status: 'pending' },
      }),
    ];
    const q = quickSweepItems({ notes, today: morning, tz, since: lastSweepAt });
    expect(q.notes).toHaveLength(2);
    expect(q.newSince).toBe(1);
  });

  it('before the decided_at column exists, every undated todo still counts', () => {
    const c = countBoth({ todos: [todo(), todo({ due_day: morning })], today: morning, tz });
    expect(c).toMatchObject({ all: 2, quick: 1, noDay: 1 });
  });
});

describe("the evening wrap up's cards", () => {
  const today = '2026-09-30';
  const tz = 'America/Los_Angeles';

  it('a todo due today that did not happen is a card like any other', () => {
    const todos = [
      { id: 'due1', due_day: today },
      { id: 'due2', due_day: today },
      { id: 'late', due_day: '2026-09-28' },
      { id: 'undated', due_day: null },
      { id: 'later', due_day: '2026-10-03' },
    ];
    const e = eveningItems({ todos, notes: [], today, tz });
    expect(e.todos.map((t) => t.id)).toEqual(['due1', 'due2', 'late', 'undated']);
    expect(countBoth({ todos, notes: [], today, tz })).toMatchObject({ all: 4, evening: 4 });
  });

  it("counts from the person's day after midnight", () => {
    // 12:30am on 1 Oct, their day still 30 Sep: a todo due 1 Oct is tomorrow's,
    // not a card tonight
    const todos = [
      { id: 'a', due_day: '2026-09-30' },
      { id: 'b', due_day: '2026-10-01' },
    ];
    const c = countBoth({ todos, notes: [], today: '2026-10-01', tz, day: '2026-09-30' });
    expect(c.evening).toBe(1);
    // counted from the calendar date both would be cards
    expect(countBoth({ todos, notes: [], today: '2026-10-01', tz }).evening).toBe(2);
  });
});

describe('a todo with a deadline and no day planned (stage 2c)', () => {
  it('is a Sweep card before, on and after its deadline, as Sweep asks for a day', () => {
    const todos = ['2026-10-05', today, '2026-09-30'].map((target_date) => todo({ target_date }));
    expect(countSweep({ todos, today, tz })).toBe(3);
  });

  it('is past its day in the quick sweep once its deadline has passed', () => {
    const decided = { decided_at: '2026-09-20T18:00:00Z' };
    const q = quickSweepItems({
      todos: [
        todo({ target_date: '2026-09-30', ...decided }),
        todo({ target_date: today, ...decided }),
        todo({ target_date: '2026-10-05' }),
      ],
      today,
      tz,
    });
    expect([q.pastDay.length, q.noDay.length, q.other.length]).toEqual([1, 1, 0]);
  });

  it('a planned day wins over the deadline', () => {
    const q = quickSweepItems({
      todos: [todo({ due_day: '2026-10-03', target_date: '2026-09-30' })],
      today,
      tz,
    });
    expect(q.pastDay).toHaveLength(0);
  });
});
