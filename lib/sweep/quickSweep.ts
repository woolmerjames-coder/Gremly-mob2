/**
 * The quick sweep: the brief's "Sweep first" in the morning. Sweep's own list
 * (selectSweepCandidatesUnified) is the evening review, so it holds everything
 * due today, including what was decided last night. The quick sweep keeps
 * only the cards that still need a decision before the day is planned.
 *
 * A todo needs one when it is past its day, has no day and was never decided
 * (decided_at, set by the database whenever it gets a day, a Lock In or a
 * resurface date), was skipped in an earlier Sweep, or resurfaces today.
 * A note needs one when Sweep has a question for it, or it is a drop not yet
 * swept; an upcoming event only waits for a reminder, so it is left for the
 * evening. Any card with a question (is this one you already have? what is
 * this?) is always in.
 *
 * The worker counts the same way (workers/inngest-jobs/notifications/
 * sweepCount.js, quickSweepItems): keep the two in step.
 */
import { sweepCardAsks } from './sweepOrder';
import type { SweepCandidate, SweepCardMeta } from './types';

type Row = Record<string, unknown>;

export function needsDecision(c: SweepCandidate, today: string): boolean {
  if (sweepCardAsks(c)) return true;
  const raw = (c.raw ?? {}) as Row;
  const skipped = !!raw.skipped_in_sweep_at;
  const resurface = (raw.resurface_at as string | null | undefined) ?? null;
  const resurfacesToday = !!resurface && resurface <= today;
  if (c.kind === 'todo') {
    if (c.isOverdue || skipped || resurfacesToday) return true;
    return !raw.due_day && !raw.decided_at;
  }
  if (c.kind === 'note') {
    if (skipped || resurfacesToday) return true;
    if (raw.subtype === 'event') return false;
    return !raw.swept_at;
  }
  return false;
}

export function quickSweepCards<T extends { candidate: SweepCandidate; meta: SweepCardMeta }>(
  cards: T[],
  today: string,
): T[] {
  return cards.filter((c) => needsDecision(c.candidate, today));
}
