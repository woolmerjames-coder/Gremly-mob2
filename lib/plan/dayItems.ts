/**
 * What a day other than today holds, from the store's rows: the open todos
 * due on it and the habits on for it. Planning tomorrow and the sheet it adds
 * from read the same, so the plan and the sheet never disagree. Pure.
 */
import { weekdayOf } from '../wrapup/day';

type TodoRow = {
  archived?: boolean | null;
  completed_at?: string | null;
  due_day?: string | null;
  resurface_at?: string | null;
};
type HabitRow = {
  archived?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  cadence?: string | null;
  days_active?: unknown;
};

/**
 * Open todos on the day: the ones due on it, and the ones put off (Later)
 * that come back on it, which have no day of their own. The same rule Today
 * reads by (lib/store/selectors.ts selectTodosDueToday).
 */
export function todosDueOn<T extends TodoRow>(todos: T[], day: string): T[] {
  return todos.filter(
    (t) =>
      !t.archived &&
      !t.completed_at &&
      (t.due_day === day || (!t.due_day && t.resurface_at === day)),
  );
}

/** Habits on for the day: started by then, not ended, and daily or set for its weekday. */
export function habitsOnDay<H extends HabitRow>(habits: H[], day: string): H[] {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return habits.filter((h) => {
    if (h.archived || !h.start_date || h.start_date > day) return false;
    if (h.end_date && h.end_date < day) return false;
    if ((h.cadence ?? 'daily') === 'daily') return true;
    return Array.isArray(h.days_active) && h.days_active.some((d) => d === weekday);
  });
}

/** Why a todo due on the day is in its plan: "Due today", or "Due Monday" for another day. */
export function dueWords(day: string, today: string): string {
  return day === today ? 'Due today' : `Due ${weekdayOf(day)}`;
}
