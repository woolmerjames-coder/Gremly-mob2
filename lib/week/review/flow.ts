/**
 * What the weekly review adds to today's thread at each step, worked out
 * without side effects so it can be tested: Gremly's fixed lines, the cards,
 * the person's taps shown as their messages, and the buttons that follow. The
 * hook (lib/week/useWeekReview.ts) saves them and does the work.
 *
 * Every message carries week: true, so the brief's and the wrap up's own
 * readers leave the review out. A card is one system message that says which
 * card it is and which week it is for; it is drawn from the review's row each
 * time it is shown, the way the day card draws from the store. Order and copy
 * follow the approved prototype (Weekly sweep prototype).
 */
import type {
  BriefMeta,
  BriefOfferMeta,
  DayPart,
  OfferAction,
  OfferButton,
  OfferKind,
  WeekCardKind,
  WeekCardMeta,
} from '../../brief/types';
import type { WeekRead } from '../../repo/weekReviewRepo';
import type { ReviewKind } from '../model';
import { milestonesShown, type ChatStep } from './state';
import {
  DAY_MOVE_FAILED,
  INTENTION_LEFT,
  TALK_REASONS,
  WEEK_COPY,
  doneLine,
  aheadIntro,
  dayKeptLine,
  dayMovedLine,
  dayMovedNotCountedLine,
  dayMovedTakenLine,
  keepDayButton,
  moveDayButton,
  moveDayQuestion,
  needsYouIntro,
  openerLine,
  skippedLine,
  talkOpener,
  type DayPartName,
} from './words';

export interface WeekMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
  meta: BriefMeta;
}

// ── the pieces ───────────────────────────────────────────────────────────────

export function say(text: string, part: DayPart): WeekMsg {
  return {
    role: 'assistant',
    content: text,
    meta: { type: 'brief-text', part, ids: [], week: true },
  };
}

/** The person's tap, as their message. */
export function tapped(label: string, id: string, action: OfferAction): WeekMsg {
  return {
    role: 'user',
    content: label,
    meta: { type: 'brief-reply', button_id: id, action, week: true },
  };
}

/** What they typed to Gremly while the review is under way, as their message. */
export function typed(text: string): WeekMsg {
  return {
    role: 'user',
    content: text,
    meta: { type: 'brief-reply', button_id: 'typed', action: 'week_typed', week: true },
  };
}

export function offer(
  content: string,
  kind: OfferKind,
  buttons: OfferButton[],
  extra: Partial<BriefOfferMeta> = {},
): WeekMsg {
  return {
    role: 'assistant',
    content,
    meta: { ...extra, type: 'brief-offer', kind, buttons, week: true },
  };
}

export function card(
  kind: WeekCardKind,
  weekStart: string,
  extra: Partial<Pick<WeekCardMeta, 'at' | 'recap' | 'summary'>> = {},
): WeekMsg {
  return {
    role: 'system',
    content: '',
    meta: { ...extra, type: 'week-card', card: kind, week_start: weekStart, week: true },
  };
}

// ── the opening ──────────────────────────────────────────────────────────────

export const START_BUTTON: OfferButton = {
  id: 'week_start',
  label: WEEK_COPY.start,
  action: 'week_start',
  primary: true,
};
export const SKIP_BUTTON: OfferButton = {
  id: 'week_skip',
  label: WEEK_COPY.skip,
  action: 'week_skip',
};

/** The opening: the review's mark with the time, and Gremly's offer. */
export function openingMsgs(o: {
  kind: ReviewKind;
  since: number;
  weekday: number;
  part: DayPartName;
  weekStart: string;
  /** "Sunday, 7:40 PM" */
  at: string;
}): WeekMsg[] {
  return [
    card('opening', o.weekStart, { at: o.at }),
    offer(openerLine(o), 'week_open', [START_BUTTON, SKIP_BUTTON]),
  ];
}

/** Gremly's line after Not this week. */
export function skippedMsgs(kind: ReviewKind, weeklyDay: number, part: DayPart): WeekMsg[] {
  return [say(skippedLine(kind, weeklyDay), part)];
}

/** Let's do it, with no read yet: Gremly says he needs a minute. */
export function loadingMsgs(part: DayPart): WeekMsg[] {
  return [say(WEEK_COPY.loadingLine, part)];
}

/** The read could not be made: try again, or leave it. */
export function failedMsgs(): WeekMsg[] {
  return [
    offer(WEEK_COPY.loadFailed, 'week_retry', [
      { id: 'week_retry', label: WEEK_COPY.tryAgain, action: 'week_retry', primary: true },
      { id: 'week_stop', label: WEEK_COPY.notNow, action: 'week_stop' },
    ]),
  ];
}

/** Gremly's line after Not now. */
export function stoppedMsgs(part: DayPart): WeekMsg[] {
  return [say(WEEK_COPY.stopped, part)];
}

// ── the steps ────────────────────────────────────────────────────────────────

