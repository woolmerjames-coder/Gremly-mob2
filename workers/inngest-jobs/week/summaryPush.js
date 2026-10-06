/**
 * The one push of their weekly day: it tells them their week in review is
 * ready and, while the weekly review of the week ahead is still to do, that
 * Gremly is ready to plan that week with them. One push for both, at their
 * summary time (the weekly review's promotion).
 *
 * The words are the notification writer's (notifications/copy.js, good_news):
 * here are only the facts it is given, and the title used when it cannot be
 * reached. Once the review is done (brought forward the day before) or they
 * said not this week, the push is about the summary alone, as it always was.
 * It is about the summary alone too when the review could not be read: the
 * push never invites them to plan a week that may already be planned.
 */

import { addDays } from '../../shared/week.js';
import { db } from '../context/db';

/** The fixed title, for when the writer's own words cannot be used. */
export const SUMMARY_PUSH_TITLE = 'Your week in review is ready';

/** What reviewAheadStatus answers when the review could not be read. */
export const REVIEW_UNREAD = 'unread';

/**
 * What the push is about.
 * @param {string|null} reviewStatus the status of the review of the week
 *   ahead, null when it has no row yet, or REVIEW_UNREAD
 */
export function summaryPushData(reviewStatus) {
  // still to do: not begun (no row, or ready) or begun and left
  const reviewToDo = reviewStatus == null || reviewStatus === 'ready' || reviewStatus === 'started';
  return {
    title: SUMMARY_PUSH_TITLE,
    // both are what is ready, so both are said: one fact, with two things in it
    facts: {
      ready: reviewToDo
        ? ['their week in review', 'planning the week ahead with Gremly, in their weekly review']
        : 'their week in review',
    },
  };
}

/**
 * The status of the review of the week that starts the day after a summary's
 * week ends, or null when there is none.
 * @param {string} weekEnd the last day of the week the summary covers (their weekly day)
 */
export async function reviewAheadStatus(env, userId, weekEnd) {
  const rows = await db(env).select(
    `weekly_reviews?owner_id=eq.${userId}&week_start=eq.${addDays(weekEnd, 1)}&select=status&limit=1`,
  );
  return rows?.[0]?.status ?? null;
}
