/**
 * What happens after a tap on one of the brief's buttons, worked out without
 * side effects so it can be tested: the reply shown as the person's message,
 * and the Gremly lines, event lines and offers that follow. The hook
 * (useBriefOffers) saves them and does the work (saving an answer, opening
 * Sweep, planning).
 *
 * Gremly's words here are fixed: they answer a tap, so they never need a
 * model. Copy follows the approved prototype.
 */

import type {
  BriefEventMeta,
  BriefOfferMeta,
  BriefReplyMeta,
  BriefTextMeta,
  DayPart,
  OfferButton,
} from './types';
import { dayPartAt } from './messages';

export const BRIEF_COPY = {
  answered: "Got it, thanks. I'll update everything to match.",
  answerFailed: "I couldn't save that just now, so I'll ask again another time.",
  saved: 'Saved your answer',
  skipped: "No problem, I'll ask another time.",
  notToday: "No problem. I'm here if you change your mind.",
  thanks: 'Any time.',
  justToday: "Then let's keep it to today.",
  catchUpFallback: "Everything that was waiting is still in Sweep, and nothing's been lost.",
  answerPlaceholder: 'Type your answer…',
} as const;

/** "Plan my day" before noon, "Plan my afternoon" until 5pm, then "Plan my evening" (the worker's rule). */
export function planLabel(gapStartMinutes: number): string {
  if (gapStartMinutes < 12 * 60) return 'Plan my day';
  if (gapStartMinutes < 17 * 60) return 'Plan my afternoon';
  return 'Plan my evening';
}

function partWord(gapStartMinutes: number): string {
  if (gapStartMinutes < 12 * 60) return 'day';
  if (gapStartMinutes < 17 * 60) return 'afternoon';
  return 'evening';
}

export type BriefStep =
  | { role: 'user'; content: string; meta: BriefReplyMeta }
  | { role: 'assistant'; content: string; meta: BriefTextMeta }
  | { role: 'system'; content: string; meta: BriefEventMeta }
  | { role: 'assistant'; content: string; meta: BriefOfferMeta };

/** The person's tap, as their message. */
export function replyStep(button: OfferButton, briefId?: string): BriefStep {
  return {
    role: 'user',
    content: button.label,
    meta: { type: 'brief-reply', button_id: button.id, action: button.action, brief_id: briefId },
  };
}

/** A typed answer to Gremly's question, as their message. */
export function typedAnswerStep(text: string, briefId?: string): BriefStep {
  return {
    role: 'user',
    content: text,
    meta: { type: 'brief-reply', button_id: 'answer_other', action: 'answer', brief_id: briefId },
  };
}

export function gremlyStep(text: string, part: DayPart, briefId?: string): BriefStep {
  return {
    role: 'assistant',
    content: text,
    meta: { type: 'brief-text', part, ids: [], brief_id: briefId },
  };
}

/**
 * Gremly's reply to the habit check in. With week, the habit's week is drawn
 * under it: a dot for each day of the week that day is in.
 */
export function checkInReplyStep(
  text: string,
  part: DayPart,
  briefId: string | undefined,
  week: { habit_id: string; day: string } | null,
): BriefStep {
  return {
    role: 'assistant',
    content: text,
    meta: {
      type: 'brief-text',
      part,
      ids: [],
      brief_id: briefId,
      ...(week ? { habit_week: week } : {}),
    },
  };
}

/**
 * The brief's own offer, once the habit check in that rode on it is settled:
 * the same words and buttons, as a new message, with the check in gone.
 */
export function afterCheckInStep(row: {
  id: string;
  content: string;
  meta: BriefOfferMeta;
}): BriefStep {
  const rest: Partial<BriefOfferMeta> = { ...row.meta };
  delete rest.held;
  delete rest.chosen;
  delete rest.type;
  delete rest.checkin;
  return offerStep(row.content, {
    ...(rest as Omit<BriefOfferMeta, 'type'>),
    revealed_from: row.id,
  });
}

