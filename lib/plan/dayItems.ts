/**
 * What a day other than today holds, from the store's rows: the open todos
 * due on it and the habits on for it. Planning tomorrow and the sheet it adds
 * from read the same, so the plan and the sheet never disagree. Pure.
 */
import type { HabitAdaptationRow } from '../store/useGremlyStore';
import { pausedOn } from '../week/habitWeek';
import { weekdayOf } from '../wrapup/day';
// Which day a todo is on: its planned day, else its deadline (stage 2c, 9 Oct 2026)
import { isTodoOn, plannedDayOf } from '../../workers/shared/todoDay';

type TodoRow = {
  archived?: boolean | null;
  completed_at?: string | null;
  due_day?: string | null;
  scheduled_date?: string | null;
  target_date?: string | null;
  resurface_at?: string | null;
  views?: Record<string, any> | null;
};
type HabitRow = {
  id: string;
  archived?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  cadence?: string | null;
  days_active?: unknown;
};

/**
 * Open todos on the day: the ones due on it (their planned day, or with none
 * their deadline: workers/shared/todoDay.js), and the ones put off (Later)
 * that come back on it, which have no day of their own. The same rule Today
 * reads by (lib/store/selectors.ts selectTodosDueToday).
 */
export function todosDueOn<T extends TodoRow>(todos: T[], day: string): T[] {
  return todos.filter(
    (t) =>
      !t.archived &&
      !t.completed_at &&
      (isTodoOn(t, day) || (!plannedDayOf(t) && t.resurface_at === day)),
  );
}

/**
 * Habits on for the day: started by then, not ended, and daily or set for its
 * weekday. One paused on the day (eases: their habit_adaptations rows) is
 * left out.
 */
export function habitsOnDay<H extends HabitRow>(
  habits: H[],
  day: string,
  eases?: HabitAdaptationRow[] | null,
): H[] {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return habits.filter((h) => {
    if (h.archived || !h.start_date || h.start_date > day) return false;
    if (h.end_date && h.end_date < day) return false;
    if (pausedOn(eases, h.id, day)) return false;
    if ((h.cadence ?? 'daily') === 'daily') return true;
    return Array.isArray(h.days_active) && h.days_active.some((d) => d === weekday);
  });
}

/** Why a todo due on the day is in its plan: "Due today", or "Due Monday" for another day. */
export function dueWords(day: string, today: string): string {
  return day === today ? 'Due today' : `Due ${weekdayOf(day)}`;
}

/**
 * The goal a todo is a step towards, when it is a step of a milestone set up
 * in their weekly review (lib/changes/week.ts marks it); null for any other.
 */
export function stepGoal(t: TodoRow | null | undefined): string | null {
  const goal = t?.views?.milestone?.goal;
  return typeof goal === 'string' && goal.trim() ? goal.trim() : null;
}

/**
 * Why a todo is on a day, in a few words: a step towards its goal, back from
 * being put off (Later), or due that day.
 */
export function todoDayWords(t: TodoRow | null | undefined, day: string, today: string): string {
  const goal = stepGoal(t);
  if (goal) return `A step towards ${goal}`;
  // a deadline on the day says Due today, before Back from Later
  if (t && !plannedDayOf(t) && !isTodoOn(t, day) && t.resurface_at === day)
    return 'Back from Later';
  return dueWords(day, today);
}
