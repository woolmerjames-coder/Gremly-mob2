/**
 * A card's rows where they are not one for each change (lib/changes/rows.ts):
 * a milestone's steps are rows of their own, and the card applies the ones
 * still ticked.
 */
import { stepCid, stepsLeftOut, withoutUnticked } from '../rows';
import type { Change } from '../model';

const talk = {
  cid: 'c2',
  op: 'milestone',
  type: null,
  id: null,
  title: 'Conference talk',
  milestone: {
    goal: 'Conference talk',
    date: '2026-10-20',
    steps: [
      { title: 'Draft the outline', by: '2026-10-08', minutes: 45, kind: 'todo' },
      { title: 'How is the draft going?', by: '2026-10-12', kind: 'check_in' },
      { title: 'Rehearse once', by: '2026-10-16', kind: 'todo' },
    ],
  },
} as unknown as Change;
const later = { cid: 'c1', op: 'later', type: 'todo', id: 't1', title: 'Old idea' } as Change;

describe("a card's rows", () => {
  it('names a step after its change and its place in it', () => {
    expect(stepCid('c2', 0)).toBe('c2.1');
    expect(stepCid('c2', 2)).toBe('c2.3');
  });

  it('applies everything while every row is ticked, each step with its row', () => {
    const out = withoutUnticked([later, talk], []);
    expect(out[0]).toBe(later);
    expect(out[1].milestone?.steps).toEqual([
      { title: 'Draft the outline', by: '2026-10-08', minutes: 45, kind: 'todo', row: 'c2.1' },
      { title: 'How is the draft going?', by: '2026-10-12', kind: 'check_in', row: 'c2.2' },
      { title: 'Rehearse once', by: '2026-10-16', kind: 'todo', row: 'c2.3' },
    ]);
    // the card itself is left as it was drawn
    expect(talk.milestone?.steps[0]).not.toHaveProperty('row');
  });

  it('leaves out an unticked step, and keeps the rows of the others as they were', () => {
    const out = withoutUnticked([later, talk], ['c2.1']);
    expect(out).toHaveLength(2);
    expect(out[1].milestone?.steps.map((s: any) => [s.title, s.row])).toEqual([
      ['How is the draft going?', 'c2.2'],
      ['Rehearse once', 'c2.3'],
    ]);
    expect(stepsLeftOut([later, talk], ['c2.1'])).toEqual([
      { change: talk, step: talk.milestone?.steps[0] },
    ]);
  });

  it('leaves a milestone out whole when none of its steps is ticked', () => {
    expect(withoutUnticked([later, talk], ['c2.1', 'c2.2', 'c2.3'])).toEqual([later]);
    expect(withoutUnticked([later, talk], ['c1'])).toHaveLength(1);
    expect(stepsLeftOut([later, talk], ['c1'])).toEqual([]);
  });
});
