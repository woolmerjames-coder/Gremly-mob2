import type { TodayItem } from './today.types';

// mergeTodayData normalizes raw todo and habit rows into unified TodayItem entries.
export function mergeTodayData(todos: any[], habits: any[]): TodayItem[] {
  const toBoolean = (value: unknown) => Boolean(value);

  const todoItems: TodayItem[] = todos.map((todo) => ({
    id: todo.id,
    kind: 'todo',
    title: todo.title ?? 'Untitled',
    completed: toBoolean(todo.completed),
    dueAt: todo.due_at ?? null,
  }));

  const habitItems: TodayItem[] = habits.map((habit) => ({
    id: habit.id,
    kind: 'habit',
    title: habit.name ?? 'Untitled',
    completed: computeHabitDone(habit),
    cadence: habit.cadence,
    targetPerPeriod: habit.target_per_period,
    targetPerDay: habit.target_per_day,
    completedCount: habit.completed_count ?? 0,
    totalCount: habit.target_per_day ?? 1,
    lastCompletedAt: habit.last_completed_at ?? null,
  }));

  return [...todoItems, ...habitItems];
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

function computeHabitDone(habit: any) {
  const targetPerDay = Number(habit.target_per_day ?? 1);
  const completedCount = Number(habit.completed_count ?? 0);

  if (habit.cadence === 'daily') {
    return completedCount >= targetPerDay && targetPerDay > 0;
  }

  // TODO: Weekly/monthly logic can consider period_start_at & cadence windows once defined.
  return false;
}
