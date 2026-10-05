/**
 * How a chat thread follows what is added to it (Ask Gremly and today's
 * thread), so it never pulls the reader away from what they are reading.
 *
 * The thread follows only while the reader is at the bottom. When something
 * is added it scrolls to the end, but never past the top of the first line
 * the reader has not seen yet: a long line is read from its start, and they
 * carry on at their own pace. While they are scrolled up nothing moves, and
 * the screen shows that there is more below. Pure, so it can be tested.
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

/** Who added the rows since the last look: them (something they sent or tapped), or Gremly. */
export function addedBy(rows: { role: string }[], from: number): 'them' | 'gremly' | null {
  const added = rows.slice(from);
  if (!added.length) return null;
  return added.some((r) => r.role === 'user') ? 'them' : 'gremly';
}
