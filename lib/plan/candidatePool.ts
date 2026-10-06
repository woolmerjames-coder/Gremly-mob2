/**
 * What can go in a plan (Daily brief in Chat): a data rule, never a model.
 *
 * In: todos due today (which includes anything kept from Sweep today, since
 * Sweep dates it today), habits on for today or behind this week, items
 * already on Today (an earlier plan gave them a time), the DCO's claims on today, and the
 * DCO's reach item. Never in: anything past its date and unsorted drops;
 * those belong to Sweep. Done and archived items are left out too.
 *
 * Order is the fallback priority if the picker cannot be reached: claims,
 * then what is already on Today, then the habits they planned for the day in
 * their week, then habits behind, then what is due, then the reach.
 *
 * Their week shows in the reasons: a habit they planned for the day says so,
 * a step of a milestone says what it is a step towards, and a todo back from
 * being put off (Later) says it is back.
 */

import type { Habit, Todo } from '../types';
import type { TimeBlockPreferences } from '../capacity/capacityTypes';
import { weeklyTarget } from '../brief/behind';
import type { DcoClaim, DcoReach } from '../brief/dco';
import { todoDayWords } from './dayItems';
import { weekdayOf } from '../wrapup/day';

/** Why a habit they planned for a day is in its plan: "Planned for today", or "Planned for Monday". */
export function plannedWords(day: string, today: string): string {
  return day === today ? 'Planned for today' : `Planned for ${weekdayOf(day)}`;
}

export type CandidateKind = 'todo' | 'habit' | 'reach';
export type CandidateSource = 'claim' | 'today' | 'planned' | 'behind' | 'due' | 'habit' | 'reach';

export interface Candidate {
  id: string;
  kind: CandidateKind;
  title: string;
  /** time_estimate_minutes, when it has one */
  minutes: number | null;
  /** Why it is a candidate, in a few words (the picker's reason starts here) */
  why: string;
  /** Its usual time of day, from time_window, in minutes from midnight */
  window: [number, number] | null;
  source: CandidateSource;
  /** A reach that is a fact, not a todo: it becomes a todo at Lock it in */
  fromFact?: boolean;
}

export interface PoolInput {
  today: string;
  todosDueToday: Todo[];
  habitsDueToday: Habit[];
  /** Every active todo and habit, for claims, what is on Today and behind */
  todos: Todo[];
  habits: Habit[];
  /** Completions this week (Monday on), by habit id */
  doneThisWeek: Map<string, number>;
  /** Habits already done today */
  doneToday: Set<string>;
  /** Todos and habits an earlier plan already gave a time on this day */
  placedIds: Set<string>;
  /** 1 on Monday to 7 on Sunday */
  daysGone: number;
  claims: DcoClaim[];
  reach: DcoReach | null;
  blocks: TimeBlockPreferences;
  /** False when planning another day (tomorrow): what is on Today now is left out */
  forToday?: boolean;
  /** The habits they planned for this day in their week (habit_plans), by id */
  plannedHabits?: Set<string>;
  /** The real today, when the pool is for another day; the pool's own day when left out */
  realToday?: string;
}

function titleOf(item: Todo | Habit): string {
  return (item as Todo).name || (item as Todo).title || 'Untitled';
}

export function windowFor(
  timeWindow: string | null | undefined,
  blocks: TimeBlockPreferences,
): [number, number] | null {
  if (timeWindow === 'morning' || timeWindow === 'day' || timeWindow === 'evening') {
    const b = blocks[timeWindow];
    return [b.startHour * 60, b.endHour * 60];
  }
  return null;
}

/**
 * Open todos that are not past their date. One with no day is in only when it
 * is already on Today, or was put off (Later) and comes back on this day: a
 * Later has no day of its own, so its day to come back is what puts it here.
 */
function plannableTodo(t: Todo, input: PoolInput): boolean {
  if (t.archived || t.completed_at) return false;
  if (t.due_day && t.due_day < input.today) return false;
  if (!t.due_day) {
    const backToday = (t as { resurface_at?: string | null }).resurface_at === input.today;
    if (!backToday && !input.placedIds.has(t.id)) return false;
  }
  return true;
}

