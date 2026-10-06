/**
 * What the evening wrap up adds to today's thread at each step, worked out
 * without side effects so it can be tested: Gremly's fixed lines, the cards,
 * the person's taps shown as their messages, and the buttons that follow.
 * The hook (useWrapUp) saves them and does the work.
 *
 * Every message carries wrap: true, so the brief's own readers leave the
 * evening out. Order and copy follow the approved prototype (Gremly Evening
 * Thread, version 2, "This build").
 */
import type {
  BriefEventMeta,
  BriefMeta,
  BriefOfferMeta,
  OfferButton,
  OfferKind,
  SweepHabitRow,
  SweepRecapMeta,
} from '../brief/types';
import type { WrapQuestion } from './questions';
import { questionButtons } from './questions';
import {
  WRAP_COPY,
  answeredWithItem,
  clearLine,
  closeLine,
  habitsLine,
  missedLine,
  moveAllButton,
  movedEvent,
  newSinceLine,
  nightLine,
  offerLine,
  openerLine,
  partialLine,
  partWords,
  planTomorrowButton,
  questionsIntro,
  resumeLine,
  skippedLine,
  skipsHint,
  sortedLine,
  type WrapDay,
} from './words';

export interface WrapMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
  meta: BriefMeta;
}

// ── the pieces ───────────────────────────────────────────────────────────────

export function say(text: string): WrapMsg {
  return {
    role: 'assistant',
    content: text,
    meta: { type: 'brief-text', part: 'evening', ids: [], wrap: true },
  };
}

/** The person's tap, as their message. */
export function tapped(button: OfferButton): WrapMsg {
  return {
    role: 'user',
    content: button.label,
    meta: { type: 'brief-reply', button_id: button.id, action: button.action, wrap: true },
  };
}

/** What they typed for the journal or as an answer, as their message. */
export function typed(text: string, action: 'journal_write' | 'answer'): WrapMsg {
  return {
    role: 'user',
    content: text,
    meta: { type: 'brief-reply', button_id: 'typed', action, wrap: true },
  };
}

export function event(text: string, icon: BriefEventMeta['icon']): WrapMsg {
  return { role: 'system', content: text, meta: { type: 'brief-event', icon, wrap: true } };
}

export function offer(
  content: string,
  kind: OfferKind,
  buttons: OfferButton[],
  extra: Partial<BriefOfferMeta> = {},
): WrapMsg {
  return {
    role: 'assistant',
    content,
    meta: { ...extra, type: 'brief-offer', kind, buttons, wrap: true },
  };
}

function card(meta: BriefMeta): WrapMsg {
  return { role: 'system', content: '', meta: { ...meta, wrap: true } as BriefMeta };
}

// ── the offer ────────────────────────────────────────────────────────────────

/**
 * The offer's buttons. Moving it all on is there while a weekly skip is left.
 * Planning the week is not here: the weekly review is offered at the close,
 * once the evening's own work is done (closeButtons).
 */
export function offerButtons(d: WrapDay, skipsLeft: number): OfferButton[] {
  return [
    { id: 'sweep', label: WRAP_COPY.sweepNow, action: 'sweep', primary: true },
    ...(skipsLeft > 0
      ? [{ id: 'sweep_skip', label: moveAllButton(d), action: 'sweep_skip' as const }]
      : []),
    { id: 'not_tonight', label: partWords(d.early).notNow, action: 'not_tonight' },
  ];
}

function cardsOffer(content: string, d: WrapDay, skipsLeft: number): WrapMsg {
  return offer(content, 'wrap_up', offerButtons(d, skipsLeft), {
    ...(skipsLeft > 0 ? { hint: skipsHint(skipsLeft) } : {}),
  });
}

/**
 * Gremly opens on the day: the time, his words (or the fixed opener), the day
 * in counts, then the cards if there are any. His own words look back on the
 * day themselves, so the fixed lines for what did not happen and for a clear
 * night are only said without them.
 */
