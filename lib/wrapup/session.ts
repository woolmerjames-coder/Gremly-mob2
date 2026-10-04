/**
 * The wrap up while the app is open.
 *
 * Tonight's state lives on today's thread (DailyThreadMeta.sweep). This holds
 * the copy being worked on, saves each step of it to the thread in order, and
 * keeps what cannot be saved: the Undo for each change made tonight, which is
 * a function and so lasts only as long as the app stays open (the same as
 * every other Undo in the app).
 *
 * The cards screen and the thread both work through here, so a decision made
 * on a card is in the thread's state at once, wherever the person goes next.
 */
import { create } from 'zustand';
import { patchDailyThreadMeta } from '../repo/dailyThreadRepo';
import { useTodayThread } from '../brief/todayThread';
import { getDateService } from '../date/DateService';
import type { WrapUpState } from '../brief/types';
import type { SweepRecord } from '../changes/sweep';
import { withDecision, withUndone } from './state';

export type Awaiting = 'journal' | 'question' | null;

interface WrapSession {
  threadId: string | null;
  wrap: WrapUpState | null;
  /** What the next typed message is, when the wrap up is waiting for one */
  awaiting: Awaiting;
  /** Keys whose Undo is still held (a decision's cid, or still, journal, habits) */
  undoable: Record<string, true>;
  /** Decisions made since the cards were last opened */
  cardsDecided: number;
  /** The cards are on screen */
  cardsOpen: boolean;
}

export const useWrapSession = create<WrapSession>(() => ({
  threadId: null,
  wrap: null,
  awaiting: null,
  undoable: {},
  cardsDecided: 0,
  cardsOpen: false,
}));

const reverts = new Map<string, () => Promise<void>>();
let queue: Promise<unknown> = Promise.resolve();

/** Save the state to the thread, one write after another so none overtakes an earlier one. */
function persist(threadId: string, wrap: WrapUpState | null): void {
  useTodayThread.getState().patchMeta(threadId, { sweep: wrap });
  queue = queue
    .then(() => patchDailyThreadMeta(threadId, { sweep: wrap }))
    .catch((err) => console.warn('[WrapUp] could not save the wrap up to the thread:', err));
}

/** Resolves once every state change so far is saved (tests, and before leaving). */
export function wrapSaved(): Promise<unknown> {
  return queue;
}

/**
 * Today's thread is on screen with this state. A thread already being worked
 * on keeps the copy here, which is never behind what was saved.
 */
export function loadWrap(threadId: string, wrap: WrapUpState | null | undefined): void {
  const s = useWrapSession.getState();
  if (s.threadId === threadId) return;
  reverts.clear();
  useWrapSession.setState({
    threadId,
    wrap: wrap ?? null,
    awaiting: null,
    undoable: {},
    cardsDecided: 0,
    cardsOpen: false,
  });
}

/** Change tonight's state and save it. Returns the new state. */
export function updateWrap(
  change: (wrap: WrapUpState | null) => WrapUpState | null,
): WrapUpState | null {
  const s = useWrapSession.getState();
  if (!s.threadId) return s.wrap;
  const next = change(s.wrap);
  useWrapSession.setState({ wrap: next });
  persist(s.threadId, next);
  return next;
}

export function currentWrap(): WrapUpState | null {
  return useWrapSession.getState().wrap;
}

export function setAwaiting(awaiting: Awaiting): void {
  useWrapSession.setState({ awaiting });
}

/** Keep an Undo, by key. */
export function holdUndo(key: string, revert: () => Promise<void>): void {
  reverts.set(key, revert);
  useWrapSession.setState((s) => ({ undoable: { ...s.undoable, [key]: true } }));
}

export function canUndo(key: string): boolean {
  return reverts.has(key);
}

/** Run an Undo once. False when it is no longer held, or it failed (it is kept then). */
export async function runUndo(key: string): Promise<boolean> {
  const revert = reverts.get(key);
  if (!revert) return false;
  try {
    await revert();
  } catch (err) {
    console.warn('[WrapUp] an Undo failed:', key, err);
    return false;
  }
  reverts.delete(key);
  useWrapSession.setState((s) => {
    const undoable = { ...s.undoable };
    delete undoable[key];
    return { undoable };
  });
  return true;
}

/** The cards are opening: count this visit's decisions from none. */
export function cardsOpened(): void {
  useWrapSession.setState({ cardsOpen: true, cardsDecided: 0 });
}

export function cardsClosed(): void {
  useWrapSession.setState({ cardsOpen: false });
}

/** A card's decision, saved: into tonight's state, with its Undo. */
export function recordDecision(record: SweepRecord, revert: () => Promise<void>): void {
  const s = useWrapSession.getState();
  // an earlier decision on the same item is replaced, and its Undo goes with it
  for (const d of s.wrap?.decisions ?? []) {
    if (d.id === record.id) reverts.delete(d.cid);
  }
  holdUndo(record.cid, revert);
  useWrapSession.setState((x) => ({ cardsDecided: x.cardsDecided + 1 }));
  updateWrap((wrap) => (wrap ? withDecision(wrap, record) : wrap));
}

/** Put one decision back. */
export async function undoDecision(cid: string): Promise<boolean> {
  if (!(await runUndo(cid))) return false;
  updateWrap((wrap) => (wrap ? withUndone(wrap, cid, getDateService().nowTimestamp()) : wrap));
  return true;
}

/** Tests only. */
export function resetWrapSession(): void {
  reverts.clear();
  queue = Promise.resolve();
  useWrapSession.setState({
    threadId: null,
    wrap: null,
    awaiting: null,
    undoable: {},
    cardsDecided: 0,
    cardsOpen: false,
  });
}
