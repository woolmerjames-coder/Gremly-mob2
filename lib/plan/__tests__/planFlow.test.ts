import {
  applyOp,
  changeText,
  entriesOf,
  fitPlan,
  alreadySetText,
  dismissedText,
  notSetLine,
  planDay,
  planDayTitle,
  setTag,
  yesLabel,
  yesText,
  opFromButton,
  planHeading,
  refitKeeping,
  placePlan,
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
      'Move Social posts after 6',
      'Add Strength training',
      'Skip Run today',
    ]);
    expect(opFromButton(s[1])).toEqual({ op: 'add', id: 'strength', window: null });
    expect(opFromButton({ id: 'x', label: 'x', action: 'plan_edit', value: 'nope' })).toBeNull();
  });

  it('says what changed, and what did not fit', () => {
    const placed = { id: 'run', kind: 'habit' as const, title: 'Run', start: 1080, end: 1125 };
    expect(changeText({ op: 'move', id: 'run', window: [1080, 1320] }, 'Run', placed, false)).toBe(
      'Done, Run is at 6pm now. Everything else stays where it was.',
    );
    expect(
      changeText({ op: 'add', id: 'x', window: null }, 'Strength training', undefined, true),
    ).toBe(
      "There isn't a good gap for Strength training today, so I've left it off. Say yes again to keep the change.",
    );
    expect(unplacedText([{ id: 'a', title: 'Run' }])).toBe(
      "I couldn't find a good gap for Run today, so it's not in the plan.",
    );
    expect(unplacedText([])).toBeNull();
    expect(yesText(['Book the car service'], planDay('2026-09-30', '2026-09-30'))).toBe(
      "That's all on Today, with plenty of room left. I've added Book the car service as a todo too.",
    );
  });

  it('names a plan by its day, in the words the person would use', () => {
    const today = planDay('2026-09-30', '2026-09-30');
    const tomorrow = planDay('2026-10-01', '2026-09-30');
    // after midnight the clock already says Thursday, so "tomorrow" would be misread
    const late = planDay('2026-10-01', '2026-09-30', true);
    const further = planDay('2026-10-03', '2026-09-30');

    expect([today.today, tomorrow.today, late.today]).toEqual([true, false, false]);
    expect(planDayTitle(today)).toBeNull();
    expect([planDayTitle(tomorrow), planDayTitle(late), planDayTitle(further)]).toEqual([
      'Tomorrow',
      'Thursday',
      'Saturday',
    ]);
    expect([yesLabel(today), yesLabel(tomorrow), yesLabel(late)]).toEqual([
      'Put it on Today',
      "That's tomorrow",
      "That's Thursday",
    ]);
    expect([setTag(today), setTag(tomorrow), setTag(late)]).toEqual([
      'On Today',
      'On Thursday',
      'On Thursday',
    ]);
    expect(notSetLine(today)).toBe('Plan not set');
    expect(notSetLine(tomorrow)).toBe('Plan not set. The morning brief will have it.');
    expect(yesText([], tomorrow)).toBe("Done. It'll be on Today when you wake up.");
    expect(dismissedText(today)).toBe("No problem. It'll be right here if you want it later.");
    expect(dismissedText(late)).toBe('No problem. The morning brief will bring it.');
    expect(alreadySetText(today)).toBe(
      "It's already on Today. Tell me what to change and I'll rework it.",
    );
    expect(alreadySetText(late)).toBe(
      "It's already set for Thursday. Tell me what to change and I'll rework it.",
    );
  });

  it('says what can wait from data', () => {
    expect(whatCanWait(POOL, 2)).toMatch(/^The 2 past their dates are the ones to decide on/);
    expect(whatCanWait(POOL, 0)).toBe(
      'Social posts, Buy Oat Milk and Run can wait until tomorrow without putting the week off track. Strength training is the one to pick back up this week.',
    );
  });
});

describe('fitting a plan again after a change', () => {
  // a travel day: the plan ends at 2:30pm, when they set off
  const SETS_OFF = 870;
  const entries: PlanEntry[] = [
    {
      id: 'deck',
      kind: 'todo',
      title: 'Send the deck',
      minutes: 60,
      window: [540, 1320],
      reason: null,
    },
    {
      id: 'blinkist',
      kind: 'habit',
      title: 'Blinkist',
      minutes: 15,
      window: [1140, 1155],
      reason: null,
    },
    {
      id: 'strength',
      kind: 'habit',
      title: 'Strength training',
      minutes: 45,
      window: [540, 1320],
      reason: null,
    },
  ];
  // they took Blinkist at 7pm on a card, once home
  const placed = [
    { id: 'deck', kind: 'todo' as const, title: 'Send the deck', start: 540, end: 600 },
    {
      id: 'blinkist',
      kind: 'habit' as const,
      title: 'Blinkist',
      start: 1140,
      end: 1155,
      pinned: true,
    },
  ];

  it('keeps a time they set where it is, even after the plan would end, and fits the rest around it', () => {
    const fit = refitKeeping(entries, placed, [], 540, SETS_OFF);
    expect(fit.items.find((x) => x.id === 'blinkist')).toMatchObject({
      start: 1140,
      end: 1155,
      pinned: true,
    });
    expect(fit.items.find((x) => x.id === 'strength')?.end).toBeLessThanOrEqual(SETS_OFF);
    expect(fit.unplaced).toEqual([]);
  });

  it('places afresh what the change itself moves, and fits as before when nothing was set', () => {
    const moved = refitKeeping(entries, placed, [], 540, SETS_OFF, ['blinkist']);
    expect(moved.unplaced.map((u) => u.id)).toEqual(['blinkist']);
    const none = refitKeeping(
      entries,
      placed.map((x) => ({ ...x, pinned: false })),
      [],
      540,
      SETS_OFF,
    );
    expect(none).toEqual(fitPlan(entries, [], 540, SETS_OFF));
  });
});

