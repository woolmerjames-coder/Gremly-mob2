/**
 * What the pick sheet lists (components/brief/PickSheet.tsx): the day's todos
 * and habits as rows with a length, and how much of the free time the picks
 * take. Worked out from data, never a model.
 */

import type { Habit, Todo } from '../types';
import type { HabitWeek } from '../brief/useDayCard';
import { duration } from './planFlow';

export type PickTab = 'todos' | 'habits';

// the tab the pick sheet was last left on, so it opens where they were
let pickTab: PickTab = 'todos';
export const lastPickTab = (): PickTab => pickTab;
export function rememberPickTab(t: PickTab): void {
  pickTab = t;
}

/** A length for something with none, so the time left still adds up */
export const DEFAULT_PICK_MINUTES = 30;

export interface PickItem {
  id: string;
  kind: 'todo' | 'habit';
  title: string;
  minutes: number;
  /** No length of its own: the default stands in */
  estimated: boolean;
  /** The line under the title */
  meta: string;
  behind: boolean;
}

export interface PickSource {
  todosDue: Todo[];
  habitsToday: Habit[];
  behind: Habit[];
  habitWeeks: HabitWeek[];
}

function lengthOf(m: number | null | undefined): { minutes: number; estimated: boolean } {
  return m && m > 0
    ? { minutes: m, estimated: false }
    : { minutes: DEFAULT_PICK_MINUTES, estimated: true };
}

const lengthWords = (l: { minutes: number; estimated: boolean }) =>
  l.estimated ? `About ${duration(l.minutes)}` : duration(l.minutes);

/** The day's todos and habits as rows; habits behind for the week first. */
export function pickItemsOf(
  data: PickSource,
  /** "Due today", "Due Monday" (lib/plan/dayItems.ts dueWords) */
  dueLabel: string,
): { todos: PickItem[]; habits: PickItem[] } {
  const todos = data.todosDue.map((t): PickItem => {
    const l = lengthOf(t.time_estimate_minutes);
    return {
      id: t.id,
      kind: 'todo',
      title: t.name || t.title || 'Untitled',
      ...l,
      meta: `${lengthWords(l)}, ${dueLabel.charAt(0).toLowerCase()}${dueLabel.slice(1)}`,
      behind: false,
    };
  });
  const weekOf = new Map(data.habitWeeks.map((w) => [w.habit.id, w]));
  const behindIds = new Set(data.behind.map((h) => h.id));
  const habits = [
    ...data.behind.filter((h) => !data.habitsToday.some((x) => x.id === h.id)),
    ...data.habitsToday,
  ]
    .map((h): PickItem => {
      const l = lengthOf(h.time_estimate_minutes);
      const w = weekOf.get(h.id);
      const week = w && w.target ? `, ${w.done} of ${w.target} this week` : ', daily';
      return {
        id: h.id,
        kind: 'habit',
        title: h.name || 'Untitled habit',
        ...l,
        meta: `${lengthWords(l)}${week}`,
        behind: behindIds.has(h.id),
      };
    })
    .sort((a, b) => Number(b.behind) - Number(a.behind));
  return { todos, habits };
}

/** "1h 30m picked, 45m left", or what it runs over by. */
export function timeLeftWords(
  free: number,
  picked: number,
): { picked: string; left: string; over: boolean } {
  const left = free - picked;
  return {
    picked: picked ? `${duration(picked)} picked` : 'Nothing picked yet',
    left: left >= 0 ? `${duration(left)} left` : `${duration(-left)} over`,
    over: left < 0,
  };
}

/** The pick sheet's button: "Add 3, 1h 30m" */
export function pickButtonWords(verb: string, n: number, minutes: number): string {
  return `${verb} ${n}, ${duration(minutes)}`;
}
