/**
 * What tonight's wrap up shows of Sweep's cards.
 *
 * The swipe cards are Sweep's own (lib/store/selectors.ts,
 * sweepCandidatesAsOf), counted from the person's day, with one kind taken
 * out: a todo that was simply due today. There is nothing to decide about
 * one of those. It either happened or it moves on, so they are gathered on
 * one card after the swipe cards (Still open today), with one button to move
 * them to tomorrow.
 *
 * A due today todo that asks a question, was skipped in an earlier Sweep or
 * was brought back for today is still a swipe card.
 */
import type { SweepCandidate, SweepCardMeta } from '../sweep/types';
import { sweepCardAsks } from '../sweep/sweepOrder';

export interface WrapCard {
  candidate: SweepCandidate;
  meta: SweepCardMeta;
}

export interface StillOpen {
  id: string;
  title: string;
}

/** A todo that was due on the day and has nothing to decide. */
export function plainDueToday(c: SweepCandidate, day: string): boolean {
  if (c.kind !== 'todo') return false;
  const raw = c.raw as { due_day?: string | null; resurface_at?: string | null };
  if (raw.due_day !== day) return false;
  if (sweepCardAsks(c)) return false;
  if (c.skippedInSweepAt) return false;
  if (raw.resurface_at && raw.resurface_at <= day) return false;
  return true;
}

function titleOf(c: SweepCandidate): string {
  const raw = c.raw as { name?: string | null; title?: string | null };
  return (raw.name || raw.title || 'Untitled').trim();
}

/** Sweep's cards for a day, split into the swipe cards and the todos still open that day. */
export function splitForWrapUp<T extends WrapCard>(
  all: T[],
  day: string,
): { cards: T[]; still: StillOpen[] } {
  const cards: T[] = [];
  const still: StillOpen[] = [];
  for (const c of all) {
    if (plainDueToday(c.candidate, day))
      still.push({ id: c.candidate.id, title: titleOf(c.candidate) });
    else cards.push(c);
  }
  return { cards, still };
}
