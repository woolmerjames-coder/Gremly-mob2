import {
  applyOp,
  changeText,
  entriesOf,
  fitPlan,
  lockText,
  opFromButton,
  planHeading,
  planSummary,
  suggestions,
  unplacedText,
  whatCanWait,
  type PlanEntry,
} from '../planFlow';
import type { Candidate } from '../candidatePool';
import type { BriefPlanMeta } from '../../brief/types';

const MEETINGS = [{ start: 720, end: 795 }];
const ENTRIES: PlanEntry[] = [
  {
    id: 'social',
    kind: 'habit',
    title: 'Social posts',
    minutes: 30,
    window: [795, 1320],
    reason: '0 of 3 this week',
  },
  {
    id: 'oat',
    kind: 'todo',
    title: 'Buy Oat Milk',
    minutes: 15,
    window: [795, 1320],
    reason: 'Due today',
  },
  { id: 'run', kind: 'habit', title: 'Run', minutes: 45, window: [1020, 1260], reason: 'Weekly' },
];
const POOL: Candidate[] = [
  ...ENTRIES.map((e) => ({ ...e, why: e.reason ?? '', source: 'habit' as const })),
  {
    id: 'strength',
    kind: 'habit',
    title: 'Strength training',
    minutes: 40,
    why: '1 of 3 this week',
    window: null,
    source: 'behind',
  },
];

function plan(): BriefPlanMeta {
  return {
    type: 'brief-plan',
    version: 1,
    status: 'proposal',
    date: '2026-09-30',
    ...fitPlan(ENTRIES, MEETINGS, 795),
  };
}

describe('a plan in the thread', () => {
  it('places the entries and keeps everything needed to re-fit them', () => {
    const p = plan();
    expect(p.items.map((x) => [x.id, x.start, x.end])).toEqual([
      ['social', 810, 840],
      ['oat', 855, 870],
      ['run', 1020, 1065],
    ]);
    expect(entriesOf(p).map((e) => e.id)).toEqual(['social', 'oat', 'run']);
    expect(planHeading(795)).toBe('Your afternoon');
    expect(planSummary(p, MEETINGS)).toBe('3 things, 1h 30m, still 7h 15m free');
  });

  it('removes, adds and moves', () => {
    const p = plan();
    const without = applyOp(
      entriesOf(p),
      { op: 'remove', id: 'oat', window: null },
      POOL,
      795,
      p.items,
    );
    expect(without.map((e) => e.id)).toEqual(['social', 'run']);
    const added = applyOp(
      entriesOf(p),
      { op: 'add', id: 'strength', window: null },
      POOL,
      795,
      p.items,
    );
    expect(added.map((e) => e.id)).toEqual(['social', 'oat', 'run', 'strength']);
    const moved = applyOp(
      entriesOf(p),
      { op: 'move', id: 'run', window: [1080, 1320] },
      POOL,
      795,
      p.items,
    );
    const refit = fitPlan(moved, MEETINGS, 795);
    expect(refit.items.find((x) => x.id === 'run')?.start).toBe(1080);
    // a move with no time goes later than where it is
    const later = applyOp(
      entriesOf(p),
      { op: 'move', id: 'social', window: null },
      POOL,
      795,
      p.items,
    );
    expect(later.find((e) => e.id === 'social')?.window).toEqual([885, 1320]);
  });

  it('suggests up to three changes, worked out from the plan', () => {
    const s = suggestions(plan(), POOL);
    expect(s.map((b) => b.label)).toEqual([
      'Move social posts after 6',
      'Add strength training',
      'Skip run today',
    ]);
    expect(opFromButton(s[1])).toEqual({ op: 'add', id: 'strength', window: null });
    expect(opFromButton({ id: 'x', label: 'x', action: 'plan_edit', value: 'nope' })).toBeNull();
  });

  it('says what changed, and what did not fit', () => {
    const placed = { id: 'run', kind: 'habit' as const, title: 'Run', start: 1080, end: 1125 };
    expect(changeText({ op: 'move', id: 'run', window: [1080, 1320] }, 'Run', placed, false)).toBe(
      'Done, run is at 6pm now. Everything else stays where it was.',
    );
    expect(
      changeText({ op: 'add', id: 'x', window: null }, 'Strength training', undefined, true),
    ).toBe(
      "There isn't a good gap for strength training today, so I've left it off. Lock it in again to update Today.",
    );
    expect(unplacedText([{ id: 'a', title: 'Run' }])).toBe(
      "I couldn't find a good gap for run today, so it's not in the plan.",
    );
    expect(unplacedText([])).toBeNull();
    expect(lockText(['Book the car service'])).toBe(
      "Locked in. It's all on Today, with plenty of room left. I've added book the car service as a todo too.",
    );
  });

  it('says what can wait from data', () => {
    expect(whatCanWait(POOL, 2)).toMatch(
      /^Nothing due today is urgent\. The 2 past their dates are/,
    );
    expect(whatCanWait(POOL, 0)).toBe(
      "Nothing on today's list is urgent. Social posts, buy Oat Milk and run can wait until tomorrow without putting the week off track. Strength training is the one to pick back up this week.",
    );
  });
});
