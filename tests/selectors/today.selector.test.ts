import { mergeTodayData, splitLanes, calcProgress } from '../../selectors/today';

describe('today selectors', () => {
  test('mergeTodayData combines todos and habits', () => {
    const todos = [{ id: 't1', title: 'Todo 1', completed: false, due_at: null }];
    const habits = [{ id: 'h1', name: 'Habit 1', target_per_day: 1, completed_count: 0 }];

    const merged = mergeTodayData(todos as any, habits as any);
    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.kind)).toEqual(['todo', 'habit']);
  });

  test('splitLanes divides completed items correctly', () => {
    const items = [
      { id: '1', completed: false },
      { id: '2', completed: true },
    ];
    const { left, right } = splitLanes(items as any);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
  });

  test('calcProgress returns ratio', () => {
    const items = [{ completed: true }, { completed: false }, { completed: false }] as any;
    expect(calcProgress(items)).toBeCloseTo(1 / 3);
  });
});
