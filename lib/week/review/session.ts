/**
 * The weekly review while the app is open.
 *
 * The review's own state lives on its row (weekly_reviews): the read, the
 * answers and where it has got to. This holds the copy being worked on, what
 * the cards hold before a step is settled (the draft), and what cannot be
 * saved: the Undo for a milestone set up in this sitting, which is a function
 * and so lasts only as long as the app stays open, like every other Undo.
 *
 * The cards and the hook (lib/week/useWeekReview.ts) both work through here,
 * and so do the week's own changes when Gremly's card writes to the same row
 * (lib/changes/week.ts), so every part of the screen sees one week.
 */
import { create } from 'zustand';
import type { WeekReviewRow } from '../../repo/weekReviewRepo';
import type { WeekHours } from '../model';
import { daysPlanned, draftFor, type ChatStep, type ReviewOn, type WeekDraft } from './state';

export interface WeekSession {
  /** The thread the review is in, when today's thread is on screen */
  threadId: string | null;
  /** The review's row, with its read and its answers */
  row: WeekReviewRow | null;
  /** What the review is by the dates */
  on: ReviewOn | null;
  /** Last week's free hours, which the shape starts from */
  lastHours: WeekHours | null;
  /** What the cards hold before a step is settled */
  draft: WeekDraft | null;
  /** The read is being made, behind the loading card */
  loading: boolean;
  /** A settled step's card opened again with Change */
  editing: ChatStep | null;
  /** The needs you card opened to talk through (an index into the read's) */
  talking: number | null;
  /** The question Gremly's last reply left the review waiting on */
  hold: string | null;
  /** They said Not quite, and what they type next is what Gremly has wrong */
  fixing: boolean;
  /** The review was finished in this sitting, in this thread */
  finishedHere: boolean;
  /**
   * The thread went off the screen while the review was adding to it, so what
   * it had to add is not there: it is picked up when the thread is back
   */
  left: boolean;
  /** Milestones whose set up can still be undone, by key */
  undoable: Record<string, true>;
}

const EMPTY: WeekSession = {
  threadId: null,
  row: null,
  on: null,
  lastHours: null,
  draft: null,
  loading: false,
  editing: null,
  talking: null,
  hold: null,
  fixing: false,
  finishedHere: false,
  left: false,
  undoable: {},
};

export const useWeekSession = create<WeekSession>(() => ({ ...EMPTY }));

const reverts = new Map<string, () => Promise<void>>();

/**
 * Today's thread is on screen: the review in hand is that thread's. It is
 * kept while another chat is looked at (and while another chat screen is open
 * over this one), so coming back finds the cards as they were; only another
 * day's thread starts from nothing.
 */
export function loadWeekSession(threadId: string): void {
  if (useWeekSession.getState().threadId === threadId) return;
  reverts.clear();
  useWeekSession.setState({ ...EMPTY, threadId });
}

/** A review is in hand: its row, what it is, and what its cards start from. */
export function setReview(
  row: WeekReviewRow | null,
  on: ReviewOn | null,
  lastHours?: WeekHours | null,
): void {
  const s = useWeekSession.getState();
  const hours = lastHours === undefined ? s.lastHours : lastHours;
  const sameWeek = !!row && s.row?.week_start === row.week_start && !!s.draft;
  useWeekSession.setState({
    row,
    on,
    lastHours: hours,
    // a draft in hand is kept: what they picked is not lost when the row is read again
    draft: sameWeek ? s.draft : row && on ? draftFor(row, daysPlanned(on), hours) : null,
  });
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The row as it was just written (by the review, or by a change Gremly's card applied). */
export function rowSaved(saved: WeekReviewRow): void {
  const s = useWeekSession.getState();
  if (!s.row || s.row.id !== saved.id) return;
  let draft = s.draft;
  if (draft && s.on) {
    // a change to the week's shape made on Gremly's card shows on the shape's card too
    const fresh = draftFor(saved, daysPlanned(s.on), s.lastHours);
    if (!same(s.row.answers.hours, saved.answers.hours)) draft = { ...draft, hours: fresh.hours };
    if (!same(s.row.answers.busy_days, saved.answers.busy_days)) {
      draft = { ...draft, busy: fresh.busy };
    }
  }
  useWeekSession.setState({ row: saved, draft });
}

export function patchDraft(change: (d: WeekDraft) => WeekDraft): void {
  const d = useWeekSession.getState().draft;
  if (d) useWeekSession.setState({ draft: change(d) });
}

export function patchSession(patch: Partial<WeekSession>): void {
  useWeekSession.setState(patch);
}

/** Keep an Undo, by key. */
export function holdUndo(key: string, revert: () => Promise<void>): void {
  reverts.set(key, revert);
  useWeekSession.setState((s) => ({ undoable: { ...s.undoable, [key]: true } }));
}

/** Run an Undo once. False when it is no longer held, or it failed (it is kept then). */
export async function runUndo(key: string): Promise<boolean> {
  const revert = reverts.get(key);
  if (!revert) return false;
  try {
    await revert();
  } catch (err) {
    console.warn('[Week] an Undo failed:', key, err);
    return false;
  }
  reverts.delete(key);
  useWeekSession.setState((s) => {
    const undoable = { ...s.undoable };
    delete undoable[key];
    return { undoable };
  });
  return true;
}

/** Tests only. */
export function resetWeekSession(): void {
  reverts.clear();
  useWeekSession.setState({ ...EMPTY });
}
