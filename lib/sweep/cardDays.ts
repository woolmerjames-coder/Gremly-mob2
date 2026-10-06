/**
 * The days a card offers a todo: how full each already is, the day a todo
 * put off for Later comes back on, and when a card stops offering Later.
 *
 * - How full a day is, is the board's rule (workers/shared/habitWeek.js
 *   loadOn): the open todos due on it and the habits planned on it. The
 *   card's own todo is left out, so a day reads as what else is on it.
 * - Later is the weekly review's Later (lib/changes/later.ts): the todo
 *   leaves its day and comes back on a back day. The back day is the board's
 *   too (workers/shared/weekBoard.js): a day after the week being planned,
 *   the one with the fewest things already coming back, the earliest of
 *   those.
 * - A todo put off twice is no longer offered Later. When it comes back the
 *   second time its card asks keep or let go first, and Keep opens the days.
 *
 * All of it is decided by dates and counts, never by an item's words.
 */
import { useCallback, useMemo } from 'react';
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date';
import { useThisWeek } from '../week/thisWeek';
import { backDays, cycleOf, isDay, returnsCap, spreadReturns } from '../week/model';
import { loadOn } from '../week/habitWeek';
import { hoursLabel, shortDate, shortDay } from '../week/review/words';

type Item = Record<string, any>;

/** How many times a todo can be put off before its card asks keep or let go. */
export const PUSHES_BEFORE_ASK = 2;

const dayOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return isDay(s) ? s : null;
};

const pushes = (todo: Item | null | undefined): number =>
  Number.isInteger(todo?.resurface_count) ? (todo?.resurface_count as number) : 0;

/** Later is still offered: the todo has been put off fewer than twice. */
export function laterOffered(todo: Item | null | undefined): boolean {
  return pushes(todo) < PUSHES_BEFORE_ASK;
}

/**
 * The card asks keep or let go before anything else: a Later that has come
 * back (no day of its own, and its back day is here) after being put off
 * twice or more.
 */
export function asksKeepOrLetGo(todo: Item | null | undefined, today: string): boolean {
  if (!todo || laterOffered(todo)) return false;
  const back = dayOf(todo.resurface_at);
  return !dayOf(todo.due_day) && !!back && back <= today;
}

/** A day with how full it already is: "Tue · 6h". The name alone when that is not known. */
export function dayWithLoad(name: string, minutes: number | null | undefined): string {
  return Number.isFinite(minutes) ? `${name} · ${hoursLabel((minutes as number) / 60)}` : name;
}

/** "Tue 13 Oct" for a day picked on a card. */
export function pickedDayName(day: string): string {
  return `${shortDay(day)} ${shortDate(day)}`;
}

/** "Mon 12": the day a Later comes back, on its pill. */
export function backDayName(day: string): string {
  return `${shortDay(day)} ${Number(day.split('-')[2])}`;
}

/**
 * How full a day already is without one todo, in minutes. A habit that was
 * put away is on no day (as on the week's board), and one already logged on
 * the day is done with (as on Today and in the day's turn), so neither counts.
 * @param p.progress the habit logs (habit_progress rows)
 * @param p.without the card's own todo, left out of the count
 */
export function dayLoad(p: {
  day: string;
  todos: Item[];
  habits: Item[];
  plans: Item[];
  progress?: Item[];
  without?: string | null;
}): number {
  const todos = p.without ? p.todos.filter((t) => t.id !== p.without) : p.todos;
  const habits = p.habits.filter((h) => !h.archived);
  const done = new Set(
    (p.progress ?? []).filter((x) => x.occurred_day === p.day).map((x) => x.habit_id),
  );
  const plans = p.plans.filter((x) => !done.has(x.habit_id));
  return loadOn({ days: [p.day], todos, habits, plans }).get(p.day) ?? 0;
}

/**
 * The day a todo put off from a card comes back on, or null when no day is
 * open to come back on.
 */
export function laterBackDay(p: {
  todoId: string;
  today: string;
  weeklyDay: number;
  todos: Item[];
}): string | null {
  const days = backDays(p.today, cycleOf(p.today, p.weeklyDay).week_end);
  if (!days.length) return null;
  const open = new Set(days);
  // what is already coming back on each of those days
  const load = new Map<string, number>();
  let waiting = 0;
  for (const t of p.todos) {
    if (t.id === p.todoId || t.archived || t.completed_at || dayOf(t.due_day)) continue;
    const back = dayOf(t.resurface_at);
    if (!back || !open.has(back)) continue;
    load.set(back, (load.get(back) ?? 0) + 1);
    waiting += 1;
  }
  return (
    spreadReturns([{ id: p.todoId }], {
      days,
      load,
      cap: returnsCap(waiting + 1, days.length),
    }).get(p.todoId) ?? null
  );
}

/** What a card needs to know about days, from the stores. */
export interface CardDays {
  /** How full a day already is without this card's todo, in minutes */
  loadOn: (day: string, withoutTodoId?: string | null) => number;
  /** The day a todo put off from its card comes back on; null until their week is read */
  laterDay: (todoId: string) => string | null;
  /** The person's day */
  today: string;
}

/** The days for the cards on screen, following the stores. */
export function useCardDays(): CardDays {
  const todos = useGremlyStore((s: any) => s.todos) as Item[];
  const habits = useGremlyStore((s: any) => s.habits) as Item[];
  const plans = useGremlyStore((s: any) => s.habitPlans) as Item[];
  const progress = useGremlyStore((s: any) => s.habitProgress) as Item[];
  const weeklyDay = useThisWeek((w) => w.weeklyDay);
  // their weekly day decides which week a Later waits out: nothing is said of it until it is read
  const weekRead = useThisWeek((w) => w.loaded);
  const today = getDateService().ritualDay();
  const load = useCallback(
    (day: string, without?: string | null) =>
      dayLoad({
        day,
        todos: todos ?? [],
        habits: habits ?? [],
        plans: plans ?? [],
        progress: progress ?? [],
        without,
      }),
    [todos, habits, plans, progress],
  );
  const laterDay = useCallback(
    (todoId: string) =>
      weekRead ? laterBackDay({ todoId, today, weeklyDay, todos: todos ?? [] }) : null,
    [weekRead, today, weeklyDay, todos],
  );
  return useMemo(() => ({ loadOn: load, laterDay, today }), [load, laterDay, today]);
}
