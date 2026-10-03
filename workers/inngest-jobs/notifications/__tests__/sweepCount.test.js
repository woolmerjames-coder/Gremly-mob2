/**
 * The Sweep count a notification may name: the app's own rules
 * (selectSweepCandidatesUnified), so the number matches what Sweep shows.
 */
import { countBoth, countSweep, lockedIn, quickSweepItems } from '../sweepCount';

const today = '2026-10-01';
const tz = 'America/Los_Angeles';
const todo = (over = {}) => ({ id: Math.random().toString(36), due_day: null, ...over });
const note = (over = {}) => ({
  id: Math.random().toString(36),
  subtype: 'idea',
  created_at: '2026-10-01T18:00:00Z', // 11am that day in Los Angeles
  ...over,
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

  it('leaves out later todos, locked in ones and ones resurfacing later', () => {
    const todos = [
      todo({ due_day: '2026-10-05' }),
      todo({ due_day: today, commitment: true }),
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

  it('leaves out swept notes and journals, unless a question waits on them', () => {
    const pending = { status: 'pending', classified: { bucket: 'note' } };
    const notes = [
      note({ swept_at: '2026-10-01T19:00:00Z' }),
      note({ subtype: 'journal' }),
      note({ subtype: 'journal', relation: pending }),
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

describe('a Lock In lasts its own day', () => {
  it('counts a todo locked in yesterday as no longer locked in', () => {
    const todos = [
      // locked in by yesterday's plan, never done
      todo({
        due_day: '2026-09-30',
        commitment: true,
        commitment_started_at: '2026-09-30T16:00:00Z',
      }),
      // locked in this morning for today
      todo({ due_day: today, commitment: true, commitment_started_at: '2026-10-01T15:00:00Z' }),
    ];
    expect(lockedIn(todos[0], today, tz)).toBe(false);
    expect(lockedIn(todos[1], today, tz)).toBe(true);
    expect(countSweep({ todos, today, tz })).toBe(1);
  });

  it('a Lock In made last night for today still holds', () => {
    // 9pm on 30 Sep in Los Angeles, due 1 Oct: the day it was for is today
    const t = todo({
      due_day: today,
      commitment: true,
      commitment_started_at: '2026-10-01T04:00:00Z',
    });
    expect(lockedIn(t, today, tz)).toBe(true);
  });

  it('a Lock In from an earlier plan ends, even when the todo is due later', () => {
    // the Sage deck: locked in on 30 Sep, due 3 Oct
    const t = todo({
      due_day: '2026-10-03',
      commitment: true,
      commitment_started_at: '2026-09-30T16:00:00Z',
    });
    expect(lockedIn(t, today, tz)).toBe(false);
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
