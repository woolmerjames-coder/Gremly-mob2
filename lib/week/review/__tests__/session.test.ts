/**
 * The review in hand (lib/week/review/session.ts): which spread it keeps when
 * its row is read or written again, what a spread was asked for, and letting
 * an Undo go. The row is made up.
 */
import {
  dropUndo,
  holdUndo,
  resetWeekSession,
  rowSaved,
  runUndo,
  setReview,
  spreadMade,
  useWeekSession,
} from '../session';
import { reviewWith } from '../../model';
import { SUN, madeUpRow } from './madeUpWeek';

const spread = (made_at: string, basis = 'as the worker words it') =>
  ({
    version: 'week-spread-test',
    made_at,
    basis,
    place: [],
    later: [],
    habit_days: [],
    notes: [],
  }) as any;
const EARLY = '2026-10-04T19:00:00.000Z';
const LATE = '2026-10-04T19:05:00.000Z';
const ASKED = { spread: 'as the app asked', relief: 'as the app asked for relief' };

function inHand(over: Record<string, unknown> = {}) {
  const row = madeUpRow({ status: 'started', answers: { step: 'board' } as any, ...over });
  setReview(row, reviewWith(SUN, 0, row), null);
  return row;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 4, 19, 40, 0));
  resetWeekSession();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('the spread in hand', () => {
  it('is kept with what it was asked for when it comes back', () => {
    const row = inHand();
    useWeekSession.setState({ spreadFailed: true });
    spreadMade(row.id, spread(LATE), ASKED);
    expect(useWeekSession.getState()).toMatchObject({
      spreadFor: ASKED.spread,
      reliefFor: ASKED.relief,
      spreadFailed: false,
    });
    expect(useWeekSession.getState().row?.spread?.made_at).toBe(LATE);
    // one for another review is not this one's
    spreadMade('another-row', spread(LATE, 'x'), { spread: 'x', relief: 'x' });
    expect(useWeekSession.getState().spreadFor).toBe(ASKED.spread);
  });

  it('stands over an older one on the row as written or read again, and gives way to a newer', () => {
    const row = inHand();
    spreadMade(row.id, spread(LATE), ASKED);
    // written with the spread it had before this one came back
    rowSaved({ ...row, spread: spread(EARLY) });
    expect(useWeekSession.getState().row?.spread?.made_at).toBe(LATE);
    expect(useWeekSession.getState().spreadFor).toBe(ASKED.spread);
    // read again with none, and with the same one
    setReview({ ...row, spread: null }, reviewWith(SUN, 0, row), null);
    setReview({ ...row, spread: spread(LATE) }, reviewWith(SUN, 0, row), null);
    expect(useWeekSession.getState().row?.spread?.made_at).toBe(LATE);
    expect(useWeekSession.getState().spreadFor).toBe(ASKED.spread);
    // A newer one from elsewhere is the one in hand, and says for itself what
    // it was made for.
    const newer = '2026-10-04T19:30:00.000Z';
    rowSaved({ ...row, spread: spread(newer) });
    expect(useWeekSession.getState().row?.spread?.made_at).toBe(newer);
    expect(useWeekSession.getState()).toMatchObject({ spreadFor: null, reliefFor: null });
  });

  it('starts from nothing with another review', () => {
    const row = inHand();
    spreadMade(row.id, spread(LATE), ASKED);
    const other = madeUpRow({ id: 'row-2', status: 'started', answers: { step: 'board' } as any });
    setReview(other, reviewWith(SUN, 0, other), null);
    expect(useWeekSession.getState()).toMatchObject({ spreadFor: null, reliefFor: null });
    expect(useWeekSession.getState().row?.spread ?? null).toBeNull();
  });
});

describe('an Undo that has been overtaken', () => {
  it('is let go without being run', async () => {
    const revert = jest.fn(async () => undefined);
    holdUndo('board', revert);
    expect(useWeekSession.getState().undoable).toEqual({ board: true });
    dropUndo('board');
    expect(useWeekSession.getState().undoable).toEqual({});
    expect(await runUndo('board')).toBe(false);
    expect(revert).not.toHaveBeenCalled();
    // letting go of one that is not held changes nothing
    dropUndo('board');
    expect(useWeekSession.getState().undoable).toEqual({});
  });
});
