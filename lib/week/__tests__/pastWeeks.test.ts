/**
 * Past weeks (lib/week/pastWeeks): the finished reviews the archive reads, and
 * each week in short.
 */
const mockState: any = { userId: 'u1' };
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../../repo/weekReviewRepo', () => ({
  getDoneWeekReviews: jest.fn(),
}));

import { pastWeeksOf, plannedLine, usePastWeeks, weekInShort } from '../pastWeeks';
import { getDoneWeekReviews } from '../../repo/weekReviewRepo';
import type { WeekDayView, YourWeek } from '../yourWeek';

type Todo = WeekDayView['todos'][number];
const todo = (id: string, state: Todo['state'], planned = true): Todo => ({
  id,
  title: id,
  state,
  planned,
  to: null,
});
const habit = (id: string, done: boolean, planned = true) => ({ id, title: id, done, planned });

/** A day of a week: with a plan kept (its todos and habits) or with none. */
const day = (
  date: string,
  rows: { todos?: Todo[]; habits?: ReturnType<typeof habit>[] } | null,
): WeekDayView => ({
  day: date,
  when: 'past',
  todos: rows?.todos ?? [],
  habits: rows?.habits ?? [],
  planned: rows ? (rows.todos ?? []).length + (rows.habits ?? []).length : null,
  done: 0,
  alsoDone: 0,
});

const week = (over: Partial<YourWeek> = {}): YourWeek => ({
  first: '2026-09-28',
  last: '2026-10-04',
  intention: null,
  priorities: [],
  days: [],
  later: { count: 0, next: null },
  ...over,
});

const review = (weekStart: string, intention: string) => ({
  id: `r-${weekStart}`,
  week_start: weekStart,
  status: 'done' as const,
  answers: { intention },
});