export function openingMsgs(p: {
  /** The time, shown first; null when it is already in the thread */
  clock: string | null;
  recap: Omit<SweepRecapMeta, 'type'>;
  day: WrapDay;
  firstName: string | null;
  evening: boolean;
  cards: number;
  skipsLeft: number;
  /** Gremly's own words for the opening, when they came */
  gremly?: string | null;
}): WrapMsg[] {
  const out: WrapMsg[] = [
    ...(p.clock ? [event(p.clock, 'time')] : []),
    say(p.gremly || openerLine(p.day, p.firstName, p.evening)),
    card({ ...p.recap, type: 'sweep-recap' }),
  ];
  if (!p.gremly && p.recap.missed.length) {
    out.push(say(missedLine(p.recap.missed.map((m) => m.title))));
  }
  if (p.cards > 0) out.push(cardsOffer(offerLine(p.cards, p.day), p.day, p.skipsLeft));
  else if (!p.gremly) out.push(say(clearLine(p.recap.planned ?? null, p.day)));
  return out;
}

/** Coming back after Not tonight: the same choices, said once more. */
export function resumeMsgs(cards: number, d: WrapDay, skipsLeft: number): WrapMsg[] {
  return [cardsOffer(resumeLine(cards), d, skipsLeft)];
}

/** The choices again with no words: the cards were closed with nothing decided. */
export function offerAgain(d: WrapDay, skipsLeft: number): WrapMsg[] {
  return [cardsOffer('', d, skipsLeft)];
}

// ── back from the cards ──────────────────────────────────────────────────────

export function receiptMsg(): WrapMsg {
  return card({ type: 'sweep-receipt' });
}

export function partialButtons(left: number): OfferButton[] {
  return [
    {
      id: 'finish',
      label: left === 1 ? WRAP_COPY.finishOne : WRAP_COPY.finishMany,
      action: 'sweep',
      primary: true,
    },
    {
      id: 'sweep_leave',
      label: left === 1 ? WRAP_COPY.leaveOne : WRAP_COPY.leaveMany,
      action: 'sweep_leave',
    },
  ];
}

/** Closed part way: what is saved, and the choice to finish or leave the rest. */
export function partialMsgs(sorted: number, left: number, d: WrapDay): WrapMsg[] {
  return [receiptMsg(), offer(partialLine(sorted, left, d), 'wrap_partial', partialButtons(left))];
}

/** Every card has a place: the receipt, and Gremly's words on it (his own when they came). */
export function sortedMsgs(letGo: number, gremly?: string | null): WrapMsg[] {
  return [receiptMsg(), say(gremly || sortedLine(letGo))];
}

export function leaveRestMsgs(button: OfferButton, left: number, d: WrapDay): WrapMsg[] {
  const w = partWords(d.early);
  return [tapped(button), say(left === 1 ? w.leaveRestOne : w.leaveRest)];
}

/** New things dropped after the wrap up was finished. */
export function newSinceMsgs(n: number): WrapMsg[] {
  return [offer(newSinceLine(n), 'wrap_partial', partialButtons(n))];
}

// ── habits ───────────────────────────────────────────────────────────────────

export function habitsMsgs(
  rows: SweepHabitRow[],
  already: string[],
  day: string,
  early = false,
): WrapMsg[] {
  const build = rows.filter((r) => r.kind === 'build').length;
  return [
    say(habitsLine(build, rows.length - build)),
    card({
      type: 'sweep-habits',
      date: day,
      habits: rows,
      already,
      status: 'open',
      ...(early ? { early: true } : {}),
    }),
  ];
}

// ── the journal ──────────────────────────────────────────────────────────────

export function journalButtons(early = false): OfferButton[] {
  return [
    { id: 'journal_write', label: WRAP_COPY.journalWrite, action: 'journal_write', primary: true },
    { id: 'journal_page', label: WRAP_COPY.journalPage, action: 'journal_page' },
    { id: 'journal_mood', label: WRAP_COPY.journalMood, action: 'journal_mood' },
    { id: 'journal_skip', label: partWords(early).journalSkip, action: 'journal_skip' },
  ];
}

/** Gremly asks about the day, in his own words when they came. The box saves to the journal from here. */
export function journalAskMsgs(
  only: boolean,
  early = false,
  gremly: string | null = null,
): WrapMsg[] {
  const w = partWords(early);
  return [
    offer(gremly || (only ? w.journalAskOnly : w.journalAsk), 'journal', journalButtons(early)),
  ];
}

