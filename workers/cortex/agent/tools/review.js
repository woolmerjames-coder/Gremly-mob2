// ============================================================================
// review.js: the two tools that tell the app something about Gremly's reply
// in the weekly review, rather than read or change anything.
//
// hold keeps the review on the step it is on: the review moves on by itself
// after a reply, and only Gremly knows when what was said has to be settled
// first. offer_week puts the button to their week under the reply. Both are
// the model's decision; no code reads the person's words to make it.
//
// Each hands the loop a signal (run.js), which reaches the app with the reply
// (hold, offer on the brief turn's answer). A reply that comes with a signal
// is the answer: no step is spent after it.
// ============================================================================

import { weekdayOf } from '../../../shared/week.js';
import { obj, str } from './schema.js';

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
      ? 'There is no question to wait on, so the review carries on. Leave this out unless your reply asks them something.'
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
      // the day their reviews could move to: today's, unless that is their weekly day already
      move_to: week.blocked === true && weekday !== week.weekly_day ? weekday : null,
    };
  },

  render(r) {
    if (!r.signal)
      return 'Their week is not known here, so there is no button to put. Leave this out.';
    const button = r.signal.offer.done
      ? 'The button is under your reply. It reads Your week and opens the week they planned.'
      : 'The button is under your reply. It reads Plan your week and opens the weekly review.';
    if (!r.more) return button;
    const move =
      r.move_to == null
        ? ''
        : ` and put the move of their weekly day to ${WEEKDAY_NAMES[r.move_to]} on the card with propose_changes, as an offer they can turn down`;
    return `${button} It cannot start another review today, because the one extra review of the week is used. When a review is what they asked for, say so plainly with when the next one is${move}.`;
  },
};
