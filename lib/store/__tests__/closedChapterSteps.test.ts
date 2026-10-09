/**
 * Steps left on a closed Chapter stay with it and leave the day lists: Today,
 * overdue, Sweep and the wrap up (Worlds rebuild, James's call in round two).
 * A step on an open Chapter, or in no Chapter, is shown as before.
 */
import {
  selectDayTodos,
  selectOverdueTodos,
  selectStepsOnClosedChapters,
  selectTodosDueToday,
  sweepCandidatesAsOf,
} from '../selectors';

jest.mock('../useGremlyStore', () => ({
  useGremlyStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

const todo = (id: string, due_day: string | null) =>
  ({
    id,
    type: 'todo',
    name: id,
    due_day,
    archived: false,
    completed_at: null,
    created_at: '2025-12-10T09:00:00Z',
  }) as any;

const state = (over: Record<string, unknown> = {}) =>
  ({
    todos: [
      todo('left', '2025-12-15'),
      todo('leftLate', '2025-12-12'),
      todo('open', '2025-12-15'),
      todo('loose', '2025-12-12'),
    ],
    notes: [],
    habits: [],
    worlds: [],
    dropWorldLinks: [],
    hiddenTodayIds: [],
    chapters: [
      { id: 'cDone', title: 'Done', phase: 'closed', closed_at: '2025-12-13T10:00:00Z' },
      { id: 'cOpen', title: 'Open', phase: 'active', closed_at: null },
    ],
    dropChapterLinks: [
      { drop_id: 'left', drop_type: 'todo', chapter_id: 'cDone' },
      { drop_id: 'leftLate', drop_type: 'todo', chapter_id: 'cDone' },
      { drop_id: 'open', drop_type: 'todo', chapter_id: 'cOpen' },
    ],
    ...over,
  }) as any;

describe('steps on a closed Chapter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('are the todos filed in a Chapter that is closed', () => {
    expect([...selectStepsOnClosedChapters(state())].sort()).toEqual(['left', 'leftLate']);
  });

  it('leave Today and the overdue list, and the rest stay', () => {
    const s = state();
    expect(selectDayTodos(s).map((t) => t.id)).toEqual(['open', 'loose']);
    expect(selectTodosDueToday(s).map((t) => t.id)).toEqual(['open']);
    expect(selectOverdueTodos(s).map((t) => t.id)).toEqual(['loose']);
  });

  it('come back once the Chapter is open again', () => {
    const s = state({
      chapters: [{ id: 'cDone', title: 'Done', phase: 'active', closed_at: null }],
    });
    expect(
      selectTodosDueToday(s)
        .map((t) => t.id)
        .sort(),
    ).toEqual(['left', 'open']);
  });

  it('leave Sweep and the wrap up', () => {
    const s = state();
    const cards = sweepCandidatesAsOf(
      s.todos,
      [],
      [],
      [],
      '2025-12-15',
      selectStepsOnClosedChapters(s),
    );
    expect(cards.map((c) => c.candidate.id).sort()).toEqual(['loose', 'open']);
  });
});