export function eventStep(text: string, icon: BriefEventMeta['icon'], briefId?: string): BriefStep {
  return { role: 'system', content: text, meta: { type: 'brief-event', icon, brief_id: briefId } };
}

export function offerStep(content: string, meta: Omit<BriefOfferMeta, 'type'>): BriefStep {
  return { role: 'assistant', content, meta: { ...meta, type: 'brief-offer' } };
}

/** The question was answered (or saving the answer failed). */
export function afterAnswer(saved: boolean, part: DayPart, briefId?: string): BriefStep[] {
  return saved
    ? [
        gremlyStep(BRIEF_COPY.answered, part, briefId),
        eventStep(BRIEF_COPY.saved, 'saved', briefId),
      ]
    : [gremlyStep(BRIEF_COPY.answerFailed, part, briefId)];
}

export function afterSkip(part: DayPart, briefId?: string): BriefStep[] {
  return [gremlyStep(BRIEF_COPY.skipped, part, briefId)];
}

/** The held offer, shown again after the question: same words and buttons. */
export function revealStep(held: { id: string; content: string; meta: BriefOfferMeta }): BriefStep {
  const rest: Partial<BriefOfferMeta> = { ...held.meta };
  delete rest.held;
  delete rest.chosen;
  delete rest.type;
  return offerStep(held.content, {
    ...(rest as Omit<BriefOfferMeta, 'type'>),
    revealed_from: held.id,
  });
}

/**
 * The plan offer once more, after a change made in the thread took them away
 * from it: same buttons, worded for what is left of the day.
 */
export function backToPlanStep(
  offer: { id: string; meta: BriefOfferMeta },
  nowMinutes: number,
): BriefStep {
  const rest: Partial<BriefOfferMeta> = { ...offer.meta };
  delete rest.held;
  delete rest.chosen;
  delete rest.type;
  delete rest.revealed_from;
  // the plan offer comes back as itself: a check in that rode on it is over
  delete rest.checkin;
  const buttons = offer.meta.buttons.map((b) =>
    b.action === 'plan' ? { ...b, label: planLabel(nowMinutes) } : b,
  );
  return offerStep(`Want to plan the rest of your ${partWord(nowMinutes)} now?`, {
    ...(rest as Omit<BriefOfferMeta, 'type'>),
    buttons,
    brought_back_from: offer.id,
  });
}

/** Return day, Catch me up: the counts, then Sweep first or Just today. */
export function afterCatchUp(offer: BriefOfferMeta, part: DayPart): BriefStep[] {
  return [
    gremlyStep(offer.catch_up?.trim() || BRIEF_COPY.catchUpFallback, part, offer.brief_id),
    offerStep('', {
      kind: 'return',
      buttons: [
        { id: 'sweep', label: 'Sweep first', action: 'sweep', primary: true },
        { id: 'just_today', label: 'Just today', action: 'just_today' },
      ],
      plan_from: offer.plan_from,
      brief_id: offer.brief_id,
    }),
  ];
}

/**
 * Return day, Just today: keep to today, and offer to plan when a clear
 * stretch is still ahead.
 */
export function afterJustToday(offer: BriefOfferMeta, nowMinutes: number): BriefStep[] {
  const part = dayPartAt(Math.floor(nowMinutes / 60));
  if (offer.plan_from === undefined || offer.plan_from === null) {
    return [gremlyStep(BRIEF_COPY.justToday, part, offer.brief_id)];
  }
  const from = Math.max(offer.plan_from, nowMinutes);
  return [
    offerStep(`${BRIEF_COPY.justToday} Want me to fit a few things into the ${partWord(from)}?`, {
      kind: 'plan',
      buttons: [
        { id: 'plan', label: planLabel(from), action: 'plan', primary: true },
        { id: 'not_today', label: 'Not today', action: 'not_today' },
      ],
      plan_from: offer.plan_from,
      brief_id: offer.brief_id,
    }),
  ];
}

export function afterNotToday(part: DayPart, briefId?: string): BriefStep[] {
  return [gremlyStep(BRIEF_COPY.notToday, part, briefId)];
}
