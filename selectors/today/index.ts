import type { TodayItem } from './today.types';

// mergeTodayData normalizes raw todo and habit rows into unified TodayItem entries.
export function mergeTodayData(todos: any[], rollingHabits: any[]): TodayItem[] {
  const todoItems: TodayItem[] = (todos ?? []).map((todo) => ({
    id: todo.id,
    kind: 'todo',
    title: todo.title ?? 'Untitled',
    completed: Boolean(todo.completed),
    dueAt: todo.due_at ?? null,
  }));

  const habitItems = (rollingHabits ?? []).map((habit) => {
    const cadence = (habit.cadence ?? 'daily') as 'daily' | 'weekly' | 'monthly';
    const targetPerDay = Number(habit.target_per_day ?? 1);
    const targetPerPeriod = Number(habit.target_per_period ?? 1);
    const todayCount = Number(habit.today_count ?? 0);
    const periodCount = Number(habit.period_count ?? 0);

    const completed =
      cadence === 'daily' ? todayCount >= targetPerDay : periodCount >= targetPerPeriod;

    return {
      id: habit.id,
      kind: 'habit' as const,
      title: habit.name ?? 'Untitled',
      completed,
      cadence,
      targetPerDay,
      targetPerPeriod,
      todayCount,
      periodCount,
      lastCompletedAt: habit.last_completed_at ?? null,
      shouldSurface: Boolean(habit.should_surface_today) && !completed,
    };
  });

  const visibleHabits = habitItems.filter((habit) => habit.completed || habit.shouldSurface);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const normalizedHabits: TodayItem[] = visibleHabits.map(({ shouldSurface, ...rest }) => rest);

  return [...todoItems, ...normalizedHabits];
}

// splitLanes partitions items into incomplete (left) and completed (right) lanes for Today layout.
export function splitLanes(items: TodayItem[]) {
  const left = items.filter((item) => !item.completed);
  const right = items.filter((item) => item.completed);
  return { left, right };
}

// calcProgress returns completion percentage for the provided Today items.
export function calcProgress(items: TodayItem[]) {
  const total = items.length;
  const done = items.filter((item) => item.completed).length;
  return total ? done / total : 0;
}
