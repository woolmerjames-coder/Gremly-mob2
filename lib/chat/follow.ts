/**
 * How a chat thread follows what is added to it (Ask Gremly and today's
 * thread), so it never pulls the reader away from what they are reading.
 *
 * The thread follows only while the reader is at the bottom. When something
 * is added it scrolls to the end, but never past the top of the first line
 * the reader has not seen yet: a long line is read from its start, and they
 * carry on at their own pace. While they are scrolled up nothing moves, and
 * the screen shows that there is more below: a pill that says Gremly replied
 * when a reply of his is among what they have not seen, and Latest otherwise.
 * Pure, so it can be tested.
 */

/** How close to the end still counts as at the bottom, in points. */
export const NEAR_BOTTOM = 96;

export interface ThreadMetrics {
  /** How far it is scrolled */
  y: number;
  /** The height of the list on screen */
  height: number;
  /** The height of everything in it */
  content: number;
}

export function nearBottom(m: ThreadMetrics, slack = NEAR_BOTTOM): boolean {
  return m.content - (m.y + m.height) <= slack;
}

/**
 * Where to scroll when the thread grows: the end, unless the end would carry
 * the top of the first unseen line (anchorTop) off the screen, then just to it.
 */
export function followOffset(
  m: Pick<ThreadMetrics, 'height' | 'content'>,
  anchorTop: number | null,
  margin = 8,
): number {
  const end = Math.max(0, m.content - m.height);
  if (anchorTop === null) return end;
  return Math.max(0, Math.min(end, anchorTop - margin));
}

/** What the pill over a thread says is below the fold: a reply of Gremly's, or only the latest. */
export type Below = 'reply' | 'latest';

/** How much of what was added has to be in view for the reader to have seen it start, in points. */
export const REPLY_PEEK = 40;

/**
 * Whether what was just added starts below the fold: its top is out of view,
 * or only its first few points are in it.
 * @param start where what was added begins in the thread
 * @param m where the thread is scrolled to, and how much of it is on screen
 */
export function startsBelow(
  start: number,
  m: Pick<ThreadMetrics, 'y' | 'height'>,
  peek = REPLY_PEEK,
): boolean {
  return start > m.y + m.height - peek;
}

/**
 * What is below, once the thread has grown past what the reader can see.
 * It is a reply when one of Gremly's own messages is among the rows just
 * added and they start below the fold, so the reader cannot have seen it. A
 * card, an offer or a note of what changed is not a reply, and a reply whose
 * start is in view has been seen: the rest of it is only the latest. Once a
 * reply is below it stays the thing to say until they reach it, whatever is
 * added after.
 * @param from how many rows the thread had at the last look
 * @param was what the pill said before, null when it was not showing
 * @param hidden what was added starts below the fold (startsBelow)
 */
export function belowFor(
  rows: { role: string }[],
  from: number,
  was: Below | null,
  hidden: boolean,
): Below {
  if (was === 'reply') return 'reply';
  return hidden && rows.slice(from).some((r) => r.role === 'assistant') ? 'reply' : 'latest';
}

/** Who added the rows since the last look: them (something they sent or tapped), or Gremly. */
export function addedBy(rows: { role: string }[], from: number): 'them' | 'gremly' | null {
  const added = rows.slice(from);
  if (!added.length) return null;
  return added.some((r) => r.role === 'user') ? 'them' : 'gremly';
}
