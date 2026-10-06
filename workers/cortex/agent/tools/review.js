// ============================================================================
// review.js: the two tools that tell the app something about Gremly's reply
// in the weekly review, rather than read or change anything.
//
// hold keeps the review waiting on the step it is on. After a reply the app
// shows a button that carries the review on, and it never moves on by itself
// (James, 6 Oct); only Gremly knows when what was said has to be settled
// first, and then the button waits until they have answered. How the review's
// part of the prompt says this is measured (brief.js weekContext): telling
// Gremly the button comes first made it ask without holding three times in
// ten, and telling it the button is kept back made it hold plain answers.
//
// offer_week puts the button to their week under the reply. Both are the
// model's decision; no code reads the person's words to make it.
//
// Each hands the loop a signal (run.js), which reaches the app with the reply
// (hold, offer on the brief turn's answer). A reply that comes with a signal
// is the answer: no step is spent after it.
// ============================================================================

import { reviewOn, weekdayOf } from '../../../shared/week.js';
import { obj, str } from './schema.js';

// the tool sets where the weekly day can be moved on the card: today's thread with their week (tools/index.js)
const MOVES_WEEKLY_DAY = ['brief_week', 'brief_week_ease'];

const HOLD = `Make the weekly review wait for their answer to a question you ask in your reply. After a reply the review carries on from the step it is on, and nothing on that step is lost, so most replies need nothing from you. Call this only when your reply ends by asking them something the step cannot be settled without: the review then waits for their answer before it carries on. Give the question your reply asks them, as you asked it. A reply that asks them nothing has no question to give, so it never comes with this, whatever the reply is about. It is between you and the app, so never speak of it in your reply. Only while a weekly review is under way.`;

export const hold = {
  name: 'hold',
  // tells the app about the reply; the loop does not spend a step after it
  signal: true,
  description: HOLD,
  parameters: obj({ question: str('the question your reply asks them, as you asked it') }, [
    'question',
  ]),

  async run(ctx, input = {}) {
    const under = ctx.week?.under_way;
    if (!under || under.step === 'done') return { signal: null, why: 'no_review' };
    const question = String(input.question || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    // nothing asked, nothing to wait for
    if (!question) return { signal: null, why: 'no_question' };
    return { signal: { hold: { question } } };
  },

  render(r) {
    if (r.signal) return 'The review stays on this step until they answer.';
    return r.why === 'no_question'
      ? 'There is no question to wait on, so nothing is held. Leave this out unless your reply asks them something.'
      : 'No weekly review is under way, so there is nothing to hold. Leave this out.';
  },
};

const OFFER = `Put the button to their week under your reply. It opens the weekly review so they can plan their week, or the week they planned once this week's review is done. Call it with your reply when they ask to plan their week, to do their weekly review, or to see the week they planned, on any day. It is for opening the review or the week: a change to either goes on the card and needs no button. What you know about their week says whether this week's review is done and whether the one extra review of the week is still free. In your reply say only what the button opens, never how it works.`;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const offerWeek = {
  name: 'offer_week',
  signal: true,
  description: OFFER,
  parameters: obj({}),

  async run(ctx) {
    const week = ctx.week;
    if (!week) return { signal: null, why: 'no_week' };
    const done = week.review?.status === 'done' && !week.under_way;
    const weekday = weekdayOf(ctx.today);
    return {
      signal: { offer: { kind: 'week', done } },
      // no review can be started today, so the reply has more to say than the
      // button: the loop hands these words back before the turn ends
      more: week.blocked === true,
      // their week is planned, and out of the weekly window with the one extra
      // still free, where the button opens also offers to plan the rest again
      again: done && !week.extra_used && reviewOn(ctx.today, week.weekly_day).kind === 'extra',
      // the day their reviews could move to: today's, unless that is their
      // weekly day already. Only where the weekly day can be moved on the card,
      // which is today's thread (the brief's week variants), not Ask Gremly.
      move_to:
        week.blocked === true &&
        MOVES_WEEKLY_DAY.includes(ctx.surface) &&
        weekday !== week.weekly_day
          ? weekday
          : null,
    };
  },

  render(r) {
    if (!r.signal)
      return 'Their week is not known here, so there is no button to put. Leave this out.';
    const button = !r.signal.offer.done
      ? 'The button is under your reply. It reads Plan your week and opens the weekly review.'
      : r.again
        ? 'The button is under your reply. It reads Your week and opens the week they planned, where the rest of this week can also be planned again from a fresh look, once.'
        : 'The button is under your reply. It reads Your week and opens the week they planned.';
    if (!r.more) return button;
    const move =
      r.move_to == null
        ? ''
        : ` and put the move of their weekly day to ${WEEKDAY_NAMES[r.move_to]} on the card with propose_changes, as an offer they can turn down`;
    return `${button} It cannot start another review today, because the one extra review of the week is used. When a review is what they asked for, say so plainly with when the next one is${move}.`;
  },
};
