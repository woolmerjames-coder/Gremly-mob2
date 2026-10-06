/**
 * "This week" on the Worlds tab (lib/store/worldsSelectors.ts): what was made
 * is counted in the person's own week, the seven days that end on their
 * weekly day.
 */
import {
  computeHabitWeekGrid,
  selectWeeklySummaryCardState,
  selectWorldsSummary,
} from '../worldsSelectors';
import { getDateService } from '../../date/DateService';

const QUIET = 'Quiet week so far. Drop something when you have a moment.';

const drop = (id: string, created_at: string) => ({ id, created_at });

function makeState(over: Record<string, unknown> = {}) {
  return {
    todos: [],
    habits: [],
    notes: [],
    dropWorldLinks: [],
    worlds: [],
    chapters: [],
    weeklySummaries: [],
    dco: null,
    weeklyDay: 0,
    ...over,
  };
}

describe('what was made this week', () => {
  const ds = getDateService();
  let was: number;
  let previousTimezone: string;

  // noon on each of four days, the last of them a Monday
  const todos = [
    drop('wed-before', '2025-12-10T12:00:00Z'),
    drop('thu', '2025-12-11T12:00:00Z'),
    drop('sun', '2025-12-14T12:00:00Z'),
    drop('mon', '2025-12-15T12:00:00Z'),
  ];
  // Wednesday 17 December 2025
  const wednesday = new Date('2025-12-17T12:00:00Z');

  beforeEach(() => {
    was = ds.getDayBoundaryHour();
    previousTimezone = ds.getTimezone();
    ds.setTimezone('UTC');
  });

  afterEach(() => {
    ds.setDayBoundaryHour(was);
    ds.setTimezone(previousTimezone);
    jest.useRealTimers();
  });

  it('is counted from Monday for a Sunday person', () => {
    const state = makeState({ todos });
    expect(selectWorldsSummary(state as any, wednesday).dropClause).toBe(
      '1 drop across 1 world this week.',
    );
  });

  it('is counted from Thursday for a Wednesday person', () => {
    const state = makeState({ todos, weeklyDay: 3 });
    expect(selectWorldsSummary(state as any, wednesday).dropClause).toBe(
      '3 drops across 1 world this week.',
    );
    // Thursday starts their next week
    expect(selectWorldsSummary(state as any, new Date('2025-12-18T12:00:00Z')).dropClause).toBe(
      QUIET,
    );
  });

  it('starts when their day does, not at midnight', () => {
    ds.setDayBoundaryHour(3);
    const state = makeState({
      todos: [drop('monday-before', '2025-12-08T12:00:00Z'), drop('late', '2025-12-15T00:20:00Z')],
    });
    // 1 AM on Monday is still Sunday for them, in the week that ends that day
    expect(selectWorldsSummary(state as any, new Date('2025-12-15T01:00:00Z')).dropClause).toBe(
      '2 drops across 1 world this week.',
    );
    // once Monday has begun for them, both belong to the week before
    expect(selectWorldsSummary(state as any, new Date('2025-12-15T12:00:00Z')).dropClause).toBe(
      QUIET,
    );
  });

  it('is counted again on the card when their weekly day changes', () => {
    jest.useFakeTimers();
    jest.setSystemTime(wednesday);
    const state = makeState({ todos });

    const sunday = selectWeeklySummaryCardState(state as any);
    expect(sunday.kind).toBe('in_progress');
    expect((sunday.summary as { dropClause: string }).dropClause).toBe(
      '1 drop across 1 world this week.',
    );

    const midweek = selectWeeklySummaryCardState({ ...state, weeklyDay: 3 } as any);
    expect((midweek.summary as { dropClause: string }).dropClause).toBe(
      '3 drops across 1 world this week.',
    );
  });
});

describe('the weeks a habit was kept, on a world or chapter', () => {
  // Wednesday 17 December 2025; logged on Monday 15 and on Thursday 11
  const logs = [
    { habit_id: 'run', occurred_day: '2025-12-15' },
    { habit_id: 'run', occurred_day: '2025-12-11' },
    { habit_id: 'swim', occurred_day: '2025-12-16' },
  ] as any;

  it('are their own weeks: the seven days that end on their weekly day', () => {
    // a Sunday person: Monday 15 is this week, Thursday 11 the week before
    expect(computeHabitWeekGrid(logs, 'run', 3, 0, '2025-12-17')).toEqual({
      weeks: [false, true, true],
      hitCount: 2,
    });
    // a Wednesday person's week is Thursday 11 to Wednesday 17: both are this week
    expect(computeHabitWeekGrid(logs, 'run', 3, 3, '2025-12-17')).toEqual({
      weeks: [false, false, true],
      hitCount: 1,
    });
    // the last day of a week belongs to it
    expect(computeHabitWeekGrid(logs, 'run', 2, 1, '2025-12-17').weeks).toEqual([true, false]);
  });
});