describe('placing a plan in the order things claim time', () => {
  // Monday 5 October, 7:35am: meetings until 8:30, then 11:15 to 2pm
  const NOW = 455;
  const FROM = 510;
  const BUSY = [
    { start: 450, end: 510 },
    { start: 675, end: 720 },
    { start: 750, end: 780 },
    { start: 810, end: 840 },
  ];
  const todo = (id: string, minutes: number, extra: Partial<PlanEntry> = {}): PlanEntry => ({
    id,
    kind: 'todo',
    title: id,
    minutes,
    window: [FROM, 1320],
    reason: null,
    ...extra,
  });
  const at = (fit: ReturnType<typeof placePlan>, id: string) =>
    fit.items.find((x) => x.id === id)?.start ?? null;
  const overlaps = (fit: ReturnType<typeof placePlan>) =>
    fit.items.some((a, i) => fit.items.some((b, j) => i < j && a.start < b.end && b.start < a.end));

  it('never puts a named time before now, and never two things on top of each other', () => {
    const entries = [todo('agent', 45), todo('split', 15), todo('input', 30)];
    // the 2:45am plan: times already gone, and one on top of another
    const pins = new Map([
      ['agent', 165],
      ['split', 180],
      ['input', 210],
    ]);
    const fit = placePlan(entries, { busy: BUSY, from: FROM, now: NOW, pins });
    expect(fit.items.every((x) => x.start >= NOW)).toBe(true);
    expect(overlaps(fit)).toBe(false);
    expect(fit.unplaced).toEqual([]);
  });

  it('keeps a named time exactly where it was named when it is free', () => {
    const fit = placePlan([todo('pushups', 10)], {
      busy: BUSY,
      from: FROM,
      now: NOW,
      pins: new Map([['pushups', 1080]]),
    });
    expect(fit.items[0]).toMatchObject({ id: 'pushups', start: 1080, end: 1090, pinned: true });
  });

  it("keeps what they picked when Gremly fills the evening, and leaves off Gremly's first", () => {
    // taxes was picked at 5pm; Gremly's card puts four hours of things from 5pm
    const taxes = todo('taxes', 60, { chosen: true });
    const placed = [
      { id: 'taxes', kind: 'todo' as const, title: 'taxes', start: 1020, end: 1080, chosen: true },
    ];
    const gremly = ['a', 'b', 'c', 'd', 'e'].map((id) => todo(id, 60));
    const entries = [...gremly, taxes];
    const fit = placePlan(entries, {
      busy: BUSY,
      from: FROM,
      now: NOW,
      placed,
      // a long morning so the day is short of room
      dayEnd: 1080 + 4 * 60,
    });
    expect(at(fit, 'taxes')).toBe(1020);
    expect(fit.items.find((x) => x.id === 'taxes')?.chosen).toBe(true);
    expect(overlaps(fit)).toBe(false);
  });

  it('moves what they picked to the next free time when a time they name lands on it, and keeps it in', () => {
    const taxes = todo('taxes', 60, { chosen: true });
    const placed = [
      { id: 'taxes', kind: 'todo' as const, title: 'taxes', start: 1020, end: 1080, chosen: true },
    ];
    const fit = placePlan([todo('run', 30), taxes], {
      busy: BUSY,
      from: FROM,
      now: NOW,
      placed,
      pins: new Map([['run', 1020]]),
    });
    expect(at(fit, 'run')).toBe(1020);
    expect(at(fit, 'taxes')).toBeGreaterThanOrEqual(1050);
    expect(fit.unplaced).toEqual([]);
  });

  it('places what they picked ahead of what Gremly chose when there is room for only one', () => {
    const fit = placePlan([todo('gremly', 60), todo('mine', 60, { chosen: true })], {
      busy: [],
      from: 1200,
      dayEnd: 1290,
      now: 1200,
    });
    expect(fit.items.map((x) => x.id)).toEqual(['mine']);
    expect(fit.unplaced.map((x) => x.id)).toEqual(['gremly']);
  });

  it('marks a pick as theirs when it is added', () => {
    const pool: Candidate[] = [
      {
        id: 'taxes',
        kind: 'todo',
        title: 'Do taxes',
        minutes: 60,
        why: 'Due today',
        window: null,
        source: 'due',
      },
    ];
    const next = applyOp(
      [],
      { op: 'add', id: 'taxes', window: null, chosen: true },
      pool,
      FROM,
      [],
    );
    expect(next[0]).toMatchObject({ id: 'taxes', chosen: true, reason: 'Added by you' });
    // picking something Gremly already put in makes it theirs too
    const again = applyOp(
      [todo('taxes', 60)],
      { op: 'add', id: 'taxes', window: null, chosen: true },
      pool,
      FROM,
      [],
    );
    expect(again[0]).toMatchObject({ chosen: true, reason: 'Added by you' });
  });
});
