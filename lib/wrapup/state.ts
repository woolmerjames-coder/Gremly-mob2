/**
 * Tonight's wrap up as today's thread keeps it (DailyThreadMeta.sweep): where
 * it has got to, the cards there were, and every decision in the change
 * model's shape. These are the pure steps on that state; the session
 * (session.ts) holds it while the app is open and saves it to the thread.
 */
import type { WrapStep, WrapUpState } from '../brief/types';
import type { SweepRecord } from '../changes/sweep';

export function newWrapState(
  at: string,
  cardIds: string[],
  path: WrapUpState['path'] = null,
): WrapUpState {
  return {
    started_at: at,
    step: 'offer',
    path,
    items: [...cardIds],
    decisions: [],
    credited: 0,
    journal: null,
    questions: [],
    finished_at: null,
  };
}

/** A decision made on a card. One made again on the same item replaces the earlier one. */
export function withDecision(state: WrapUpState, record: SweepRecord): WrapUpState {
  return {
    ...state,
    decisions: [...state.decisions.filter((d) => d.id !== record.id), record],
  };
}

/** A decision put back with its Undo. */
export function withUndone(state: WrapUpState, cid: string, at: string): WrapUpState {
  return {
    ...state,
    decisions: state.decisions.map((d) => (d.cid === cid ? { ...d, undone_at: at } : d)),
  };
}

export function atStep(state: WrapUpState, step: WrapStep): WrapUpState {
  return { ...state, step };
}

/** Items with a decision that still stands (kept, let go, or left for next time). */
export function settledIds(state: WrapUpState | null | undefined): Set<string> {
  return new Set((state?.decisions ?? []).filter((d) => !d.undone_at).map((d) => d.id));
}

/** Items kept or let go tonight: what the questions must not ask about again. */
export function decidedIds(state: WrapUpState | null | undefined): Set<string> {
  return new Set(
    (state?.decisions ?? []).filter((d) => !d.undone_at && d.out !== 'left').map((d) => d.id),
  );
}

/** The cards still to sort tonight: Sweep's cards now, without the ones settled tonight. */
export function cardsLeft<T extends { candidate: { id: string } }>(
  state: WrapUpState | null | undefined,
  cards: T[],
): T[] {
  const settled = settledIds(state);
  return cards.filter((c) => !settled.has(c.candidate.id));
}

/**
 * Cards that turned up after the wrap up began: not among the cards it
 * started with (or was later told about) and not settled.
 */
export function newSince<T extends { candidate: { id: string } }>(
  state: WrapUpState,
  cards: T[],
): T[] {
  const known = new Set(state.items);
  return cardsLeft(state, cards).filter((c) => !known.has(c.candidate.id));
}

/** The cards phase is over: every path through it ends here (sorted, left, moved on, or none). */
export function pastCards(state: WrapUpState | null | undefined): boolean {
  if (!state) return false;
  return !['offer', 'cards', 'partial', 'declined'].includes(state.step);
}

/** Todos kept for a given day tonight, by title: what the close says is lined up. */
export function keptFor(state: WrapUpState | null | undefined, day: string): string[] {
  return (state?.decisions ?? [])
    .filter((d) => !d.undone_at && d.out === 'kept' && d.type === 'todo' && d.fields?.day === day)
    .map((d) => d.title);
}
