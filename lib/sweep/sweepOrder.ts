/**
 * The order Sweep asks in, and how a card reads once an earlier answer in the
 * same Sweep has changed things.
 *
 * Cards with a question come first. "Is this one you already have?" can move,
 * rename, finish, merge or remove another item, and a clarification decides
 * what the drop itself is, so both are settled before anything else is
 * swept: nobody sorts a card that a later answer would change. Then todos,
 * events and notes, as before.
 *
 * Sweep works from a snapshot taken when it opens, so a card further on can
 * be out of date by the time it comes up. sweepCardNow gives the card as its
 * item is now, and goneSinceStart says when an answer cleared the item, so
 * its card is passed over.
 */
import { isRelationPending } from '../minddrop/dropRelation';
import { computeSweepCardMeta } from './computeSweepCardMeta';
import type { SweepCandidate, SweepCardMeta } from './types';

type Card = { candidate: SweepCandidate; meta: SweepCardMeta };
type Fields = Record<string, unknown> & { views?: Record<string, unknown> | null };

/** The question a card asks before it can be swept, if any. */
export function sweepCardAsks(c: SweepCandidate): 'relation' | 'clarify' | null {
  const raw = (c.raw ?? {}) as Fields;
  const views = (raw.views ?? {}) as Record<string, unknown>;
  if (c.kind === 'note' && isRelationPending(views)) return 'relation';
  const needs = views.needs_clarification === true || raw.needs_clarification === true;
  const resolved = views.clarification_resolved === true || raw.clarification_resolved === true;
  return needs && !resolved ? 'clarify' : null;
}

/**
 * Questions first ("is this one you already have?" before a clarification,
 * since its answer can change other cards), then todos, events and notes.
 * Order within each group is kept.
 */
export function orderSweepCards<T extends Card>(cards: T[]): T[] {
  const asks = cards.map((c) => sweepCardAsks(c.candidate));
  const rest = cards.filter((_, i) => !asks[i]);
  return [
    ...cards.filter((_, i) => asks[i] === 'relation'),
    ...cards.filter((_, i) => asks[i] === 'clarify'),
    ...rest.filter((c) => c.candidate.kind === 'todo'),
    ...rest.filter((c) => c.candidate.kind === 'note' && c.meta.noteCardType === 'event'),
    ...rest.filter((c) => c.candidate.kind === 'note' && c.meta.noteCardType !== 'event'),
  ];
}

type Lists = {
  todos: ReadonlyArray<{ id: string }>;
  notes: ReadonlyArray<{ id: string }>;
  habits: ReadonlyArray<{ id: string }>;
};

/** The card's item as it is in the store now, or null when it is not there. */
export function entityNow(c: SweepCandidate, lists: Lists): Fields | null {
  const list = c.kind === 'todo' ? lists.todos : c.kind === 'habit' ? lists.habits : lists.notes;
  return (list.find((x) => x.id === c.id) as Fields | undefined) ?? null;
}

/** Cleared since Sweep opened (archived, or a todo ticked off): its card is passed over. */
export function goneSinceStart(c: SweepCandidate, lists: Lists): boolean {
  // only what can be seen to have been cleared; an item not in the store is left alone
  const now = entityNow(c, lists);
  if (!now) return false;
  if (now.archived === true) return true;
  return c.kind === 'todo' && !!now.completed_at;
}

/**
 * The card as its item is now. `live` is the store's own candidate list, which
 * has the fresh card and meta; an item that is no longer a candidate (a todo
 * moved to a later day) keeps its place in this Sweep with its fresh details.
 */
export function sweepCardNow<T extends Card>(
  base: T,
  live: ReadonlyArray<Card>,
  entity: Fields | null,
): T {
  const fresh = live.find((c) => c.candidate.id === base.candidate.id);
  if (fresh) {
    return fresh.candidate.raw === base.candidate.raw
      ? base
      : { ...base, candidate: fresh.candidate, meta: fresh.meta };
  }
  if (!entity || entity === base.candidate.raw) return base;
  const candidate = { ...base.candidate, raw: entity } as SweepCandidate;
  return {
    ...base,
    candidate,
    meta: { ...computeSweepCardMeta(candidate), world: base.meta.world },
  };
}
