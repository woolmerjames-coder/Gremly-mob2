/**
 * A habit's pause, lighter version or return to usual from a change card
 * (lib/changes/ease.ts): checked against what is eased now, worded for the
 * card, saved as one thing, and put back by Undo.
 */
const mockState: any = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockState,
    setState: (to: any) => Object.assign(mockState, typeof to === 'function' ? to(mockState) : to),
  },
}));
jest.mock('../../repo/linkingRepo', () => ({
  upsertDropWorldLinks: jest.fn(async () => {}),
  deleteDropWorldLink: jest.fn(async () => {}),
  upsertDropChapterLinks: jest.fn(async () => {}),
  deleteDropChapterLink: jest.fn(async () => {}),
}));
jest.mock('../../repo/dailyThreadRepo', () => ({
  patchDailyThreadMeta: jest.fn(async () => null),
}));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ thread: null, patchMeta: () => {} }) },
}));
jest.mock('../../minddrop/ids', () => ({ generateDropId: () => 'id-1' }));
jest.mock('../../repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  saveWeeklyDay: jest.fn(),
  changeWeekReview: jest.fn(),
}));

import { applyChange } from '../apply';
import { checkChange, type Change } from '../model';
import { contextFor } from '../snapshot';
import { buttonWords, doneWords, rowWords } from '../words';
import { applyCardChanges } from '../../brief/applyChanges';
import { getDateService } from '../../date/DateService';

// Wednesday 7 October 2026; with Sunday as the weekly day their week ends on the 11th
const TODAY = '2026-10-07';
const SUN = '2026-10-11';
const ds = getDateService() as any;
let clock: () => Date;

const row = (id: string, mode: string, period_start: string, period_end: string, note = '') => ({
  id,
  habit_id: 'h1',
  owner_id: 'u1',
  mode,
  period_start,
  period_end,
  floor_note: note || null,
});
const plan = (planned_date: string, status = 'planned') => ({
  id: `p-${planned_date}`,
  habit_id: 'h1',
  planned_date,
  status,
});

/** What the store did, in order. */
let calls: string[];

beforeEach(() => {
  clock = ds.clock;
  ds.clock = () => new Date(2026, 9, 7, 12, 0, 0);
  calls = [];
  mockState.userId = 'u1';
  mockState.weeklyDay = 0;
  mockState.habits = [{ id: 'h1', name: 'Run', cadence: 'weekly', target_per_period: 3 }];
  mockState.todos = [];
  mockState.notes = [];
  mockState.habitProgress = [];
  mockState.dropWorldLinks = [];
  mockState.dropChapterLinks = [];
  mockState.worlds = [];
  mockState.chapters = [];
  mockState.habitAdaptations = [];
  mockState.habitPlans = [];
  // the store's own writer, as it behaves: the rows change and it hands back the way back
  mockState.easeHabit = jest.fn(async (id: string, to: any) => {
    calls.push(`ease ${to.mode} ${to.first} ${to.last}${to.note ? ` ${to.note}` : ''}`);
    const before = mockState.habitAdaptations;
    mockState.habitAdaptations =
      to.mode === 'usual'
        ? before.filter((a: any) => a.habit_id !== id)
        : [
            ...before.filter((a: any) => a.habit_id !== id),
            row('new', to.mode === 'pause' ? 'pause' : 'floor', to.first, to.last, to.note),
          ];
    return async () => {
      calls.push('ease back');
      mockState.habitAdaptations = before;
    };
  });
  mockState.removeHabitPlan = jest.fn(async (id: string, day: string) => {
    calls.push(`unplan ${day}`);
    mockState.habitPlans = mockState.habitPlans.filter(
      (p: any) => !(p.habit_id === id && p.planned_date === day),
    );
  });
  mockState.setHabitPlan = jest.fn(async (id: string, day: string) => {
    calls.push(`plan ${day}`);
    mockState.habitPlans = [...mockState.habitPlans, plan(day)];
  });
});

afterEach(() => {
  ds.clock = clock;
});

