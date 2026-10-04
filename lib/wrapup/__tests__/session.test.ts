/**
 * The wrap up while the app is open (lib/wrapup/session): each change is in
 * the state at once and saved to the thread in order, and each Undo is held
 * until it is used.
 */
jest.mock('../../repo/dailyThreadRepo', () => ({ patchDailyThreadMeta: jest.fn() }));
jest.mock('../../brief/todayThread', () => ({
  useTodayThread: { getState: () => ({ patchMeta: jest.fn() }) },
}));

import { patchDailyThreadMeta } from '../../repo/dailyThreadRepo';
import {
  canUndo,
  cardsOpened,
  currentWrap,
  loadWrap,
  recordDecision,
  resetWrapSession,
  undoDecision,
  updateWrap,
  useWrapSession,
  wrapSaved,
} from '../session';
import { newWrapState } from '../state';
import type { SweepRecord } from '../../changes/sweep';

const patch = patchDailyThreadMeta as jest.Mock;
const AT = '2026-09-30T20:40:00.000Z';

function rec(id: string, cid = `c-${id}`): SweepRecord {
  return { cid, op: 'keep', type: 'todo', id, title: id, out: 'kept', label: 'Kept', at: AT };
}

beforeEach(() => {
  resetWrapSession();
  patch.mockResolvedValue(null);
});

describe('the wrap up session', () => {
  it('takes the state from the thread once, then keeps its own copy', () => {
    loadWrap('t1', newWrapState(AT, ['a']));
    updateWrap((w) => (w ? { ...w, step: 'habits' } : w));
    // the thread on screen again with what it had when it was read
    loadWrap('t1', newWrapState(AT, ['a']));
    expect(currentWrap()?.step).toBe('habits');
    // another day's thread starts clean
    loadWrap('t2', null);
    expect(currentWrap()).toBeNull();
  });

  it('saves each change to the thread, in order', async () => {
    loadWrap('t1', null);
    let release: () => void = () => undefined;
    patch.mockImplementationOnce(() => new Promise((r) => (release = () => r(null))));
    updateWrap(() => newWrapState(AT, ['a']));
    updateWrap((w) => (w ? { ...w, step: 'cards' } : w));
    await Promise.resolve();
    expect(patch).toHaveBeenCalledTimes(1);
    release();
    await wrapSaved();
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1]).toEqual([
      't1',
      { sweep: expect.objectContaining({ step: 'cards' }) },
    ]);
  });

  it('carries on saving after a write fails', async () => {
    loadWrap('t1', null);
    patch.mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    updateWrap(() => newWrapState(AT, []));
    updateWrap((w) => (w ? { ...w, step: 'close' } : w));
    await wrapSaved();
    expect(patch).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('records a decision with its Undo, and counts it for this visit to the cards', async () => {
    loadWrap('t1', newWrapState(AT, ['a', 'b']));
    cardsOpened();
    const revert = jest.fn().mockResolvedValue(undefined);
    recordDecision(rec('a'), revert);
    expect(currentWrap()?.decisions).toHaveLength(1);
    expect(useWrapSession.getState().cardsDecided).toBe(1);
    expect(canUndo('c-a')).toBe(true);

    expect(await undoDecision('c-a')).toBe(true);
    expect(revert).toHaveBeenCalledTimes(1);
    expect(currentWrap()?.decisions[0].undone_at).toBeTruthy();
    // an Undo runs once
    expect(await undoDecision('c-a')).toBe(false);
    expect(revert).toHaveBeenCalledTimes(1);
  });

  it('keeps the Undo when putting back fails, and leaves the decision standing', async () => {
    loadWrap('t1', newWrapState(AT, ['a']));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    recordDecision(rec('a'), jest.fn().mockRejectedValue(new Error('offline')));
    expect(await undoDecision('c-a')).toBe(false);
    expect(canUndo('c-a')).toBe(true);
    expect(currentWrap()?.decisions[0].undone_at).toBeUndefined();
    warn.mockRestore();
  });

  it('lets go of the earlier Undo when an item is decided again', () => {
    loadWrap('t1', newWrapState(AT, ['a']));
    recordDecision(rec('a', 'c1'), jest.fn());
    recordDecision(rec('a', 'c2'), jest.fn());
    expect(canUndo('c1')).toBe(false);
    expect(canUndo('c2')).toBe(true);
    expect(currentWrap()?.decisions.map((d) => d.cid)).toEqual(['c2']);
  });
});
