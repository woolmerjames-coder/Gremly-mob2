/**
 * The day in counts, for Gremly's opening card in the evening wrap up: what
 * was finished, how many meetings there were, how much was dropped, and how
 * today's plan went. Worked out in code from the app's own data, so nothing
 * here is written by a model. Pure, so it can be tested.
 */
import type { PlanItem, SweepRecapMeta } from '../brief/types';

type Row = Record<string, any>;

export interface RecapInput {
  /** The person's day being wrapped up */
  day: string;
  /** When that day started for them (their day end hour on that date), as a time in ms */
  dayStartMs: number;
  todos: Row[];
  habits: Row[];
  habitProgress: { habit_id: string; occurred_day: string }[];
  notes: Row[];
  /** Meetings on the day, cancelled ones left out */
  meetings: number;
  /** Today's plan, when one was put on Today */
  plan: PlanItem[] | null;
}

const MOST_LISTED = 12;

const since = (iso: unknown, ms: number) => typeof iso === 'string' && Date.parse(iso) >= ms;
const titleOf = (r: Row) => String(r.name || r.title || 'Untitled').trim();

export function recapFrom(i: RecapInput): Omit<SweepRecapMeta, 'type'> {
  const todosDone = i.todos.filter((t) => !t.archived && since(t.completed_at, i.dayStartMs));
  const loggedIds = new Set(
    i.habitProgress.filter((p) => p.occurred_day === i.day).map((p) => p.habit_id),
  );
  const habitsDone = i.habits.filter((h) => !h.archived && loggedIds.has(h.id));

  // what was dropped today: anything made since their day started, calendar entries left out
  const dropped =
    i.todos.filter((t) => !t.archived && since(t.created_at, i.dayStartMs)).length +
    i.habits.filter((h) => !h.archived && since(h.created_at, i.dayStartMs)).length +
    i.notes.filter(
      (n) =>
        !n.archived &&
        since(n.created_at, i.dayStartMs) &&
        !(n.subtype === 'event' && n.external_source),
    ).length;

  let planned: SweepRecapMeta['planned'] = null;
  const missed: SweepRecapMeta['missed'] = [];
  const items = (i.plan ?? []).filter((p) => p.kind === 'todo' || p.kind === 'habit');
  if (items.length) {
    let done = 0;
    for (const p of items) {
      if (p.kind === 'habit') {
        if (loggedIds.has(p.id)) done += 1;
        continue;
      }
      const todo = i.todos.find((t) => t.id === p.id);
      if (todo?.completed_at) done += 1;
      // gone since (archived, removed) is neither done nor missed
      else if (todo && !todo.archived) missed.push({ id: p.id, title: titleOf(todo) });
    }
    planned = { done, total: items.length };
  }

  return {
    date: i.day,
    counts: {
      todos: todosDone.length,
      habits: habitsDone.length,
      meetings: i.meetings,
      drops: dropped,
    },
    done: [
      ...todosDone.map((t) => ({ title: titleOf(t), kind: 'todo' as const })),
      ...habitsDone.map((h) => ({ title: titleOf(h), kind: 'habit' as const })),
    ].slice(0, MOST_LISTED),
    missed,
    planned,
  };
}