/** A change as the worker would have checked it, against the store as it is now. */
function checked(ease: Record<string, unknown>): Change {
  const raw = { cid: 'c1', op: 'ease', type: 'habit', id: 'h1', ease };
  const r = checkChange(raw, contextFor(raw));
  if (!r.ok) throw new Error(`not a change: ${r.reason}`);
  return r.change;
}

describe('checking it in the app', () => {
  it('reads their weekly day and what is eased now from the store', () => {
    expect(checked({ mode: 'pause' }).ease).toEqual({
      mode: 'pause',
      first: TODAY,
      last: SUN,
      note: '',
    });
    mockState.weeklyDay = 3;
    // a Wednesday person's week ends today
    expect(checked({ mode: 'pause' }).ease).toMatchObject({ first: TODAY, last: TODAY });
    mockState.weeklyDay = 0;
    mockState.habitAdaptations = [row('a', 'pause', TODAY, SUN)];
    const raw = { op: 'ease', type: 'habit', id: 'h1', ease: { mode: 'pause' } };
    expect(checkChange(raw, contextFor(raw))).toEqual({ ok: false, reason: 'ease_already' });
  });
});

describe('the words', () => {
  it('say a pause by the days it runs', () => {
    const week = checked({ mode: 'pause' });
    expect(rowWords(week)).toBe('Pause Run until Sun 11 Oct');
    expect(buttonWords(week)).toBe('Yes, pause it');
    expect(doneWords(week)).toBe('Run is paused until Sun 11 Oct.');
    const today = checked({ mode: 'pause', until: TODAY });
    expect(rowWords(today)).toBe('Pause Run today');
    // the closing line is kept, so it names the day
    expect(doneWords(today)).toBe('Run is paused on Wed 7 Oct.');
    expect(rowWords(checked({ mode: 'pause', until: '2026-10-08' }))).toBe(
      'Pause Run until tomorrow',
    );
    const ahead = checked({ mode: 'pause', from: '2026-10-12', until: '2026-10-18' });
    expect(rowWords(ahead)).toBe('Pause Run from Mon 12 Oct to Sun 18 Oct');
    expect(doneWords(ahead)).toBe('Run is paused from Mon 12 Oct to Sun 18 Oct.');
    expect(rowWords(checked({ mode: 'pause', from: '2026-10-09', until: '2026-10-09' }))).toBe(
      'Pause Run on Fri 9 Oct',
    );
  });

  it('say a lighter version with what it is, when it was given words', () => {
    const lighter = checked({ mode: 'lighter', note: '10 minute walk' });
    expect(rowWords(lighter)).toBe('Lighter version of Run until Sun 11 Oct: 10 minute walk');
    expect(buttonWords(lighter)).toBe('Yes, go lighter');
    expect(doneWords(lighter)).toBe('Run is on its lighter version until Sun 11 Oct.');
    expect(rowWords(checked({ mode: 'lighter' }))).toBe('Lighter version of Run until Sun 11 Oct');
  });

  it('name a return to usual for what it ends', () => {
    mockState.habitAdaptations = [row('a', 'pause', TODAY, SUN)];
    const pause = checked({ mode: 'usual' });
    expect(rowWords(pause)).toBe('End the pause on Run');
    expect(buttonWords(pause)).toBe('Yes, back to usual');
    expect(doneWords(pause)).toBe('Run is back to usual.');
    mockState.habitAdaptations = [row('a', 'floor', TODAY, SUN, 'Walk')];
    expect(rowWords(checked({ mode: 'usual' }))).toBe('End the lighter version of Run');
    mockState.habitAdaptations = [
      row('a', 'pause', TODAY, TODAY),
      row('b', 'floor', '2026-10-08', SUN, 'Walk'),
    ];
    // only the pause that holds today is ended, so only it is named
    expect(rowWords(checked({ mode: 'usual' }))).toBe('End the pause on Run');
    expect(rowWords(checked({ mode: 'usual', until: SUN }))).toBe('Back to usual for Run');
  });

  it('say from when, for a return to usual that starts on a later day', () => {
    mockState.habitAdaptations = [row('a', 'pause', '2026-10-05', '2026-10-18')];
    const sooner = checked({ mode: 'usual', from: '2026-10-09' });
    expect(rowWords(sooner, { relative: false })).toBe('End the pause on Run from Fri 9 Oct');
    expect(doneWords(sooner)).toBe('Run is back to usual from Fri 9 Oct.');
  });

  it('have no dashes', () => {
    for (const e of [
      { mode: 'pause' },
      { mode: 'lighter', note: 'Walk' },
      { mode: 'pause', from: '2026-10-12', until: '2026-10-18' },
    ]) {
      const c = checked(e);
      expect(`${rowWords(c)} ${buttonWords(c)} ${doneWords(c)}`).not.toMatch(/[–—]| - /);
    }
  });
});

