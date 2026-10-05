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

const HOLD = `Make the weekly review wait for their answer to a question you ask in your reply. After a reply the review carries on from the step it is on, and nothing on that step is lost, so most replies need nothing from you. Call this only when your reply ends by asking them something the step cannot be settled without: the review then waits for their answer before it carries on. Say in a few plain words what you asked. Never call it with a reply that asks them nothing, whatever the reply is about. It is between you and the app, so never speak of it in your reply. Only while a weekly review is under way.`;

export const hold = {
  name: 'hold',
  // tells the app about the reply; the loop does not spend a step after it
  signal: true,
  description: HOLD,
  parameters: obj({ about: str('in a few plain words, what you asked them') }, ['about']),

  async run(ctx, input = {}) {
    const under = ctx.week?.under_way;
    if (!under || under.step === 'done') return { signal: null, why: 'no_review' };
    const about = String(input.about || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    return { signal: { hold: { about } } };
  },

  render(r) {
    return r.signal
      ? 'The review stays on this step until they answer.'
      : 'No weekly review is under way, so there is nothing to hold. Leave this out.';
  },
};

const OFFER = `Put the button to their week under your reply. It opens the weekly review so they can plan their week, or the week they planned once this week's review is done. Call it with your reply when they ask to plan their week, to do their weekly review, or to see the week they planned, on any day. It is for opening the review or the week, so a change to either, such as moving the weekly day, needs no button. What you know about their week says whether this week's review is done and whether the one extra review of the week is still free. In your reply say only what the button opens, never how it works.`;

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
    return {
      signal: { offer: { kind: 'week', done } },
      // no review can be started today, so the reply has more to say than the
      // button: the loop hands these words back before the turn ends
      more: week.blocked === true,
      weekday: weekdayOf(ctx.today),
    };
  },

  render(r) {
    if (!r.signal)
      return 'Their week is not known here, so there is no button to put. Leave this out.';
    if (r.more) {
      return `The button is under your reply. It reads Your week and opens the week they planned. It cannot start another review today, because the one extra review of the week is used. When a review is what they asked for, say so plainly with when the next one is, and put the move of their weekly day to ${WEEKDAY_NAMES[r.weekday]} on the card with propose_changes, as an offer they can turn down.`;
    }
    return r.signal.offer.done
      ? 'The button is under your reply. It reads Your week and opens the week they planned.'
      : 'The button is under your reply. It reads Plan your week and opens the weekly review.';
  },
};
