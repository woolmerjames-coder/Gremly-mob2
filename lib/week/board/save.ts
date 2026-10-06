/**
 * Saving the week's board. Nothing on the board is written until they finish
 * the review, or tap Done on the board once the week is planned. Then what
 * differs from what is saved (lib/week/board/model.ts boardDiff) is written
 * in one go, with one Undo for all of it:
 *
 * - a todo on a day: its day, through the change model's own columns, so the
 *   two dates that follow the day agree and its day to come back is cleared;
 *   when it already had a day, being moved is counted
 * - a todo put off: lib/changes/later.ts, the one writer of a Later
 * - a habit's days: the store's setHabitPlan and removeHabitPlan
 *
 * These are the person's own moves, made with their own hands on the board,
 * so nothing here goes on a card first. A write that fails is counted and
 * said, never claimed.
 */
import { useGremlyStore } from '../../store/useGremlyStore';
import { recordEntry } from '../../chat/changeHistory';
import { nameLookup } from '../../changes/apply';
import { historyLines } from '../../changes/history';
import { putOffTodo } from '../../changes/later';
import { writeFor } from '../../changes/patch';
import type { BoardDiff } from './model';

type Item = Record<string, any>;
type Undo = () => Promise<void>;

/** How many todos are written at once. */
const LANES = 5;

export interface BoardSaved {
  /** Todos put on a day, todos put off, and habit days added or taken away */
  todos: number;
  later: number;
  habitDays: number;
  /** Writes that did not go through */
  failed: number;
  /** Put everything that was written back as it was */
  revert: Undo;
}

function store(): any {
  return useGremlyStore.getState();
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

async function inLanes<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(LANES, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await work(item);
      }
    }),
  );
}

/**
 * Put a todo on a day and hand back the write that puts it back as it was.
 * The move goes in the todo's own history, as a move made in today's thread.
 */
export async function placeTodo(todo: Item, day: string): Promise<Undo> {
  // the day's columns, and the day it was to come back on cleared (writeFor)
  const w = writeFor('todo', todo, { day });
  const hadDay = !!todo.due_day;
  const marks: Item = {};
  const marksBefore: Item = {};
  if (hadDay) {
    marks.sweep_reschedule_count = (todo.sweep_reschedule_count ?? 0) + 1;
    marksBefore.sweep_reschedule_count = todo.sweep_reschedule_count ?? 0;
  }
  let views: unknown = todo.views;
  const undos: Array<(current: unknown) => Record<string, unknown>> = [];
  for (const line of historyLines('todo', todo, { day }, nameLookup())) {
    const r = recordEntry(views, line, 'thread', todo.body);
    views = r.views;
    undos.push(r.undo);
  }
  const withViews = undos.length > 0;
  await store().updateTodo(todo.id, {
    ...w.patch,
    ...marks,
    ...(withViews ? { views: asObject(views) } : {}),
  });
  return async () => {
    const now = (store().todos ?? []).find((t: Item) => t.id === todo.id) as Item | undefined;
    let current: unknown = now?.views ?? views;
    for (const undo of [...undos].reverse()) current = undo(current);
    await store().updateTodo(todo.id, {
      ...w.undo,
      ...marksBefore,
      ...(withViews ? { views: asObject(current) } : {}),
    });
  };
}

/** The days saved for a habit, as the store has them now. */
function planned(habitId: string): Set<string> {
  return new Set(
    (store().habitPlans ?? [])
      .filter((p: Item) => p.habit_id === habitId)
      .map((p: Item) => String(p.planned_date).slice(0, 10)),
  );
}

/** Write what the board changed, and hand back one Undo for all of it. */
export async function saveBoard(diff: BoardDiff): Promise<BoardSaved> {
  const undos: Undo[] = [];
  let todos = 0;
  let later = 0;
  let habitDays = 0;
  let failed = 0;
  const open = (id: string): Item | null => {
    const t = (store().todos ?? []).find((x: Item) => x.id === id) as Item | undefined;
    // done or archived in the moment since: it is no longer the board's to move
    return t && !t.archived && !t.completed_at ? t : null;
  };

  await inLanes(diff.place, async (p) => {
    const todo = open(p.id);
    if (!todo) return;
    try {
      undos.push(await placeTodo(todo, p.day));
      todos += 1;
    } catch (err) {
      failed += 1;
      console.warn('[Week] a todo could not be put on its day:', p.id, err);
    }
  });
  await inLanes(diff.later, async (l) => {
    const todo = open(l.id);
    if (!todo) return;
    try {
      undos.push(await putOffTodo(todo, l.backOn));
      later += 1;
    } catch (err) {
      failed += 1;
      console.warn('[Week] a todo could not be put off:', l.id, err);
    }
  });
  // The store's habit writers put their own change back when a save fails and
  // do not throw, so what was saved is read back rather than assumed.
  for (const h of diff.habits) {
    for (const d of h.remove) {
      await store().removeHabitPlan(h.id, d);
      if (planned(h.id).has(d)) failed += 1;
      else {
        habitDays += 1;
        undos.push(() => store().setHabitPlan(h.id, d));
      }
    }
    for (const d of h.add) {
      await store().setHabitPlan(h.id, d);
      if (!planned(h.id).has(d)) failed += 1;
      else {
        habitDays += 1;
        undos.push(() => store().removeHabitPlan(h.id, d));
      }
    }
  }

  return {
    todos,
    later,
    habitDays,
    failed,
    revert: async () => {
      let lost = 0;
      await inLanes([...undos].reverse(), async (undo) => {
        try {
          await undo();
        } catch (err) {
          lost += 1;
          console.warn('[Week] part of the week could not be put back:', err);
        }
      });
      if (lost) throw new Error(`${lost} of the week's changes could not be put back.`);
    },
  };
}
