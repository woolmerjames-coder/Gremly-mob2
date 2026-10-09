/**
 * The steps left on a closed Chapter (Worlds rebuild): they stay with it and
 * leave every list of the day. The app leaves them out of Today, Sweep and
 * the wrap up (lib/store/selectors.ts selectStepsOnClosedChapters); here the
 * same rule for what Gremly reads of the day: the morning's picture, the day
 * and the week the agent looks at. Bringing one back from the Chapter's page
 * takes it out of the Chapter, so it is on the day again.
 */

const MOST = 500;

/**
 * The ids of the todos filed in one of their closed Chapters. Never throws:
 * unread, nothing is left out and the day reads as it did before.
 * @param {{ select: (path: string) => Promise<any[]> }} d
 * @param {string} userId
 * @returns {Promise<Set<string>>}
 */
export async function stepsOnClosedChapters(d, userId) {
  try {
    const closed = await d.select(
      `chapters?owner_id=eq.${userId}&or=(phase.eq.closed,closed_at.not.is.null)&select=id&limit=${MOST}`,
    );
    const ids = (closed || []).map((c) => c.id).filter(Boolean);
    if (!ids.length) return new Set();
    const links = await d.select(
      `drop_chapter_links?owner_id=eq.${userId}&drop_type=eq.todo&chapter_id=in.(${ids.join(',')})&select=drop_id&limit=5000`,
    );
    return new Set((links || []).map((l) => l.drop_id).filter(Boolean));
  } catch (err) {
    console.warn(`[closedSteps] could not read closed Chapters: ${err?.message || err}`);
    return new Set();
  }
}

/** Rows without the ones left on a closed Chapter. Pure. */
export function withoutClosedSteps(rows, left) {
  const list = Array.isArray(rows) ? rows : [];
  return left?.size ? list.filter((r) => !left.has(r?.id)) : list;
}
