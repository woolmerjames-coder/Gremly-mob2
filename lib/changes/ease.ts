/**
 * A habit's pause, lighter version or return to usual, from a change card
 * (the change model's ease; the rules are workers/shared/habitWeek.js).
 *
 * It is all or nothing, and Undo puts everything back as it was. A pause
 * also takes the habit off the days it was planned on in the stretch, since a
 * paused habit is left alone: those days come back with Undo.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { easesFrom } from '../week/habitWeek';
import type { Change } from './model';

type Item = Record<string, any>;

export type EaseOutcome =
  | { ok: true; revert: () => Promise<void> }
  | { ok: false; reason: 'stale' | 'gone' | 'failed'; message: string };

function store(): any {
  return useGremlyStore.getState();
}

/** The pauses and lighter versions a habit has from a day on, as a card states them. */
export function easesNow(habitId: string, today: string) {
  const rows = (store().habitAdaptations ?? []).filter((a: Item) => a.habit_id === habitId);
  return easesFrom(rows, today).map((e) => ({
    mode: e.mode,
    first: e.first,
    last: e.last,
    note: e.note,
  }));
}

/** Pauses and lighter versions as one line to compare, whatever order their fields come in. */
const sig = (list: Item[]): string =>
  list.map((e) => [e.mode, e.first, e.last, e.note ?? ''].join('|')).join('\n');

/** Apply a habit's ease. Throws when a write fails; applyChanges reports it. */
export async function applyEase(change: Change): Promise<EaseOutcome> {
  const id = change.id as string;
  const ease = change.ease;
  if (!ease) throw new Error('The change says no pause or lighter version.');
  if (!(store().habits ?? []).some((h: Item) => h.id === id && !h.archived)) {
    return { ok: false, reason: 'gone', message: 'That habit is no longer here.' };
  }
  const today = getDateService().today();
  const stale: EaseOutcome = {
    ok: false,
    reason: 'stale',
    message: `${change.title} changed since, so it was left as it is.`,
  };
  // A card accepted after its days have gone has nothing left to do, and one
  // accepted part way through acts from today: a day already gone is never
  // paused or set back, and nothing planned on one is taken away.
  if (ease.last < today) return stale;
  const first = ease.first < today ? today : ease.first;
  // What the card was offered against: a pause or lighter version made or
  // ended since is theirs. Compared a field at a time, since a card comes
  // back from where it is kept with its fields in another order; and what
  // ran out on its own since the card was made is no change of theirs.
  const was = change.before?.eases;
  if (was && sig(was.filter((w: Item) => w.last >= today)) !== sig(easesNow(id, today))) {
    return stale;
  }
  const back = await store().easeHabit(id, {
    mode: ease.mode,
    first,
    last: ease.last,
    note: ease.note,
  });
  if (ease.mode !== 'pause') return { ok: true, revert: async () => void (await back?.()) };

  // paused, it is off the days it was planned on in the stretch
  const planned = (): string[] =>
    (store().habitPlans ?? [])
      .filter(
        (p: Item) =>
          p.habit_id === id &&
          (!p.status || p.status === 'planned') &&
          p.planned_date >= first &&
          p.planned_date <= ease.last,
      )
      .map((p: Item) => p.planned_date as string);
  const days = planned();
  for (const d of days) await store().removeHabitPlan(id, d);
  // the store's plan writers put their own change back when the save fails
  // and do not throw, so what was saved is read back rather than assumed
  const left = new Set(planned());
  const removed = days.filter((d) => !left.has(d));
  const undo = async () => {
    for (const d of removed) await store().setHabitPlan(id, d);
    await back?.();
  };
  if (removed.length !== days.length) {
    await undo();
    return {
      ok: false,
      reason: 'failed',
      message: `${change.title}'s days could not be taken off, so it was not paused.`,
    };
  }
  return { ok: true, revert: undo };
}
