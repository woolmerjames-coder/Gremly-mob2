/**
 * A milestone's check ins in the evening wrap up (the weekly review).
 *
 * A milestone set up in a weekly review can hold moments when Gremly asks how
 * it is going, each with its day, kept on that week's review
 * (weekly_reviews.checkins). On its day a check in is one of tonight's
 * questions, asked before Gremly's own. The answer is typed, and is saved as a
 * goal check in in their journal; the check in is then marked done. Skipped,
 * it is marked so and not asked again. What settles it is kept on the
 * question's message (milestone_checkin), so it is settled the same when the
 * app was closed between the question and the answer.
 *
 * One missed because no wrap up was done that evening is asked at the next
 * wrap up, up to CHECKIN_LATE_DAYS later, so it is not lost to one quiet night.
 *
 * Which check ins are asked is decided by dates and what is still open, never
 * by anyone's words. Gremly's words here are fixed.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDueCheckIns, settleCheckIn, type DueCheckIn } from '../repo/weekReviewRepo';
import { addDays } from '../week/model';
import { useThisWeek } from '../week/thisWeek';
import { rowSaved } from '../week/review/session';
import { saveCheckIn } from './journal';
import type { WrapQuestion } from './questions';
import type { BriefOfferMeta } from '../brief/types';

/** A check in as its question's message keeps it: enough to save the answer and settle it. */
export type AskedCheckIn = NonNullable<BriefOfferMeta['milestone_checkin']>;

/** How many days after its day a check in is still asked. */
export const CHECKIN_LATE_DAYS = 3;
/** The most check ins asked in one evening. */
export const MOST_CHECKINS = 2;

const PREFIX = 'checkin:';

/** Whether a question is a milestone's check in rather than one of Gremly's own. */
export function isCheckIn(q: Pick<WrapQuestion, 'checkin'> | null | undefined): boolean {
  return !!q?.checkin;
}

/** What Gremly asks for a check in: the goal in their words, in a fixed sentence. */
export function checkInAsk(goal: string): string {
  return `You set a check in on “${goal}”. How is it going?`;
}

/** A check in as one of tonight's questions: answered by typing, or skipped. */
export function checkInQuestion(c: DueCheckIn): WrapQuestion {
  return {
    id: `${PREFIX}${c.id}`,
    question: checkInAsk(c.goal),
    choices: [],
    created_at: c.date,
    asked_at: null,
    record_table: null,
    record_id: null,
    private: false,
    checkin: c,
  };
}

/** Tonight's check ins as questions: the ones due today, and any missed in the last few days. */
export async function fetchCheckInQuestions(day: string): Promise<WrapQuestion[]> {
  const userId = (useGremlyStore.getState() as any).userId as string | null;
  if (!userId) return [];
  const due = await getDueCheckIns(userId, addDays(day, -CHECKIN_LATE_DAYS), day);
  return due.slice(0, MOST_CHECKINS).map(checkInQuestion);
}

/** The app's copies of a review follow a write to it (it keeps this week's, and the one under way). */
function keepInStep(saved: Awaited<ReturnType<typeof settleCheckIn>>) {
  if (!saved) return;
  useThisWeek.getState().setReview(saved);
  rowSaved(saved);
}

/**
 * Their answer to a check in: written to their journal as a goal check in,
 * then the check in is marked done. False when the journal entry could not be
 * saved; the check in stays open then, to be asked again.
 */
export async function answerCheckIn(c: AskedCheckIn, text: string): Promise<boolean> {
  const saved = await saveCheckIn({
    text,
    moods: [],
    goal: { goal_id: `milestone:${c.id}`, goal_name: c.goal },
    milestone: { date: c.goal_date, checkin_id: c.id },
  });
  if (!saved.ok) return false;
  try {
    keepInStep(await settleCheckIn(c.row_id, c.id, 'done'));
  } catch (err) {
    // their words are in the journal; only the mark was not kept, so it may be asked once more
    console.warn('[WrapUp] the check in is saved but could not be marked done:', err);
  }
  return true;
}

/** They passed on a check in: marked skipped, so it is not asked again. */
export async function skipCheckIn(c: AskedCheckIn): Promise<void> {
  keepInStep(await settleCheckIn(c.row_id, c.id, 'skipped'));
}
