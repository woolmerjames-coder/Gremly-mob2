import { buildCandidatePool, type PoolInput } from '../candidatePool';
import { DEFAULT_TIME_BLOCK_PREFERENCES } from '../../capacity/capacityTypes';
import type { Habit, Todo } from '../../types';

const TODAY = '2026-09-30'; // a Wednesday

function todo(id: string, extra: Partial<Todo> = {}): Todo {
  return { id, type: 'todo', name: id, archived: false, completed_at: null, ...extra } as Todo;
}
function habit(id: string, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    type: 'habit',
    name: id,
    archived: false,
    subtype: 'start_habit',
    ...extra,
  } as Habit;
}

function input(over: Partial<PoolInput> = {}): PoolInput {
  return {
    today: TODAY,
    todosDueToday: [],
    habitsDueToday: [],
    todos: [],
    habits: [],
    doneThisWeek: new Map(),
    doneToday: new Set(),
    lockedHabitIds: new Set(),
    daysGone: 3,
    claims: [],
    reach: null,
    blocks: DEFAULT_TIME_BLOCK_PREFERENCES,
    ...over,
  };
}

describe('the candidate pool', () => {
  it('never holds anything past its date or an unsorted drop', () => {
    const overdue = todo('overdue', { due_day: '2026-09-28' });
    const unsorted = todo('unsorted', { due_day: null });
    const due = todo('due', { due_day: TODAY });
    const pool = buildCandidatePool(
      input({
        todos: [overdue, unsorted, due],
        todosDueToday: [due],
        // even claimed or on Today, a past date belongs to Sweep
        claims: [{ type: 'todo', id: 'overdue', why: 'It matters' }],
      }),
    );
    expect(pool.map((c) => c.id)).toEqual(['due']);
  });

  it('holds habits behind this week and what was kept from Sweep today', () => {
    // kept from Sweep: Sweep dates it today
    const kept = todo('kept', { due_day: TODAY });
    const social = habit('social', { cadence: 'weekly', target_per_period: 3 });
    const pushups = habit('pushups', { cadence: 'weekly', target_per_period: 2 });
    const pool = buildCandidatePool(
      input({
        todos: [kept],
        todosDueToday: [kept],
        habits: [social, pushups],
        doneThisWeek: new Map([['social', 0]]),
      }),
    );
    // on a Wednesday 0 of 3 is behind, 0 of 2 is not
    expect(pool.map((c) => [c.id, c.source])).toEqual([
      ['social', 'behind'],
      ['kept', 'due'],
    ]);
    expect(pool[0].why).toBe('0 of 3 this week, behind');
  });

  it('puts claims first, then what is on Today, and leaves out done and archived items', () => {
    const claimed = todo('claimed', { due_day: TODAY, time_estimate_minutes: 20 });
    const committed = todo('committed', { due_day: TODAY, commitment: true });
    const done = todo('done', { due_day: TODAY, completed_at: '2026-09-30T10:00:00Z' });
    const run = habit('run', { time_window: 'evening' });
    const pool = buildCandidatePool(
      input({
        todos: [claimed, committed, done],
        todosDueToday: [claimed, done],
        habits: [run],
        habitsDueToday: [run],
        lockedHabitIds: new Set(),
        claims: [{ type: 'todo', id: 'claimed', why: 'Dana needs it today' }],
      }),
    );
    expect(pool.map((c) => c.id)).toEqual(['claimed', 'committed', 'run']);
    expect(pool[0]).toMatchObject({ minutes: 20, why: 'Dana needs it today', source: 'claim' });
    expect(pool[2].window).toEqual([17 * 60, 22 * 60]);
  });

  it('counts a Lock In only for the day it is due, as Today shows it', () => {
    // locked in yesterday, then moved to Saturday in Sweep: not on today
    const moved = todo('moved', { due_day: '2026-10-03', commitment: true });
    const undated = todo('undated', { due_day: null, commitment: true });
    const pool = buildCandidatePool(input({ todos: [moved, undated] }));
    expect(pool.map((c) => c.id)).toEqual([]);
  });

  it('adds the reach: a todo as it is, a fact as a suggestion', () => {
    const fact = buildCandidatePool(
      input({
        reach: {
          type: 'fact',
          id: 'fact-1',
          statement: 'Book the car service',
          why: 'It is overdue',
          facts: [],
        },
      }),
    );
    expect(fact).toEqual([
      expect.objectContaining({
        id: 'fact-1',
        kind: 'reach',
        fromFact: true,
        why: 'It is overdue',
      }),
    ]);
    const asTodo = buildCandidatePool(
      input({
        todos: [todo('car', { due_day: null })],
        reach: {
          type: 'todo',
          id: 'car',
          title: 'Book the car service',
          why: 'It is overdue',
          facts: [],
        },
      }),
    );
    expect(asTodo[0]).toMatchObject({ id: 'car', kind: 'todo', source: 'reach' });
  });
});
