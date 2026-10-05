/**
 * Putting a todo off for later: it leaves its day and comes back to them on
 * its back day. The back day goes in resurface_at, the day is cleared, and the
 * count of times it has been put off goes up by one, so once it has come back
 * twice its card can ask keep or let go. No reminder is set: a Later comes
 * back by its date, never by a notification of its own.
 *
 * This is the writer the weekly review's Later uses (the later change,
 * lib/changes/week.ts). The wrap up cards' own Later (lib/changes/sweep.ts)
 * still writes the day and a reminder; it moves to this writer when the old
 * sweep is retired.
 */
import { useGremlyStore } from '../store/useGremlyStore';

type Item = Record<string, any>;

/** The columns a Later writes, with the same columns as they were, for Undo. */
export function laterColumns(todo: Item, backOn: string): { patch: Item; before: Item } {
  const patch: Item = {
    resurface_at: backOn,
    due_day: null,
    due_date: null,
    scheduled_date: null,
    resurface_count: (todo.resurface_count ?? 0) + 1,
  };
  const before: Item = {};
  for (const k of Object.keys(patch)) before[k] = todo[k] ?? null;
  return { patch, before };
}

/** Put a todo off until a day, and hand back the write that puts it back as it was. */
export async function putOffTodo(todo: Item, backOn: string): Promise<() => Promise<void>> {
  const { patch, before } = laterColumns(todo, backOn);
  await (useGremlyStore.getState() as any).updateTodo(todo.id, patch);
  return async () => {
    await (useGremlyStore.getState() as any).updateTodo(todo.id, before);
  };
}
