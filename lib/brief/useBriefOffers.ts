/**
 * The brief's buttons in today's thread (Daily brief in Chat).
 *
 * A tap shows as the person's message, the offer loses its buttons, and what
 * follows is added to the thread: Gremly's reply, a Saved line, the offer that
 * was waiting for the question, or a new offer. Planning and Sweep are handed
 * to the screen (onPlan, onSweep), which owns those flows.
 *
 * Something else turns the composer into an answer box: the next message
 * typed is the answer (answerTyped), not a chat turn.
 *
 * A message typed straight under the question, without Something else, is a
 * reply to it too (takeTypedReply): it goes to the answer pipeline, and to the
 * chat, which is told what it answers. Once that reply or a change made in the
 * thread is done, the brief carries on (continueBrief): the offer held for the
 * question, or the plan offer once more.
 *
 * Their week rides on the brief's last offer (lib/brief/checkIn.ts): while a
 * habit they planned for today is still on, that message is shown as the
 * check in, and its buttons are answered here. The brief's own offer follows
 * as a new message once the check in is settled, by a tap or by what they
 * typed. Plan my week, beside the offer while the review is still to do,
 * hands the review to the screen (onPlanWeek).
 */

import { useCallback, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import { getDateService, nowTimestamp } from '../date/DateService';
import { answerQuestion, markQuestionAsked } from '../story/storyApi';
import { creditFirstReply } from './feeding';
import { SWEEP_COPY } from './sweepHandoff';
import {
  briefMetaOf,
  dayPartAt,
  heldOffer,
  liveOfferId,
  liveQuestion,
  planOfferToBringBack,
  wrapBegun,
  visibleThreadMessages,
} from './messages';
import { scheduleDcoRefresh } from './dcoRefresh';
import { minutesOfTheirDay } from './time';
import { CHECKIN_COPY, applyCheckIn, briefWeekFacts, checkInWaiting } from './checkIn';
import {
  afterAnswer,
  afterCatchUp,
  afterCheckInStep,
  checkInReplyStep,
  afterJustToday,
  afterNotToday,
  afterSkip,
  backToPlanStep,
  backToSpacingStep,
  gremlyStep,
  replyStep,
  BRIEF_COPY,
  revealStep,
  typedAnswerStep,
  type BriefStep,
} from './offerFlow';
import type { BriefOfferMeta, OfferButton } from './types';

const STEP_PAUSE_MS = 350;

export interface BriefOffersDeps {
  threadId: string | null;
  /** The thread's day: the brief's week hooks are live on the person's own day only */
  date?: string;
  /** Every message of the thread, held ones included */
  messages: SpaceChatMessage[];
  appendBriefMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, unknown>,
  ) => Promise<SpaceChatMessage | undefined>;
  patchMessageMetadata: (messageId: string, patch: Record<string, unknown>) => Promise<void>;
  /** Plan my day / afternoon / evening, Plan anyway */
  onPlan?: (offer: SpaceChatMessage, button: OfferButton) => void;
  /** Sweep first */
  onSweep?: (offer: SpaceChatMessage, button: OfferButton) => void;
  /** What can wait? */
  onWhatCanWait?: (offer: SpaceChatMessage, button: OfferButton) => void;
  /** A suggested change under the plan */
  onPlanEdit?: (offer: SpaceChatMessage, button: OfferButton) => void;
  /** After Sweep: add what was kept to the plan already there (button value: the ids) */
  onAddKept?: (ids: string[]) => void;
  /** Back to back, or with some space: the picks only fit the day with no gaps */
  onPlanSpacing?: (offer: SpaceChatMessage, button: OfferButton) => void;
  /** Another day, Later or left: the todos they picked that did not fit */
  onPlanUnfit?: (offer: SpaceChatMessage, button: OfferButton) => void;
  /** Plan my week: the weekly review starts in the thread */
  onPlanWeek?: () => void;
  /** The first reply of the day (feeding) */
  onFirstReply?: () => void;
  /** Pause between the lines Gremly adds; 0 in tests */
  pauseMs?: number;
}

