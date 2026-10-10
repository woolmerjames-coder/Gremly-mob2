/**
 * Saving something new in a chat feeds Gremly the way a drop does.
 *
 * One tap that saves something new counts once, however many things it
 * saves, the way a drop split into pieces counts once. It takes the next place
 * on the day's drop ladder, which drops and chat saves climb together (16% for
 * the first five of the day, then 8%, then 4%; useGremlyStore.creditChatSave),
 * so neither way of saving is worth more than the other.
 *
 * New means a todo, habit or note the person brought: an add on Gremly's card
 * (in Ask Gremly, an item's chat or today's thread) or a new item from the
 * Save items pill. Edits, ticks, moves, conversions, plans, and Worlds or
 * Chapters made in a chat are not new things and do not count.
 */

import { TYPES, type Change } from '../changes/model';
import type { Outcome } from '../changes/apply';
import { withFeedAnimation } from '../brief/feeding';
import { useGremlyStore } from '../store/useGremlyStore';

/** Whether a card's applied rows saved something new. */
export function savedSomethingNew(rows: Change[], outcomes: Outcome[]): boolean {
  const went = new Set(outcomes.filter((o) => o.ok).map((o) => o.cid));
  // an item of theirs (a todo, habit or note), not a World or a Chapter
  const isItem = (r: Change) => !!r.type && Object.prototype.hasOwnProperty.call(TYPES, r.type);
  return rows.some((r) => went.has(r.cid) && r.op === 'add' && isItem(r));
}

/** Feed Gremly for one tap that saved something new, and let him show it. */
export function feedForChatSave(): Promise<void> {
  return withFeedAnimation(() => useGremlyStore.getState().creditChatSave()).catch((err) =>
    console.warn('[ChatSave] could not feed Gremly for the save:', err),
  );
}