function plannableHabit(h: Habit, input: PoolInput): boolean {
  if (h.archived) return false;
  if ((h.subtype as string | undefined) === 'break_habit') return false;
  if (input.doneToday.has(h.id)) return false;
  if (h.start_date && h.start_date > input.today) return false;
  if (h.end_date && h.end_date < input.today) return false;
  return true;
}

export function buildCandidatePool(input: PoolInput): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const todoById = new Map(input.todos.map((t) => [t.id, t]));
  const habitById = new Map(input.habits.map((h) => [h.id, h]));

  const addTodo = (t: Todo, why: string, source: CandidateSource) => {
    if (seen.has(t.id) || !plannableTodo(t, input)) return;
    seen.add(t.id);
    out.push({
      id: t.id,
      kind: 'todo',
      title: titleOf(t),
      minutes:
        t.time_estimate_minutes && t.time_estimate_minutes > 0 ? t.time_estimate_minutes : null,
      why,
      window: windowFor(t.time_window, input.blocks),
      source,
    });
  };
  const addHabit = (h: Habit, why: string, source: CandidateSource) => {
    if (seen.has(h.id) || !plannableHabit(h, input)) return;
    seen.add(h.id);
    out.push({
      id: h.id,
      kind: 'habit',
      title: titleOf(h),
      minutes:
        h.time_estimate_minutes && h.time_estimate_minutes > 0 ? h.time_estimate_minutes : null,
      why,
      window: windowFor(h.time_window, input.blocks),
      source,
    });
  };
  const weekLine = (h: Habit) => {
    const target = weeklyTarget(h);
    return target ? `${input.doneThisWeek.get(h.id) ?? 0} of ${target} this week` : 'On for today';
  };
  const behind = (h: Habit) => {
    const target = weeklyTarget(h);
    if (!target) return false;
    return (input.doneThisWeek.get(h.id) ?? 0) < Math.floor((target * input.daysGone) / 7);
  };

  // 1. The DCO's claims on today
  for (const c of input.claims) {
    if (c.type === 'todo') {
      const t = todoById.get(c.id);
      if (t) addTodo(t, c.why || 'Matters today', 'claim');
    } else if (c.type === 'habit') {
      const h = habitById.get(c.id);
      if (h) addHabit(h, c.why || 'Matters today', 'claim');
    }
  }
  // 2. Already on Today
  if (input.forToday !== false) {
    // what an earlier plan gave a time today (this morning's, or last night's for today)
    for (const t of input.todos) if (input.placedIds.has(t.id)) addTodo(t, 'On Today', 'today');
    for (const h of input.habits) if (input.placedIds.has(h.id)) addHabit(h, 'On Today', 'today');
  }
  // 3. The habits they planned for this day in their week
  if (input.plannedHabits?.size) {
    const words = plannedWords(input.today, input.realToday ?? input.today);
    for (const h of input.habits) {
      if (input.plannedHabits.has(h.id)) addHabit(h, words, 'planned');
    }
  }
  // 4. Habits behind this week
  for (const h of input.habits) if (behind(h)) addHabit(h, `${weekLine(h)}, behind`, 'behind');
  // 5. Due on the day
  for (const t of input.todosDueToday) {
    addTodo(t, todoDayWords(t, input.today, input.realToday ?? input.today), 'due');
  }
  for (const h of input.habitsDueToday) addHabit(h, weekLine(h), 'habit');
  // 6. The reach: a todo joins as it is, a fact as a suggestion
  const r = input.reach;
  if (r && r.id && !seen.has(r.id)) {
    const asTodo = r.type === 'todo' ? todoById.get(r.id) : undefined;
    if (asTodo) {
      if (!asTodo.archived && !asTodo.completed_at) {
        seen.add(asTodo.id);
        out.push({
          id: asTodo.id,
          kind: 'todo',
          title: titleOf(asTodo),
          minutes: asTodo.time_estimate_minutes || null,
          why: r.why,
          window: windowFor(asTodo.time_window, input.blocks),
          source: 'reach',
        });
      }
    } else if (r.type !== 'todo' && r.type !== 'habit') {
      seen.add(r.id);
      out.push({
        id: r.id,
        kind: 'reach',
        title: r.title || r.statement || 'Suggestion',
        minutes: null,
        why: r.why,
        window: null,
        source: 'reach',
        fromFact: true,
      });
    }
  }
  return out;
}
