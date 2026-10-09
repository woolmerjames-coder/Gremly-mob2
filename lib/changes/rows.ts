/**
 * A card's rows, where they are not one row for each change.
 *
 * A milestone is one change with several steps, and its card lists each step
 * as a row of its own, with its own tick, so one step can be left out and the
 * rest set up. A step's row is named after its change and its place in it
 * (stepCid), and a card that is applied keeps only the steps still ticked
 * (withoutUnticked). Each kept step carries the name of its row, so the todo
 * it makes can be opened from that row afterwards.
 */
import type { Change, MilestoneStep } from './model';

/** A milestone's step as it is applied from a card: with the row it was ticked on. */
export type RowStep = MilestoneStep & { row?: string };

/** The row of one step of a milestone: the change's own row, and the step's place in it. */
export function stepCid(cid: string, index: number): string {
  return `${cid}.${index + 1}`;
}

/**
 * The changes a card applies once some of its rows are unticked. A change
 * whose row is unticked is left out. A milestone keeps the steps still
 * ticked, each with its row, and is left out whole when none of them is.
 */
export function withoutUnticked(card: Change[], unticked: string[]): Change[] {
  const off = new Set(unticked);
  const out: Change[] = [];
  for (const c of card) {
    if (off.has(c.cid)) continue;
    if (c.op !== 'milestone' || !c.milestone) {
      out.push(c);
      continue;
    }
    const steps: RowStep[] = c.milestone.steps
      .map((s, i) => ({ ...s, row: stepCid(c.cid, i) }))
      .filter((s) => !off.has(s.row));
    if (steps.length) out.push({ ...c, milestone: { ...c.milestone, steps } });
  }
  return out;
}

/** The steps of a card's milestones whose rows are unticked, each with the milestone it is a step of. */
export function stepsLeftOut(
  card: Change[],
  unticked: string[],
): { change: Change; step: MilestoneStep }[] {
  const off = new Set(unticked);
  return card.flatMap((c) =>
    c.op === 'milestone' && c.milestone
      ? c.milestone.steps
          .filter((_, i) => off.has(stepCid(c.cid, i)))
          .map((step) => ({ change: c, step }))
      : [],
  );
}
