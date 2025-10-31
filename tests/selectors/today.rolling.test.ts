import { mergeTodayData, splitLanes } from '../../selectors/today';

const todo = (id: string, completed = false) => ({
  id,
  title: `t${id}`,
  completed,
  due_at: null,
});

const rh = (habit: Record<string, unknown>) => habit;

test('daily habit surfaces until targetPerDay is met', () => {
  const habits = [
    rh({
      id: 'h1',
      name: 'Water',
      cadence: 'daily',
      target_per_day: 5,
      target_per_period: 1,
      today_count: 3,
      period_count: 3,
      should_surface_today: true,
    }),
  ];
  const items = mergeTodayData([todo('t1')], habits as any[]);
  const { left, right } = splitLanes(items as any);
  expect(left.find((item: any) => item.id === 'h1')).toBeTruthy();
  expect(right.find((item: any) => item.id === 'h1')).toBeFalsy();
});

test('daily habit moves right when todayCount >= target', () => {
  const habits = [
    rh({
      id: 'h2',
      name: 'Hydrate',
      cadence: 'daily',
      target_per_day: 5,
      target_per_period: 1,
      today_count: 5,
      period_count: 5,
      should_surface_today: false,
    }),
  ];
  const items = mergeTodayData([], habits as any[]);
  const { left, right } = splitLanes(items as any);
  expect(right.find((item: any) => item.id === 'h2')).toBeTruthy();
  expect(left.find((item: any) => item.id === 'h2')).toBeFalsy();
});

test('weekly habit surfaces until period target met', () => {
  const habits = [
    rh({
      id: 'h3',
      name: 'Run',
      cadence: 'weekly',
      target_per_period: 4,
      target_per_day: 1,
      period_count: 1,
      today_count: 0,
      should_surface_today: true,
    }),
  ];
  const items = mergeTodayData([], habits as any[]);
  const { left, right } = splitLanes(items as any);
  expect(left.find((item: any) => item.id === 'h3')).toBeTruthy();
  expect(right.find((item: any) => item.id === 'h3')).toBeFalsy();
});
