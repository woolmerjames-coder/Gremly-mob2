import {
  compareSweep,
  names,
  sweepEventText,
  sweepFollowUp,
  type SweepSnapshot,
} from '../sweepHandoff';

jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({}) },
  isHabitLockedIn: () => false,
}));
jest.mock('../../store/selectors', () => ({ selectSweepCandidatesUnified: () => [] }));

const TODAY = '2026-09-30';
const snap = (entries: [string, string | null, boolean?][]): SweepSnapshot => ({
  candidates: new Map(
    entries.map(([id, due, locked]) => [id, { title: id, dueDay: due, lockedIn: !!locked }]),
  ),
});

describe('handing Sweep back to the thread', () => {
  it('counts what left Sweep and what was kept for today', () => {
    const before = snap([
      ['oat', '2026-09-28'],
      ['tap', null],
      ['idea', null],
      ['plumber', '2026-09-29'],
      ['bank', null],
    ]);
    const after = snap([['oat', TODAY]]);
    const now = (id: string) =>
      ({
        oat: { title: 'Buy Oat Milk', dueDay: TODAY, lockedIn: false },
        tap: { title: 'Fix the tap', dueDay: '2026-10-05', lockedIn: false },
        plumber: { title: 'Call the plumber', dueDay: '2026-09-29', lockedIn: true },
        bank: { title: 'Bank', dueDay: null, lockedIn: false },
      })[id] ?? null;
    const o = compareSweep(before, after, now, TODAY);
    // oat (dated today), tap (dated later), plumber (locked in) changed; idea and bank left Sweep
    expect(o.swept).toBe(5);
    expect(o.kept.map((k) => k.title)).toEqual(['Buy Oat Milk', 'Call the plumber']);
    expect(o.allDone).toBe(false);
    expect(sweepEventText(o)).toBe('Swept 5 things, 2 kept for today');
  });

  it('follows up: plan around what was kept, or add it to the plan already there', () => {
    const kept = { swept: 3, kept: [{ id: 'oat', title: 'Buy Oat Milk' }], allDone: true };
    const noPlan = sweepFollowUp(kept, { livePlan: false, planFrom: 795 });
    expect(noPlan.text).toBe(
      'Nice, all sorted. You kept Buy Oat Milk for today. Want me to fit it in with the rest?',
    );
    expect(noPlan.buttons.map((b) => b.label)).toEqual(['Plan my afternoon', 'Not now']);
    const withPlan = sweepFollowUp(kept, { livePlan: true, planFrom: 795 });
    expect(withPlan.buttons.map((b) => b.action)).toEqual(['add_kept', 'leave_plan']);
    expect(JSON.parse(withPlan.buttons[0].value!)).toEqual(['oat']);
    const nothing = sweepFollowUp(
      { swept: 2, kept: [], allDone: false },
      { livePlan: false, planFrom: 795 },
    );
    expect(nothing.text).toBe(
      "Nice, that's a good dent in it. Nothing extra for today. Want me to plan what's already due?",
    );
    expect(
      sweepFollowUp({ swept: 2, kept: [], allDone: false }, { livePlan: true, planFrom: 795 })
        .buttons,
    ).toEqual([]);
  });
});

describe('naming what was kept', () => {
  it('names two at most, then counts the rest', () => {
    expect(names(['Call Mum'])).toBe('Call Mum');
    expect(names(['A', 'B'])).toBe('A and B');
    expect(names(['A', 'B', 'C'])).toBe('A, B and C');
    expect(names(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B and 4 more');
  });
});
