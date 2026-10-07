/**
 * The board as it stands now (lib/week/board/now.ts): whether the spread in
 * hand was made for the answers as they are, whether the board can be
 * finished, and whether Gremly's suggestions still hold. The row is made up;
 * it is Sunday 4 October 2026, planning Monday 5 to Sunday 11.
 */
const mockStore: any = {};
jest.mock('../../../store/useGremlyStore', () => ({
  useGremlyStore: Object.assign((pick: (s: any) => unknown) => pick(mockStore), {
    getState: () => mockStore,
  }),
}));
jest.mock('../../../repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  saveDaysOff: jest.fn(),
  saveWeeklyDay: jest.fn(),
}));

import { boardReady, currentRelief, reliefOf, spreadState } from '../now';
import { reliefBasis, reviewWith, spanDays, spreadBasis } from '../../model';
import { resetWeekSession, setReview, useWeekSession } from '../../review/session';
import { MON, NEXT_SUN, SUN, madeUpRow } from '../../review/__tests__/madeUpWeek';

const DAYS = spanDays(MON, NEXT_SUN);
const base = () => madeUpRow({ status: 'started', answers: { step: 'board' } as any });
const spreadFor = (row: ReturnType<typeof base>, over: Record<string, unknown> = {}) =>
  ({
    version: 'week-spread-test',
    made_at: '2026-10-04T19:45:00.000Z',
    basis: spreadBasis(row.answers, row.read, DAYS, SUN),
    place: [],
    later: [],
    habit_days: [],
    notes: [],
    relief: {
      version: 'week-relief-test',
      basis: reliefBasis(row.answers, row.read, DAYS, SUN),
      days: [],
    },
    ...over,
  }) as any;

function inHand(row: ReturnType<typeof base>) {
  setReview(row, reviewWith(SUN, 0, row), null);
  return useWeekSession.getState();
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 4, 19, 40, 0));
  resetWeekSession();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('what the spread in hand was made for', () => {
  it('is what it says of itself when it was read with its row', () => {
    const row = base();
    const s = inHand({ ...row, spread: spreadFor(row) });
    expect(spreadState(s, SUN)).toMatchObject({ stale: false });
    // their answers have moved on since
    const moved = {
      ...s,
      row: { ...s.row!, answers: { ...s.row!.answers, keep: 'none' as const } },
    };
    expect(spreadState(moved, SUN).stale).toBe(true);
    // and so has the day
    expect(spreadState(s, MON).stale).toBe(true);
  });

  it('is what this app asked for when it asked in this sitting, however the worker words it', () => {
    const row = base();
    const s = inHand({ ...row, spread: spreadFor(row, { basis: 'worded another way' }) });
    expect(spreadState(s, SUN).stale).toBe(true);
    const asked = { ...s, spreadFor: spreadBasis(row.answers, row.read, DAYS, SUN) };
    expect(spreadState(asked, SUN)).toMatchObject({ stale: false, have: asked.spreadFor });
  });

  it('is nothing to be out of date while there is no spread, or no review', () => {
    expect(spreadState(inHand(base()), SUN)).toMatchObject({ have: null, stale: false });
    expect(spreadState({ row: null, on: null, spreadFor: null }, SUN)).toEqual({
      want: null,
      have: null,
      stale: false,
    });
  });
});

describe('whether the board can be finished', () => {
  it('waits for a spread made for these answers, and no longer once one has failed', () => {
    const row = base();
    inHand(row);
    // none yet
    expect(boardReady()).toBe(false);
    useWeekSession.setState({ row: { ...row, spread: spreadFor(row) } });
    expect(boardReady()).toBe(true);
    useWeekSession.setState({ fitting: true });
    expect(boardReady()).toBe(false);
    useWeekSession.setState({ fitting: false, spreadFor: 'other answers' });
    expect(boardReady()).toBe(false);
    // it did not come back: the board is theirs to finish by hand
    useWeekSession.setState({ spreadFailed: true });
    expect(boardReady()).toBe(true);
  });
});

describe('Gremly’s suggestions for over-full days', () => {
  it('hold while they were made for the answers as they stand', () => {
    const row = base();
    const s = inHand({ ...row, spread: spreadFor(row) });
    expect(reliefOf(s, SUN)).not.toBeNull();
    expect(currentRelief()).not.toBeNull();
    // an answer to one of their cards changes nothing; what is kept does
    const relieved = {
      ...s.row!,
      answers: { ...s.row!.answers, relieved: { [MON]: 'left' as const } },
    };
    expect(reliefOf({ ...s, row: relieved }, SUN)).not.toBeNull();
    const freed = { ...s.row!, answers: { ...s.row!.answers, keep: 'none' as const } };
    expect(reliefOf({ ...s, row: freed }, SUN)).toBeNull();
    // asked for in this sitting, it is what the app asked for that counts
    expect(reliefOf({ ...s, reliefFor: 'another' }, SUN)).toBeNull();
    const reworded = {
      ...s.row!,
      spread: spreadFor(row, { relief: { ...s.row!.spread!.relief!, basis: 'x' } }),
    };
    expect(reliefOf({ ...s, row: reworded }, SUN)).toBeNull();
    expect(
      reliefOf(
        { ...s, row: reworded, reliefFor: reliefBasis(row.answers, row.read, DAYS, SUN) },
        SUN,
      ),
    ).not.toBeNull();
  });
});
