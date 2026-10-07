import { buildCandidatePool, type PoolInput } from '../candidatePool';
import { DEFAULT_TIME_BLOCK_PREFERENCES } from '../../capacity/capacityTypes';
import type { HabitAdaptationRow } from '../../store/useGremlyStore';
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
function pause(habitId: string, first: string, last: string): HabitAdaptationRow {
  return {
    id: `pause-${habitId}`,
    owner_id: 'u',
    habit_id: habitId,
    mode: 'pause',
    period_start: first,
    period_end: last,
    created_at: `${first}T08:00:00Z`,
    updated_at: `${first}T08:00:00Z`,
  };
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
    placedIds: new Set(),
    // a Sunday person: their week is Monday to Sunday, so Wednesday is day 3
    week: { weeklyDay: 0 },
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
    // the plan gave this one a time this morning
    const placed = todo('placed', { due_day: TODAY });
    const done = todo('done', { due_day: TODAY, completed_at: '2026-09-30T10:00:00Z' });
    const run = habit('run', { time_window: 'evening' });
    const pool = buildCandidatePool(
      input({
        todos: [claimed, placed, done],
        todosDueToday: [claimed, done],
        habits: [run],
        habitsDueToday: [run],
        placedIds: new Set(['placed']),
        claims: [{ type: 'todo', id: 'claimed', why: 'Dana needs it today' }],
      }),
    );
    expect(pool.map((c) => c.id)).toEqual(['claimed', 'placed', 'run']);
    expect(pool[1]).toMatchObject({ why: 'On Today', source: 'today' });
    expect(pool[0]).toMatchObject({ minutes: 20, why: 'Dana needs it today', source: 'claim' });
    expect(pool[2].window).toEqual([17 * 60, 22 * 60]);
  });

  it('takes no notice of an old Lock In: only a time the plan gave today counts as on Today', () => {
    const flagged = todo('flagged', { due_day: '2026-10-03', commitment: true });
    const undated = todo('undated', { due_day: null, commitment: true });
    expect(buildCandidatePool(input({ todos: [flagged, undated] })).map((c) => c.id)).toEqual([]);
    // an undated todo the plan placed today is on Today
    const pool = buildCandidatePool(
      input({ todos: [flagged, undated], placedIds: new Set(['undated']) }),
    );
    expect(pool.map((c) => [c.id, c.source])).toEqual([['undated', 'today']]);
  });

  it('leaves what is on Today out of a plan for another day', () => {
    const placed = todo('placed', { due_day: null });
    const pool = buildCandidatePool(
      input({ todos: [placed], placedIds: new Set(['placed']), forToday: false }),
    );
    expect(pool).toEqual([]);
  });

  describe('with their week', () => {
    it('holds a habit they planned for the day, ahead of the ones behind, and says so', () => {
      const strength = habit('strength', { cadence: 'weekly', target_per_period: 3 });
      const social = habit('social', { cadence: 'weekly', target_per_period: 3 });
      const read = habit('read', { cadence: 'weekly', target_per_period: 1 });
      const pool = buildCandidatePool(
        input({
          habits: [social, read, strength],
          plannedHabits: new Set(['strength']),
        }),
      );
      expect(pool.map((c) => [c.id, c.source, c.why])).toEqual([
        ['strength', 'planned', 'Planned for today'],
        ['social', 'behind', '0 of 3 this week, behind'],
      ]);
    });

    it('leaves a planned habit out once it is done today', () => {
      const strength = habit('strength', { cadence: 'weekly', target_per_period: 3 });
      const pool = buildCandidatePool(
        input({
          habits: [strength],
          plannedHabits: new Set(['strength']),
          doneToday: new Set(['strength']),
        }),
      );
      expect(pool).toEqual([]);
    });

    it('holds a habit behind in the week of a Wednesday person', () => {
      // their week is Thursday to Wednesday, so this Wednesday is its last day
      const strength = habit('strength', { cadence: 'weekly', target_per_period: 3 });
      const done = { habits: [strength], doneThisWeek: new Map([['strength', 2]]) };
      const pool = buildCandidatePool(input({ ...done, week: { weeklyDay: 3 } }));
      expect(pool.map((c) => [c.id, c.source, c.why])).toEqual([
        ['strength', 'behind', '2 of 3 this week, behind'],
      ]);
      // for a Sunday person it is day 3, and 2 of 3 is on pace
      expect(buildCandidatePool(input(done))).toEqual([]);
      // and Thursday is the first day of their next week
      expect(
        buildCandidatePool(
          input({ habits: [strength], today: '2026-10-01', week: { weeklyDay: 3 } }),
        ),
      ).toEqual([]);
    });

    it('leaves a paused habit out, however it would have come in', () => {
      const social = habit('social', { cadence: 'weekly', target_per_period: 3 });
      const run = habit('run');
      const walk = habit('walk');
      const all = {
        habits: [social, run, walk],
        habitsDueToday: [walk],
        plannedHabits: new Set(['run']),
        placedIds: new Set(['walk']),
        claims: [{ type: 'habit' as const, id: 'run', why: 'It matters' }],
      };
      expect(buildCandidatePool(input(all)).map((c) => [c.id, c.source])).toEqual([
        ['run', 'claim'],
        ['walk', 'today'],
        ['social', 'behind'],
      ]);

      const eases = [
        pause('social', TODAY, '2026-10-02'),
        pause('run', '2026-09-28', TODAY),
        pause('walk', TODAY, TODAY),
      ];
      const week = { weeklyDay: 0, eases };
      expect(buildCandidatePool(input({ ...all, week }))).toEqual([]);
      // the day after their pauses end, run and walk can be planned again
      expect(
        buildCandidatePool(input({ ...all, today: '2026-10-01', week })).map((c) => c.id),
      ).toEqual(['run', 'walk']);
    });

    it('says a habit planned for another day is planned for that day', () => {
      const strength = habit('strength', { cadence: 'weekly', target_per_period: 3 });
      const pool = buildCandidatePool(
        input({
          today: '2026-10-01',
          realToday: TODAY,
          forToday: false,
          habits: [strength],
          plannedHabits: new Set(['strength']),
        }),
      );
      expect(pool[0].why).toBe('Planned for Thursday');
    });

    it('says what a milestone step is a step towards, and when a todo is back from Later', () => {
      const step = todo('step', {
        due_day: TODAY,
        views: { milestone: { goal: 'Send the grant application', date: '2026-10-20' } },
      } as Partial<Todo>);
      const back = todo('back', { due_day: null, resurface_at: TODAY } as Partial<Todo>);
      const plain = todo('plain', { due_day: TODAY });
      const pool = buildCandidatePool(
        input({
          todos: [step, back, plain],
          todosDueToday: [step, back, plain],
        }),
      );
      const why = Object.fromEntries(pool.map((c) => [c.id, c.why]));
      expect(why.step).toBe('A step towards Send the grant application');
      expect(why.plain).toBe('Due today');
      // a Later has no day of its own: its day to come back is what makes it plannable
      expect(why.back).toBe('Back from Later');
    });

    it('still leaves out a todo with no day that is not back today', () => {
      const away = todo('away', { due_day: null, resurface_at: '2026-10-05' } as Partial<Todo>);
      const came = todo('came', { due_day: null, resurface_at: '2026-09-28' } as Partial<Todo>);
      const pool = buildCandidatePool(input({ todos: [away, came], todosDueToday: [away, came] }));
      expect(pool).toEqual([]);
    });
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