export function journalSavedMsgs(p: {
  day: string;
  noteId: string;
  title: string;
  text: string;
  early?: boolean;
  /** Gremly's reply to what they wrote, when it came */
  reply?: string | null;
  /** The moods they picked themselves, on the journal page */
  moods?: string[];
  /** Written on the journal page: each card's prompt and words */
  parts?: { q: string | null; text: string }[];
}): WrapMsg[] {
  return [
    say(p.reply || WRAP_COPY.journalSaved),
    card({
      type: 'sweep-journal',
      date: p.day,
      status: 'saved',
      note_id: p.noteId,
      title: p.title,
      text: p.text,
      ...(p.parts?.length ? { parts: p.parts } : {}),
      moods: p.moods ?? [],
      ...(p.early ? { early: true } : {}),
    }),
  ];
}

/** Just pick a mood: the card to pick on, nothing saved yet. */
export function moodAskMsgs(
  button: OfferButton,
  day: string,
  title: string,
  early = false,
): WrapMsg[] {
  return [
    tapped(button),
    say(partWords(early).journalMoodAsk),
    card({
      type: 'sweep-journal',
      date: day,
      status: 'mood',
      title,
      moods: [],
      ...(early ? { early: true } : {}),
    }),
  ];
}

// ── Gremly's questions ───────────────────────────────────────────────────────

/**
 * What a question's message carries so its answer can be settled: the
 * question's id, or for a milestone's check in the check in itself, which is
 * not one of Gremly's questions and has no id among them.
 */
export function questionFacts(q: WrapQuestion): Partial<BriefOfferMeta> {
  if (!q.checkin) return { question_id: q.id };
  const c = q.checkin;
  return {
    milestone_checkin: { row_id: c.row_id, id: c.id, goal: c.goal, goal_date: c.goal_date },
  };
}

export function questionMsg(q: WrapQuestion): WrapMsg {
  return offer(q.question, 'question', questionButtons(q.choices), questionFacts(q));
}

/**
 * A question's buttons once more, from its own message: for when tonight's
 * questions are no longer held in memory (the app was closed part way) and
 * one of them is still waiting for its answer.
 */
export function questionAgainMsg(
  asked: Pick<BriefOfferMeta, 'buttons' | 'question_id' | 'milestone_checkin'>,
): WrapMsg {
  return offer('', 'question', asked.buttons, {
    ...(asked.question_id ? { question_id: asked.question_id } : {}),
    ...(asked.milestone_checkin ? { milestone_checkin: asked.milestone_checkin } : {}),
  });
}

export function questionsStartMsgs(
  n: number,
  first: WrapQuestion,
  gremly?: string | null,
): WrapMsg[] {
  return [say(gremly || questionsIntro(n)), questionMsg(first)];
}

/** After an answer: thanks, the saved line, and the item it was about, to open. */
export function answeredMsgs(
  saved: boolean,
  item: { id: string; kind: 'todo' | 'habit' | 'note'; title: string; when?: string } | null,
): WrapMsg[] {
  if (!saved) return [say(WRAP_COPY.answerFailed)];
  const out: WrapMsg[] = [
    say(item ? answeredWithItem(item.kind) : WRAP_COPY.answered),
    event(WRAP_COPY.savedEvent, 'saved'),
  ];
  if (item) out.push(card({ type: 'sweep-item', item }));
  return out;
}

// ── the close ────────────────────────────────────────────────────────────────

/**
 * What the close offers about their week (workers/shared/week.js
 * closeOffersWeek): the weekly review from their weekly day through the two
 * days after, until it is done, and the week they planned once it is.
 */
export type CloseWeek = 'plan' | 'see' | null;

/**
 * Goodnight first, the one the close leads to; planning tomorrow is there for
 * whoever wants it, and their week on the evenings it is put forward.
 */
export function closeButtons(d: WrapDay, canPlan: boolean, week: CloseWeek = null): OfferButton[] {
  return [
    { id: 'night', label: partWords(d.early).bye, action: 'night', primary: true },
    ...(canPlan
      ? [{ id: 'plan_tomorrow', label: planTomorrowButton(d), action: 'plan_tomorrow' as const }]
      : []),
    ...(week === 'plan'
      ? [{ id: 'plan_week', label: WRAP_COPY.planWeek, action: 'plan_week' as const }]
      : []),
    ...(week === 'see'
      ? [{ id: 'see_week', label: WRAP_COPY.seeWeek, action: 'see_week' as const }]
      : []),
  ];
}