/** Gremly's line above a step's card. */
export function stepIntro(step: ChatStep, read: WeekRead | null, today: string): string {
  switch (step) {
    case 'challenge':
      return WEEK_COPY.challengeIntro;
    case 'priorities':
      return WEEK_COPY.prioritiesIntro;
    case 'shape':
      return WEEK_COPY.shapeIntro;
    case 'intention':
      return WEEK_COPY.intentionIntro;
    case 'ahead':
      return aheadIntro(milestonesShown(read, today).length);
    case 'needs_you':
      return needsYouIntro((read?.needs_you ?? []).length);
    case 'board':
      // the board's line is drawn with its card, from the board as it stands
      return '';
  }
}

/** A step begins: Gremly's line, then its card. */
export function stepMsgs(
  step: ChatStep,
  o: { weekStart: string; read: WeekRead | null; today: string; part: DayPart },
): WeekMsg[] {
  const intro = stepIntro(step, o.read, o.today);
  return [...(intro ? [say(intro, o.part)] : []), card(step, o.weekStart)];
}

/** A review picked up in a thread that does not hold it: every card so far, then the one it is on. */
export function resumeMsgs(steps: ChatStep[], weekStart: string, part: DayPart): WeekMsg[] {
  return [say(WEEK_COPY.resumed, part), ...steps.map((s) => card(s, weekStart))];
}

/** Not quite: Gremly asks what he has wrong. */
export function notQuiteMsgs(part: DayPart): WeekMsg[] {
  return [
    tapped(WEEK_COPY.disagree, 'week_not_quite', 'week_not_quite'),
    say(WEEK_COPY.tellMe, part),
  ];
}

/** One of the needs you cards, opened to talk through: Gremly's question and the reasons to tap. */
export function talkMsgs(title: string, question: string): WeekMsg[] {
  return [
    tapped(talkOpener(title), 'week_talk', 'week_talk'),
    offer(
      question,
      'week_reasons',
      TALK_REASONS.map((label, i) => ({
        id: `week_reason_${i}`,
        label,
        action: 'week_reason' as const,
        value: label,
      })),
    ),
  ];
}

// ── done ─────────────────────────────────────────────────────────────────────

/**
 * The week is planned: the summary card, and Gremly's last line, which says
 * what happens next (the habits planned, the check ins to come).
 */
export function doneMsgs(o: {
  weekStart: string;
  part: DayPart;
  summary: WeekCardMeta['summary'];
  next: Parameters<typeof doneLine>[0];
}): WeekMsg[] {
  return [card('done', o.weekStart, { summary: o.summary }), say(doneLine(o.next), o.part)];
}

/** A review done on another day than their weekly day: asked once whether to move it. */
export function dayQuestionMsgs(today: number, weeklyDay: number): WeekMsg[] {
  return [
    offer(moveDayQuestion(today), 'week_day', [
      { id: 'week_keep_day', label: keepDayButton(weeklyDay), action: 'week_keep_day' },
      { id: 'week_move_day', label: moveDayButton(today), action: 'week_move_day', primary: true },
    ]),
  ];
}

/**
 * Gremly's line once they have answered about their weekly day. It says what
 * happened and no more: the day can move without the review counting for the
 * new week (counted), and the review can move without its intention
 * (intentionLeft).
 */
export function dayAnswerMsgs(
  o: {
    moved: boolean;
    failed?: boolean;
    /** Whether the review now counts for the new week: taken when that week had one already */
    counted?: 'yes' | 'taken' | 'no';
    intentionLeft?: boolean;
    today: number;
    weeklyDay: number;
  },
  part: DayPart,
): WeekMsg[] {
  if (o.failed) return [say(DAY_MOVE_FAILED, part)];
  if (!o.moved) return [say(dayKeptLine(o.weeklyDay), part)];
  if (o.counted === 'taken') return [say(dayMovedTakenLine(o.today), part)];
  if (o.counted === 'no') return [say(dayMovedNotCountedLine(o.today), part)];
  return [
    say(dayMovedLine(o.today), part),
    ...(o.intentionLeft ? [say(INTENTION_LEFT, part)] : []),
  ];
}

/** Your week: the week they planned, shown again. */
export function recapMsgs(
  weekStart: string,
  summary: WeekCardMeta['summary'],
  part: DayPart,
): WeekMsg[] {
  return [say(WEEK_COPY.yourWeek, part), card('done', weekStart, { recap: true, summary })];
}

/**
 * Out of their weekly window, with this week done and the week's one extra
 * still free: the rest of the week can be planned again, from a fresh read.
 */
export function planAgainMsgs(): WeekMsg[] {
  return [
    offer(WEEK_COPY.planAgainLine, 'week_open', [
      { ...START_BUTTON, label: WEEK_COPY.planAgain },
      { ...SKIP_BUTTON, label: WEEK_COPY.notNow },
    ]),
  ];
}

/** The day before their weekly day, with this week done: next week can be planned early. */
export function planNextMsgs(o: { weekday: number; part: DayPartName }): WeekMsg[] {
  return [
    offer(openerLine({ kind: 'brought_forward', since: 6, ...o }), 'week_open', [
      { ...START_BUTTON, label: WEEK_COPY.planNext },
      { ...SKIP_BUTTON, label: WEEK_COPY.notNow },
    ]),
  ];
}