beforeEach(() => {
  mockState.userId = 'u1';
  usePastWeeks.setState({ owner: null, byWeek: {}, failed: false });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('a week in short', () => {
  it('is its intention, what mattered most, and what was planned against what got done', () => {
    const short = weekInShort(
      week({
        intention: 'Fewer things, finished.',
        priorities: ['The grant', 'Swimming', 'The shed', 'Calls'],
        days: [
          day('2026-09-28', {
            todos: [todo('t1', 'done'), todo('t2', 'open'), todo('extra', 'done', false)],
            habits: [habit('swim', true)],
          }),
          day('2026-09-29', { todos: [todo('t3', 'done')], habits: [habit('swim', false)] }),
          // a day with no plan kept adds nothing to either count
          day('2026-09-30', null),
        ],
      }),
    );
    expect(short).toEqual({
      intention: 'Fewer things, finished.',
      priorities: ['The grant', 'Swimming', 'The shed'],
      // three todos and two swims; one done without being planned is not counted
      planned: 5,
      done: 3,
    });
    expect(plannedLine(short!)).toBe('Planned 5, done 3');
  });

  it('counts a todo once however many days of the plan it was on', () => {
    // planned for Monday, then the week was planned again and it went to Thursday, where it got done
    const short = weekInShort(
      week({
        days: [
          day('2026-09-28', { todos: [todo('t1', 'moved'), todo('t2', 'moved')] }),
          day('2026-10-01', { todos: [todo('t1', 'done'), todo('t2', 'open')] }),
        ],
      }),
    );
    expect(plannedLine(short!)).toBe('Planned 2, done 1');
  });

  it('has no counts when no plan was kept, and says nothing of them', () => {
    const short = weekInShort(week({ intention: 'Rest.', days: [day('2026-09-28', null)] }));
    expect(short).toEqual({ intention: 'Rest.', priorities: [], planned: null, done: 0 });
    expect(plannedLine(short!)).toBeNull();
  });

  it('counts a week planned with nothing done', () => {
    const short = weekInShort(
      week({ days: [day('2026-09-28', { todos: [todo('a', 'open'), todo('b', 'later')] })] }),
    );
    expect(plannedLine(short!)).toBe('Planned 2, done 0');
  });

  it('is nothing when the review kept nothing to show', () => {
    expect(weekInShort(week())).toBeNull();
    expect(weekInShort(week({ days: [day('2026-09-28', null)] }))).toBeNull();
  });
});

describe('reading the past reviews', () => {
  it('keeps each by the first day of its week, adding to those already read', async () => {
    (getDoneWeekReviews as jest.Mock).mockResolvedValueOnce([
      review('2026-09-21', 'One thing a day.'),
      review('2026-09-28', 'Fewer things, finished.'),
    ]);
    await usePastWeeks.getState().load('2026-09-21', '2026-09-28');
    expect(getDoneWeekReviews).toHaveBeenCalledWith('u1', '2026-09-21', '2026-09-28');
    expect(Object.keys(usePastWeeks.getState().byWeek)).toEqual(['2026-09-21', '2026-09-28']);

    (getDoneWeekReviews as jest.Mock).mockResolvedValueOnce([review('2026-10-05', 'Rest.')]);
    await usePastWeeks.getState().load('2026-10-05', '2026-10-05');
    const read = usePastWeeks.getState();
    expect(Object.keys(read.byWeek)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(read.byWeek['2026-10-05'].answers.intention).toBe('Rest.');
    expect(read.failed).toBe(false);
  });

  it('says so when the read fails, keeps what it had, and clears that on the next good read', async () => {
    usePastWeeks.setState({
      owner: 'u1',
      byWeek: { '2026-09-21': review('2026-09-21', 'One thing a day.') },
    });
    (getDoneWeekReviews as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await usePastWeeks.getState().load('2026-09-21', '2026-09-28');
    expect(usePastWeeks.getState().failed).toBe(true);
    expect(Object.keys(usePastWeeks.getState().byWeek)).toEqual(['2026-09-21']);
    expect(console.warn).toHaveBeenCalled();

    (getDoneWeekReviews as jest.Mock).mockResolvedValueOnce([]);
    await usePastWeeks.getState().load('2026-09-21', '2026-09-28');
    expect(usePastWeeks.getState().failed).toBe(false);
  });

  it('keeps nothing of one person for the next to sign in', async () => {
    (getDoneWeekReviews as jest.Mock).mockResolvedValueOnce([review('2026-09-21', 'Mine.')]);
    await usePastWeeks.getState().load('2026-09-21', '2026-09-28');
    expect(Object.keys(pastWeeksOf(usePastWeeks.getState(), 'u1'))).toEqual(['2026-09-21']);
    // someone else signs in: nothing of the first is theirs, before or after their own read
    mockState.userId = 'u2';
    expect(pastWeeksOf(usePastWeeks.getState(), 'u2')).toEqual({});
    (getDoneWeekReviews as jest.Mock).mockResolvedValueOnce([review('2026-09-28', 'Theirs.')]);
    await usePastWeeks.getState().load('2026-09-21', '2026-09-28');
    expect(Object.keys(pastWeeksOf(usePastWeeks.getState(), 'u2'))).toEqual(['2026-09-28']);
    expect(pastWeeksOf(usePastWeeks.getState(), 'u1')).toEqual({});
    expect(pastWeeksOf(usePastWeeks.getState(), null)).toEqual({});
  });

  it('drops a read that comes back after someone else has signed in', async () => {
    let finish: (rows: unknown[]) => void = () => undefined;
    (getDoneWeekReviews as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = usePastWeeks.getState().load('2026-09-21', '2026-09-28');
    mockState.userId = 'u2';
    (getDoneWeekReviews as jest.Mock).mockResolvedValueOnce([]);
    await usePastWeeks.getState().load('2026-09-21', '2026-09-28');
    finish([review('2026-09-21', 'Mine.')]);
    await first;
    expect(usePastWeeks.getState().byWeek).toEqual({});
  });

  it('reads nothing with no one signed in', async () => {
    mockState.userId = null;
    await usePastWeeks.getState().load('2026-09-21', '2026-09-28');
    expect(getDoneWeekReviews).not.toHaveBeenCalled();
  });
});
