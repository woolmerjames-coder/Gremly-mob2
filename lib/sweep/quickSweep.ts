/**
 * The quick sweep: the brief's "Sweep first" in the morning. Sweep's own list
 * (selectSweepCandidatesUnified) is the evening review, so it holds everything
 * due today, including what was decided last night. The quick sweep keeps
 * only the cards that still need a decision before the day is planned.
 *
 * A todo needs one when it is past its day, has no day and was never decided
 * (decided_at, set by the database whenever it gets a day, a Lock In or a
 * resurface date), was skipped in an earlier Sweep, or resurfaces today.
 * A note needs one when it is a drop not yet swept; an upcoming event only
 * waits for a reminder, so it is left for the evening. Any card with a live
 * question made that day or the day before (is this one you already have?
 * one job or two? what is this?) is always in, a habit's included (the ask
 * rules, lib/minddrop/asks.ts).
 *
 * The worker counts the same way (workers/inngest-jobs/notifications/
 * sweepCount.js, quickSweepItems): keep the two in step.
 */
import { sweepCardAsks } from './sweepOrder';
// A planned day: due_day, else scheduled_date (stage 2c, 9 Oct 2026)
import { plannedDayOf } from '../../workers/shared/todoDay';
import type { SweepCandidate, SweepCardMeta } from './types';

type Row = Record<string, unknown>;

export function needsDecision(c: SweepCandidate, today: string): boolean {
  if (sweepCardAsks(c, today, 'quick')) return true;
  const raw = (c.raw ?? {}) as Row;
  const skipped = !!raw.skipped_in_sweep_at;
  const resurface = (raw.resurface_at as string | null | undefined) ?? null;
  const resurfacesToday = !!resurface && resurface <= today;
  if (c.kind === 'todo') {
    if (c.isOverdue || skipped || resurfacesToday) return true;
    // no day planned and never decided; a deadline only todo is asked too, as
    // a deadline is not a day to do it (workers/shared/todoDay.js)
    return !plannedDayOf(raw) && !raw.decided_at;
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