export interface BriefOffers {
  /** Resolves once everything the tap adds is saved */
  handleOfferButton: (message: SpaceChatMessage, button: OfferButton) => Promise<void>;
  /** Something else was tapped: the next typed message answers the question */
  awaitingAnswer: boolean;
  /** Use a typed message as the answer. False when no answer is awaited. */
  answerTyped: (text: string) => Promise<boolean>;
  cancelAnswer: () => void;
  /**
   * A message typed while Gremly's question is the last thing said is the
   * reply to it: the question loses its buttons and the words go to the answer
   * pipeline. Returns the question, for the chat reply; null when no question
   * is waiting.
   */
  takeTypedReply: (text: string) => Promise<string | null>;
  /**
   * After a reply or a change made in the thread: the offer held for the
   * question, or the plan offer once more. Nothing when an offer is already
   * waiting at the bottom.
   */
  continueBrief: (how?: { afterWeek?: boolean }) => Promise<void>;
  /**
   * A habit check in was answered and the brief's own offer has not followed
   * it yet (checkInOfferOwed): continueBrief shows it.
   */
  owesOffer: () => boolean;
  busy: boolean;
}

function nowMinutes(): number {
  const d = getDateService().now();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * The habit check in they answered, by a tap or by typing, whose own offer
 * has not followed: the newest offer of the brief, marked as asked and
 * answered, with no copy of it in the thread.
 *
 * The offer follows a tap in the same step (handleOfferButton), and a typed
 * answer once its turn is done (continueBrief). This is also how one that
 * never arrived is found, when the app closed or a save failed part way, so
 * it can follow the next time the thread is open. Nothing once the evening's
 * wrap up has begun or a plan has been made: the morning's offer is past by
 * then.
 */
export function checkInOfferOwed(
  messages: SpaceChatMessage[],
): { message: SpaceChatMessage; meta: BriefOfferMeta } | null {
  const shown = new Set<string>();
  for (const m of messages) {
    const meta = briefMetaOf(m);
    if (meta?.type === 'brief-offer' && meta.revealed_from) shown.add(meta.revealed_from);
  }
  const visible = visibleThreadMessages(messages);
  for (let i = visible.length - 1; i >= 0; i--) {
    const meta = briefMetaOf(visible[i]);
    // anything of the evening's wrap up since, or a plan made: the morning's offer is past
    if (meta?.wrap || meta?.type === 'brief-plan') return null;
    // the weekly review's own offers are passed over: the day's offer is still good after it
    if (meta?.type !== 'brief-offer' || meta.week) continue;
    const answered = !!meta.checkin?.asked && !!meta.chosen;
    return answered && !shown.has(visible[i].id) ? { message: visible[i], meta } : null;
  }
  return null;
}

export function useBriefOffers(deps: BriefOffersDeps): BriefOffers {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [awaiting, setAwaiting] = useState<{ offerId: string; questionId: string } | null>(null);
  const awaitingRef = useRef(awaiting);
  awaitingRef.current = awaiting;
  const repliedRef = useRef<string | null>(null);

  const pause = useCallback(async () => {
    const ms = depsRef.current.pauseMs ?? STEP_PAUSE_MS;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }, []);

  const save = useCallback(
    async (steps: BriefStep[]) => {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        if (i > 0 || s.role !== 'user') await pause();
        await depsRef.current.appendBriefMessage(
          s.role,
          s.content,
          s.meta as unknown as Record<string, unknown>,
        );
      }
    },
    [pause],
  );

  /** The reply, the offer's buttons gone, and the day's first reply noted. */
  const reply = useCallback(
    async (
      offer: SpaceChatMessage,
      step: BriefStep,
      buttonId: string,
      also: Record<string, unknown> = {},
    ) => {
      const d = depsRef.current;
      await d.patchMessageMetadata(offer.id, {
        chosen: { id: buttonId, at: nowTimestamp() },
        ...also,
      });
      await save([step]);
      if (d.threadId && repliedRef.current !== d.threadId) {
        repliedRef.current = d.threadId;
        // the day's first reply feeds Gremly (once a day, Not today included)
        creditFirstReply(d.threadId)
          .then((fresh) => {
            if (fresh) depsRef.current.onFirstReply?.();
          })
          .catch((err) => console.warn('[DailyBrief] could not note the first reply:', err));
      }
    },
    [save],
  );

  /** After the question: the offer that was waiting for it. */
  const reveal = useCallback(async () => {
    const held = heldOffer(depsRef.current.messages);
    const meta = briefMetaOf(held);
    if (!held || meta?.type !== 'brief-offer') return;
    await pause();
    await save([revealStep({ id: held.id, content: held.content, meta })]);
  }, [pause, save]);

  const run = useCallback(async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } catch (err) {
      console.warn('[DailyBrief] a button failed:', err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const handleOfferButton = useCallback(
    async (message: SpaceChatMessage, button: OfferButton): Promise<void> => {
      const meta = briefMetaOf(message);
      if (meta?.type !== 'brief-offer' || meta.chosen) return;
      const offer = meta as BriefOfferMeta;
      const part = dayPartAt(Math.floor(nowMinutes() / 60));
      const d = depsRef.current;

      switch (button.action) {
        case 'answer_other':
          // Nothing is added yet: the composer becomes the answer box
          if (offer.question_id)
            setAwaiting({ offerId: message.id, questionId: offer.question_id });
          return;
        case 'plan':
          return run(async () => {
            await reply(message, replyStep(button, offer.brief_id), button.id);
            d.onPlan?.(message, button);
          });
          return;
        case 'sweep':
          return run(async () => {
            await reply(message, replyStep(button, offer.brief_id), button.id);
            d.onSweep?.(message, button);
          });
          return;
        case 'what_can_wait':
          return run(async () => {
            await reply(message, replyStep(button, offer.brief_id), button.id);
            d.onWhatCanWait?.(message, button);
          });
        case 'plan_edit':
          return run(async () => {
            await reply(message, replyStep(button, offer.brief_id), button.id);
            d.onPlanEdit?.(message, button);
          });
        case 'plan_week':
          return run(async () => {
            await reply(message, replyStep(button, offer.brief_id), button.id);
            d.onPlanWeek?.();
          });
        case 'plan_spacing':
          return run(async () => {
            await reply(message, replyStep(button, offer.brief_id), button.id);
            d.onPlanSpacing?.(message, button);
          });
        case 'plan_unfit':
          return run(async () => {
            await reply(message, replyStep(button, offer.brief_id), button.id);
            d.onPlanUnfit?.(message, button);
          });
        case 'habit_keep':
        case 'habit_move':
        case 'habit_skip': {
          const checkin = offer.checkin;
          if (!checkin) return;
          const action = button.action;
          return run(async () => {
            // answered as the check in: the message keeps the check in's words from here on
            await reply(message, replyStep(button, offer.brief_id), button.id, {
              checkin: { ...checkin, asked: true },
            });
            const day = d.date ?? getDateService().ritualDay();
            const out = await applyCheckIn(checkin.habit_id, action, button.value ?? null).catch(
              (err) => {
                console.warn('[DailyBrief] the habit check in failed:', err);
                return { text: CHECKIN_COPY.failed, week: false };
              },
            );
            await save([
              checkInReplyStep(
                out.text,
                part,
                offer.brief_id,
                out.week ? { habit_id: checkin.habit_id, day } : null,
              ),
            ]);
            // the brief's own offer, which the check in rode on
            await pause();
            await save([
              afterCheckInStep({ id: message.id, content: message.content, meta: offer }),
            ]);
          });
        }
        case 'add_kept':
          return run(async () => {
            await reply(message, replyStep(button, offer.brief_id), button.id);
            let ids: string[] = [];
            try {
              const v = JSON.parse(button.value || '[]');
              ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
            } catch {
              ids = [];
            }
            d.onAddKept?.(ids);
          });
          return;
        default:
          break;
      }

      return run(async () => {
        setAwaiting(null);
        await reply(message, replyStep(button, offer.brief_id), button.id);
        switch (button.action) {
          case 'answer': {
            const saved = offer.question_id
              ? await answerQuestion(offer.question_id, button.value || button.label).catch(
                  () => false,
                )
              : false;
            if (saved) scheduleDcoRefresh();
            await save(afterAnswer(saved, part, offer.brief_id));
            await reveal();
            return;
          }
          case 'skip':
            if (offer.question_id) {
              markQuestionAsked(offer.question_id).catch((err) =>
                console.warn('[DailyBrief] could not mark the question asked:', err),
              );
            }
            await save(afterSkip(part, offer.brief_id));
            await reveal();
            return;
          case 'catch_up':
            await save(afterCatchUp(offer, part));
            return;
          case 'just_today':
            await save(afterJustToday(offer, nowMinutes()));
            return;
          case 'not_today':
            await save(afterNotToday(part, offer.brief_id));
            return;
          case 'thanks':
            await save([gremlyStep(BRIEF_COPY.thanks, part, offer.brief_id)]);
            return;
          case 'leave_plan':
            await save([gremlyStep(SWEEP_COPY.leavePlan, part, offer.brief_id)]);
            return;
          default:
            if (__DEV__) console.log('[DailyBrief] no handler yet for', button.action);
        }
      });
    },
    [pause, reply, reveal, run, save],
  );

  const answerTyped = useCallback(
    async (text: string): Promise<boolean> => {
      const waiting = awaitingRef.current;
      const answer = text.trim();
      if (!waiting || !answer) return false;
      const offerMsg = depsRef.current.messages.find((m) => m.id === waiting.offerId);
      const meta = briefMetaOf(offerMsg);
      if (!offerMsg || meta?.type !== 'brief-offer') {
        setAwaiting(null);
        return false;
      }
      const part = dayPartAt(Math.floor(nowMinutes() / 60));
      await run(async () => {
        setAwaiting(null);
        await reply(offerMsg, typedAnswerStep(answer, meta.brief_id), 'answer_other');
        const saved = await answerQuestion(waiting.questionId, answer).catch(() => false);
        if (saved) scheduleDcoRefresh();
        await save(afterAnswer(saved, part, meta.brief_id));
        await reveal();
      });
      return true;
    },
    [reply, reveal, run, save],
  );

  const cancelAnswer = useCallback(() => setAwaiting(null), []);

  /**
   * A message typed while the habit check in is the live offer answers it in
   * their own words: the message keeps the check in's words from here on, and
   * its buttons go. The brief's own offer follows once the turn is done
   * (continueBrief).
   */
  const markCheckInTyped = useCallback(async () => {
    const d = depsRef.current;
    if (!d.date) return;
    const id = liveOfferId(visibleThreadMessages(d.messages));
    const m = id ? d.messages.find((x) => x.id === id) : null;
    const meta = briefMetaOf(m);
    if (!m || meta?.type !== 'brief-offer' || meta.wrap || meta.week) return;
    if (!checkInWaiting(meta, briefWeekFacts(d.date))) return;
    await d.patchMessageMetadata(m.id, {
      chosen: { id: 'typed', at: nowTimestamp() },
      checkin: { ...meta.checkin, asked: true },
    });
  }, []);

  const takeTypedReply = useCallback(
    async (text: string): Promise<string | null> => {
      const answer = text.trim();
      if (answer) await markCheckInTyped();
      const offer = liveQuestion(depsRef.current.messages);
      const meta = briefMetaOf(offer);
      if (!answer || !offer || meta?.type !== 'brief-offer' || !meta.question_id) return null;
      setAwaiting(null);
      await depsRef.current.patchMessageMetadata(offer.id, {
        chosen: { id: 'typed', at: nowTimestamp() },
      });
      // the answer pipeline reads the question and their words, and works out what changes
      answerQuestion(meta.question_id, answer)
        .then((saved) => {
          if (saved) scheduleDcoRefresh();
        })
        .catch((err) => console.warn('[DailyBrief] could not save the typed reply:', err));
      return offer.content;
    },
    [markCheckInTyped],
  );

  const continueBrief = useCallback(
    (how: { afterWeek?: boolean } = {}) =>
      run(async () => {
        const msgs = depsRef.current.messages;
        // The weekly review has just ended (afterWeek). Nothing of the
        // morning's follows it once the wrap up has spoken (a review begun at
        // its close), or by the evening, when the day's planning is past; the
        // small hours before their day ends count as evening.
        if (
          how.afterWeek &&
          (wrapBegun(msgs) || dayPartAt(Math.floor(minutesOfTheirDay() / 60)) === 'evening')
        )
          return;
        if (heldOffer(msgs)) {
          if (liveQuestion(msgs)) return;
          await reveal();
          return;
        }
        // The habit check in was answered and its own offer has not followed:
        // typed instead of tapped, so it is settled in their own words, or
        // tapped in a step that never finished. The brief's own offer follows.
        const asked = checkInOfferOwed(msgs);
        if (asked) {
          await pause();
          // looked at again after the pause: the wrap up may have begun, or the offer arrived
          if (!checkInOfferOwed(depsRef.current.messages)) return;
          await save([
            afterCheckInStep({
              id: asked.message.id,
              content: asked.message.content,
              meta: asked.meta,
            }),
          ]);
          return;
        }
        const offer = planOfferToBringBack(msgs, !!how.afterWeek);
        const meta = briefMetaOf(offer);
        if (!offer || meta?.type !== 'brief-offer') return;
        await pause();
        await save([
          meta.kind === 'plan_spacing'
            ? backToSpacingStep({ id: offer.id, content: offer.content, meta })
            : backToPlanStep({ id: offer.id, meta }, nowMinutes()),
        ]);
      }),
    [pause, reveal, run, save],
  );

  const owesOffer = useCallback(() => !!checkInOfferOwed(depsRef.current.messages), []);

  return {
    handleOfferButton,
    awaitingAnswer: awaiting !== null,
    answerTyped,
    cancelAnswer,
    takeTypedReply,
    owesOffer,
    continueBrief,
    busy,
  };
}