/** The close's offer: its buttons, and a quiet line when the week is still to plan. */
function closeOffer(content: string, d: WrapDay, canPlan: boolean, week: CloseWeek): WrapMsg {
  return offer(content, 'wrap_close', closeButtons(d, canPlan, week), {
    ...(week === 'plan' ? { hint: WRAP_COPY.weekHint } : {}),
  });
}

export function closeMsgs(p: {
  day: WrapDay;
  meetings: number;
  /** Every todo planned for tomorrow, by title */
  todos: string[];
  canPlan: boolean;
  /** Their week, on the evenings the close offers it */
  week?: CloseWeek;
  /** Gremly's own words for the close, when they came */
  gremly?: string | null;
}): WrapMsg[] {
  return [
    closeOffer(p.gremly || closeLine(p.day, p.meetings, p.todos), p.day, p.canPlan, p.week ?? null),
  ];
}

/** Good night, with no words above it: after tomorrow's plan is set or left. Their week is still offered. */
export function nightOnlyMsgs(d: WrapDay, week: CloseWeek = null): WrapMsg[] {
  return [closeOffer('', d, false, week)];
}

/** Plan my week, at the close: their tap, and Gremly turning to the week. The review follows in the thread. */
export function toWeekMsgs(button: OfferButton): WrapMsg[] {
  return [tapped(button), say(WRAP_COPY.toWeek)];
}

export function nightMsgs(
  button: OfferButton,
  firstName: string | null,
  day: string,
  early = false,
  gremly?: string | null,
): WrapMsg[] {
  return [tapped(button), ...nightEndMsgs(firstName, day, early, gremly)];
}

/** Gremly's goodnight (his own when it came) and the end card, after the tap. */
export function nightEndMsgs(
  firstName: string | null,
  day: string,
  early = false,
  gremly?: string | null,
): WrapMsg[] {
  return [say(gremly || nightLine(firstName, early)), card({ type: 'sweep-end', date: day })];
}

// ── the other choices on the offer ───────────────────────────────────────────

/** Not tonight, or Not now before the evening: nothing is lost, and the journal stays one tap away. */
export function notTonightMsgs(
  button: OfferButton,
  journalDone: boolean,
  early = false,
): WrapMsg[] {
  const reply = partWords(early).declined;
  if (journalDone) return [tapped(button), say(reply)];
  return [
    tapped(button),
    offer(reply, 'wrap_declined', [
      { id: 'journal_only', label: WRAP_COPY.journalOnly, action: 'journal_only' },
    ]),
  ];
}

/** Move it all on: what moved, what waits for the next Sweep, and the skips left. */
export function skippedMsgs(
  button: OfferButton,
  p: { moved: number; waiting: number; skipsLeft: number },
  d: WrapDay,
): WrapMsg[] {
  return [
    tapped(button),
    ...(p.moved > 0 ? [event(movedEvent(p.moved, d), 'moved')] : []),
    say(skippedLine(p.moved, p.waiting, p.skipsLeft, d)),
  ];
}

/**
 * The buttons for where the wrap up has got to, with no words: put back after
 * an ordinary chat turn took the live buttons away, so the wrap up waits
 * where it was.
 */
export function buttonsAgain(
  step: string,
  p: {
    day: WrapDay;
    skipsLeft: number;
    left: number;
    journalDone: boolean;
    question: WrapQuestion | null;
    canPlan: boolean;
    /** Their week, on the evenings the close offers it */
    week?: CloseWeek;
  },
): WrapMsg[] {
  switch (step) {
    case 'offer':
      return p.left > 0 ? offerAgain(p.day, p.skipsLeft) : [];
    case 'partial':
      return p.left > 0 ? [offer('', 'wrap_partial', partialButtons(p.left))] : [];
    case 'journal':
      return p.journalDone ? [] : [offer('', 'journal', journalButtons(p.day.early))];
    case 'questions':
      return p.question
        ? [offer('', 'question', questionButtons(p.question.choices), questionFacts(p.question))]
        : [];
    case 'close':
      return [closeOffer('', p.day, p.canPlan, p.week ?? null)];
    case 'declined':
      return p.journalDone
        ? []
        : [
            offer('', 'wrap_declined', [
              { id: 'journal_only', label: WRAP_COPY.journalOnly, action: 'journal_only' },
            ]),
          ];
    default:
      return [];
  }
}