describe('applying it', () => {
  it('pauses the habit and takes it off the days it was planned on in the stretch', async () => {
    mockState.habitPlans = [
      plan('2026-10-06'),
      plan('2026-10-08'),
      plan('2026-10-10'),
      plan('2026-10-13'),
      // one already settled is left as it is
      plan('2026-10-09', 'kept'),
    ];
    const out = await applyChange(checked({ mode: 'pause' }), { source: 'chat' });
    expect(out).toMatchObject({ ok: true, summary: 'Run is paused until Sun 11 Oct.' });
    expect(calls).toEqual([`ease pause ${TODAY} ${SUN}`, 'unplan 2026-10-08', 'unplan 2026-10-10']);
    // Undo: the days come back, then the pause goes
    if (!out.ok) throw new Error('not applied');
    await out.revert();
    expect(calls.slice(3)).toEqual(['plan 2026-10-08', 'plan 2026-10-10', 'ease back']);
    expect(mockState.habitAdaptations).toEqual([]);
  });

  it('gives a lighter version and leaves its days where they are', async () => {
    mockState.habitPlans = [plan('2026-10-08')];
    const out = await applyChange(checked({ mode: 'lighter', note: 'Walk' }), { source: 'chat' });
    expect(out.ok).toBe(true);
    expect(calls).toEqual([`ease lighter ${TODAY} ${SUN} Walk`]);
    expect(mockState.habitPlans).toHaveLength(1);
  });

  it('ends what is running with usual, and Undo brings it back', async () => {
    mockState.habitAdaptations = [row('a', 'pause', '2026-10-05', '2026-10-18')];
    const out = await applyChange(checked({ mode: 'usual' }), { source: 'chat' });
    expect(out).toMatchObject({ ok: true, summary: 'Run is back to usual.' });
    expect(calls).toEqual([`ease usual ${TODAY} 2026-10-18`]);
    if (!out.ok) throw new Error('not applied');
    await out.revert();
    expect(mockState.habitAdaptations).toHaveLength(1);
  });

  it('applies a card that came back from where it is kept with its fields in another order', async () => {
    mockState.habitAdaptations = [row('a', 'pause', '2026-10-05', '2026-10-18')];
    const change = checked({ mode: 'usual' });
    // kept as jsonb, each object comes back with its keys sorted by length, then by letter
    const kept: Change = {
      ...change,
      before: {
        eases: change.before!.eases.map((e: any) => ({
          last: e.last,
          mode: e.mode,
          note: e.note,
          first: e.first,
        })),
      },
    };
    const out = await applyChange(kept, { source: 'chat' });
    expect(out).toMatchObject({ ok: true });
    expect(calls).toEqual([`ease usual ${TODAY} 2026-10-18`]);
  });

  it('acts from today when the card is accepted after its first day', async () => {
    mockState.habitPlans = [plan('2026-10-06'), plan('2026-10-09')];
    const change = checked({ mode: 'pause', until: '2026-10-10' });
    // two days on: Friday 9 October
    ds.clock = () => new Date(2026, 9, 9, 12, 0, 0);
    const out = await applyChange(change, { source: 'chat' });
    expect(out).toMatchObject({ ok: true });
    // the days already gone are not paused, and the plan for one is not taken away
    expect(calls).toEqual(['ease pause 2026-10-09 2026-10-10', 'unplan 2026-10-09']);
  });

  it('does nothing with a card whose days have all gone, and is not thrown by what ran out since', async () => {
    const gone = checked({ mode: 'pause', from: TODAY, until: TODAY });
    mockState.habitAdaptations = [row('a', 'floor', TODAY, '2026-10-08', 'Walk')];
    const usual = checked({ mode: 'usual', from: TODAY, until: '2026-10-08' });
    const later = checked({ mode: 'pause', from: '2026-10-10', until: SUN });
    ds.clock = () => new Date(2026, 9, 9, 12, 0, 0);
    expect(await applyChange(gone, { source: 'chat' })).toMatchObject({
      ok: false,
      reason: 'stale',
    });
    expect(await applyChange(usual, { source: 'chat' })).toMatchObject({
      ok: false,
      reason: 'stale',
    });
    // the lighter version it was offered against ended yesterday by itself: that is no change of theirs
    expect(await applyChange(later, { source: 'chat' })).toMatchObject({ ok: true });
    expect(calls).toEqual([`ease pause 2026-10-10 ${SUN}`]);
  });

  it('leaves it as it is when a pause was made or ended since the card was offered', async () => {
    const change = checked({ mode: 'pause' });
    mockState.habitAdaptations = [row('a', 'floor', TODAY, SUN, 'Walk')];
    const out = await applyChange(change, { source: 'chat' });
    expect(out).toEqual({
      cid: 'c1',
      ok: false,
      reason: 'stale',
      message: 'Run changed since, so it was left as it is.',
    });
    expect(calls).toEqual([]);
  });

  it('says so when the habit is gone', async () => {
    const change = checked({ mode: 'pause' });
    mockState.habits = [{ id: 'h1', name: 'Run', archived: true }];
    expect(await applyChange(change, { source: 'chat' })).toMatchObject({
      ok: false,
      reason: 'gone',
    });
  });

  it('does not pause when its days could not be taken off: nothing is left half done', async () => {
    mockState.habitPlans = [plan('2026-10-08'), plan('2026-10-10')];
    // the second day's write fails, and the store's writer puts its own change back
    mockState.removeHabitPlan = jest.fn(async (id: string, day: string) => {
      calls.push(`unplan ${day}`);
      if (day === '2026-10-10') return;
      mockState.habitPlans = mockState.habitPlans.filter((p: any) => p.planned_date !== day);
    });
    const out = await applyChange(checked({ mode: 'pause' }), { source: 'chat' });
    expect(out).toMatchObject({ ok: false, reason: 'failed' });
    expect(calls).toEqual([
      `ease pause ${TODAY} ${SUN}`,
      'unplan 2026-10-08',
      'unplan 2026-10-10',
      'plan 2026-10-08',
      'ease back',
    ]);
    expect(mockState.habitAdaptations).toEqual([]);
  });

  it('reports a pause that could not be saved', async () => {
    mockState.easeHabit = jest.fn(async () => {
      throw new Error('offline');
    });
    const out = await applyChange(checked({ mode: 'pause' }), { source: 'chat' });
    expect(out).toMatchObject({ ok: false, reason: 'failed' });
  });
});

describe('today’s plan', () => {
  const ctx = { date: TODAY, threadId: null, hasPlan: true, inPlan: new Set(['h1']) };

  it('lets go of a habit paused over today', async () => {
    const out = await applyCardChanges([checked({ mode: 'pause' })], ctx);
    expect(out.done).toEqual(['c1']);
    expect(out.plan.remove).toEqual(['h1']);
  });

  it('keeps one paused from another day, and one on a lighter version', async () => {
    const ahead = await applyCardChanges(
      [checked({ mode: 'pause', from: '2026-10-08', until: SUN })],
      ctx,
    );
    expect(ahead.done).toEqual(['c1']);
    expect(ahead.plan.remove).toEqual([]);
    mockState.habitAdaptations = [];
    const lighter = await applyCardChanges([checked({ mode: 'lighter' })], ctx);
    expect(lighter.done).toEqual(['c1']);
    expect(lighter.plan.remove).toEqual([]);
  });
});
