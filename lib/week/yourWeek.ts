/**
 * Your week: the week they planned, read back. The intention and what matters
 * most as the review kept them, each day with what was planned for it and how
 * it went, and what is waiting in Later.
 *
 * What was planned comes from the plan kept when the board was saved (the
 * week's row, answers.planned.days). How it went comes from the items as they
 * are now: a todo done, still open on its day, moved to another day, put off
 * or let go; a habit done on its day or not. A habit paused on a day is not
 * on it, planned or not, unless it was done all the same. A day also shows what is on it
 * now that was not in its plan (added, or moved there since), and what was
 * done on it besides.
 *
 * Pure: dates, ids and numbers only.
 */
import type { WeekReviewRow } from '../repo/weekReviewRepo';
import { addDays, isDay, spanDays } from './model';
import { pausedOn } from './habitWeek';

type Item = Record<string, any>;

/**
 * How a todo stands against the day it is shown on: done; open, on this day;
 * moved, to another day (to); later, put off until a day (to), or on no day
 * at all (to is null); let go; back, put off until this day, which has come
 * or is coming, so it is on Today then with no day of its own.
 */
export type WeekTodoState = 'done' | 'open' | 'moved' | 'later' | 'let_go' | 'back';

export interface WeekTodoRow {
  id: string;
  title: string;
  state: WeekTodoState;
  /** It was in the plan for this day */
  planned: boolean;
  /** Moved: the day it is on now. Later: the day it comes back, or null. */
  to: string | null;
}

export interface WeekHabitRow {
  id: string;
  title: string;
  done: boolean;
  /** It has this day: in the plan, or given the day since */
  planned: boolean;
}

export interface WeekDayView {
  day: string;
  when: 'past' | 'today' | 'ahead';
  todos: WeekTodoRow[];
  habits: WeekHabitRow[];
  /** How much was planned for the day; null when no plan was kept for it */
  planned: number | null;
  /** How much of what was planned is done */
  done: number;
  /** Done on the day without being in its plan */
  alsoDone: number;
}

export interface YourWeek {
  first: string;
  last: string;
  intention: string | null;
  priorities: string[];
  days: WeekDayView[];
  /** What is put off: how many, and the first day one comes back */
  later: { count: number; next: string | null };
}

export interface YourWeekInput {
  today: string;
  row: Pick<WeekReviewRow, 'week_start' | 'answers'>;
  todos: Item[];
  habits: Item[];
  habitPlans: Item[];
  habitProgress: Item[];
  /** Their habits' pauses and lighter versions (habit_adaptations) */
  eases?: Item[];
  /** The person's day a moment fell on (DateService dayOf) */
  dayOf: (timestamp: string) => string | null;
}

const dayPart = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return isDay(s) ? s : null;
};

export function yourWeekOf(p: YourWeekInput): YourWeek {
  const first = p.row.week_start;
  const last = addDays(first, 6);
  const days = spanDays(first, last);
  const answers = p.row.answers ?? {};
  const plan = answers.planned?.days ?? null;

  const todoOf = new Map<string, Item>(p.todos.map((t) => [t.id, t]));
  const habitOf = new Map<string, Item>(p.habits.filter((h) => !h.archived).map((h) => [h.id, h]));
  // A todo planned for more than one day (the week planned again, or changed
  // by hand) belongs to the last of them: the earlier ones say where it went.
  const home = new Map<string, string>();
  for (const day of days) for (const id of plan?.[day]?.todos ?? []) home.set(id, day);

  const doneDay = (t: Item) => (t.completed_at ? p.dayOf(t.completed_at) : null);
  const titleOf = (x: Item, fallback: string) => String(x.name || x.title || fallback);

  const view = (day: string): WeekDayView => {
    const todos: WeekTodoRow[] = [];
    const inPlan = plan?.[day] ?? null;
    for (const id of inPlan?.todos ?? []) {
      const t = todoOf.get(id);
      // deleted since: there is nothing left to show
      if (!t) continue;
      const row = { id, title: titleOf(t, 'Untitled'), planned: true };
      const at = home.get(id) as string;
      const due = dayPart(t.due_day);
      if (at !== day) todos.push({ ...row, state: 'moved', to: at });
      else if (t.completed_at) todos.push({ ...row, state: 'done', to: null });
      else if (t.archived) todos.push({ ...row, state: 'let_go', to: null });
      else if (due === day) todos.push({ ...row, state: 'open', to: null });
      else if (due) todos.push({ ...row, state: 'moved', to: due });
      else todos.push({ ...row, state: 'later', to: dayPart(t.resurface_at) });
    }
    // on the day now without being in its plan, then done on it besides
    const besides: WeekTodoRow[] = [];
    for (const t of p.todos) {
      if (t.archived || home.get(t.id) === day) continue;
      const row = { id: t.id, title: titleOf(t, 'Untitled'), planned: false, to: null };
      if (!t.completed_at) {
        if (dayPart(t.due_day) === day) todos.push({ ...row, state: 'open' });
        // put off until this day: it comes back to them on it (today or still ahead)
        else if (!dayPart(t.due_day) && day >= p.today && dayPart(t.resurface_at) === day) {
          todos.push({ ...row, state: 'back' });
        }
      } else if (!home.has(t.id) && doneDay(t) === day) besides.push({ ...row, state: 'done' });
    }
    todos.push(...besides);

    const done = new Set(
      p.habitProgress
        .filter((x) => dayPart(x.occurred_day) === day && (x.count ?? 1) > 0)
        .map((x) => x.habit_id as string),
    );
    // paused on the day, it is left alone: the day is not its day any more
    const given = new Set(
      [
        ...(inPlan?.habits ?? []),
        ...p.habitPlans.filter((x) => dayPart(x.planned_date) === day).map((x) => x.habit_id),
      ].filter((id) => !pausedOn(p.eases, id, day)),
    );
    const habits: WeekHabitRow[] = [...new Set([...given, ...done])]
      .filter((id) => habitOf.has(id))
      .map((id) => ({
        id,
        title: titleOf(habitOf.get(id) as Item, 'Habit'),
        done: done.has(id),
        planned: given.has(id),
      }))
      .sort((a, b) => Number(b.planned) - Number(a.planned) || a.title.localeCompare(b.title));

    const plannedTodos = todos.filter((t) => t.planned);
    const plannedHabits = habits.filter((h) => h.planned);
    return {
      day,
      when: day < p.today ? 'past' : day === p.today ? 'today' : 'ahead',
      todos,
      habits,
      planned: inPlan ? plannedTodos.length + plannedHabits.length : null,
      done:
        plannedTodos.filter((t) => t.state === 'done').length +
        plannedHabits.filter((h) => h.done).length,
      alsoDone: besides.length + habits.filter((h) => !h.planned && h.done).length,
    };
  };

  const waiting = p.todos
    .filter((t) => !t.archived && !t.completed_at && !dayPart(t.due_day))
    .map((t) => dayPart(t.resurface_at))
    .filter((d): d is string => !!d && d > p.today)
    .sort();

  return {
    first,
    last,
    intention: (answers.intention ?? '').trim() || null,
    priorities: (answers.priorities ?? []).map((x) => x.text).filter(Boolean),
    days: days.map(view),
    later: { count: waiting.length, next: waiting[0] ?? null },
  };
}
