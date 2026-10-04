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
import type { StillOpen } from './cards';
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
  planTomorrowButton,
  questionsIntro,
  resumeLine,
  skippedLine,
  skipsHint,
  sortedLine,
  stillLine,
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

/** The offer's buttons. Moving it all on is there while a weekly skip is left. */
export function offerButtons(d: WrapDay, skipsLeft: number): OfferButton[] {
  return [
    { id: 'sweep', label: WRAP_COPY.sweepNow, action: 'sweep', primary: true },
    ...(skipsLeft > 0
      ? [{ id: 'sweep_skip', label: moveAllButton(d), action: 'sweep_skip' as const }]
      : []),
    { id: 'plan_week', label: WRAP_COPY.planWeek, action: 'plan_week' },
    { id: 'not_tonight', label: WRAP_COPY.notTonight, action: 'not_tonight' },
  ];
}

function cardsOffer(content: string, d: WrapDay, skipsLeft: number): WrapMsg {
  return offer(content, 'wrap_up', offerButtons(d, skipsLeft), {
    ...(skipsLeft > 0 ? { hint: skipsHint(skipsLeft) } : {}),
  });
}

/**
 * Gremly opens on the day: the time, his line, the day in counts, what was
 * planned and did not happen, then the cards if there are any.
 */
export function openingMsgs(p: {
  clock: string;
  recap: Omit<SweepRecapMeta, 'type'>;
  day: WrapDay;
  firstName: string | null;
  evening: boolean;
  cards: number;
  skipsLeft: number;
}): WrapMsg[] {
  const out: WrapMsg[] = [
    event(p.clock, 'time'),
    say(openerLine(p.day, p.firstName, p.evening)),
    card({ ...p.recap, type: 'sweep-recap' }),
  ];
  if (p.recap.missed.length) {
    out.push(
      say(
        missedLine(
          p.recap.missed.map((m) => m.title),
          p.cards > 0,
        ),
      ),
    );
  }
  if (p.cards > 0) out.push(cardsOffer(offerLine(p.cards, p.day), p.day, p.skipsLeft));
  else out.push(say(clearLine(p.recap.planned ?? null, p.day.late)));
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

export function sortedMsgs(letGo: number): WrapMsg[] {
  return [receiptMsg(), say(sortedLine(letGo))];
}

export function leaveRestMsgs(button: OfferButton, left: number): WrapMsg[] {
  return [tapped(button), say(left === 1 ? WRAP_COPY.leaveRestOne : WRAP_COPY.leaveRest)];
}

/** New things dropped after the wrap up was finished. */
export function newSinceMsgs(n: number): WrapMsg[] {
  return [offer(newSinceLine(n), 'wrap_partial', partialButtons(n))];
}

// ── still open today ─────────────────────────────────────────────────────────

export function stillMsgs(
  still: StillOpen[],
  p: { day: string; to: string },
  d: WrapDay,
): WrapMsg[] {
  return [
    say(stillLine(still.length, d)),
    card({
      type: 'sweep-still',
      date: p.day,
      to: p.to,
      to_word: d.tomorrow,
      todos: still,
      status: 'open',
    }),
  ];
}

// ── habits ───────────────────────────────────────────────────────────────────

export function habitsMsgs(rows: SweepHabitRow[], already: string[], day: string): WrapMsg[] {
  const build = rows.filter((r) => r.kind === 'build').length;
  return [
    say(habitsLine(build, rows.length - build)),
    card({ type: 'sweep-habits', date: day, habits: rows, already, status: 'open' }),
  ];
}

// ── the journal ──────────────────────────────────────────────────────────────

export function journalButtons(): OfferButton[] {
  return [
    { id: 'journal_write', label: WRAP_COPY.journalWrite, action: 'journal_write', primary: true },
    { id: 'journal_mood', label: WRAP_COPY.journalMood, action: 'journal_mood' },
    { id: 'journal_skip', label: WRAP_COPY.journalSkip, action: 'journal_skip' },
  ];
}

/** Gremly asks about the day. The box saves to the journal from here. */
export function journalAskMsgs(only: boolean): WrapMsg[] {
  return [
    offer(only ? WRAP_COPY.journalAskOnly : WRAP_COPY.journalAsk, 'journal', journalButtons()),
  ];
}

export function journalSavedMsgs(p: {
  day: string;
  noteId: string;
  title: string;
  text: string;
}): WrapMsg[] {
  return [
    say(WRAP_COPY.journalSaved),
    card({
      type: 'sweep-journal',
      date: p.day,
      status: 'saved',
      note_id: p.noteId,
      title: p.title,
      text: p.text,
      moods: [],
    }),
  ];
}

/** Just pick a mood: the card to pick on, nothing saved yet. */
export function moodAskMsgs(button: OfferButton, day: string, title: string): WrapMsg[] {
  return [
    tapped(button),
    say(WRAP_COPY.journalMoodAsk),
    card({ type: 'sweep-journal', date: day, status: 'mood', title, moods: [] }),
  ];
}

// ── Gremly's questions ───────────────────────────────────────────────────────

export function questionMsg(q: WrapQuestion): WrapMsg {
  return offer(q.question, 'question', questionButtons(q.choices), { question_id: q.id });
}

export function questionsStartMsgs(n: number, first: WrapQuestion): WrapMsg[] {
  return [say(questionsIntro(n)), questionMsg(first)];
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

export function closeButtons(d: WrapDay, canPlan: boolean): OfferButton[] {
  return [
    ...(canPlan
      ? [{ id: 'plan_tomorrow', label: planTomorrowButton(d), action: 'plan_tomorrow' as const }]
      : []),
    { id: 'night', label: WRAP_COPY.nightButton, action: 'night', primary: true },
  ];
}

export function closeMsgs(p: {
  day: WrapDay;
  meetings: number;
  lined: string[];
  canPlan: boolean;
}): WrapMsg[] {
  return [
    offer(closeLine(p.day, p.meetings, p.lined), 'wrap_close', closeButtons(p.day, p.canPlan)),
  ];
}

/** Good night, with no words above it: after tomorrow's plan is set or left. */
export function nightOnlyMsgs(d: WrapDay): WrapMsg[] {
  return [offer('', 'wrap_close', closeButtons(d, false))];
}

export function nightMsgs(button: OfferButton, firstName: string | null, day: string): WrapMsg[] {
  return [tapped(button), say(nightLine(firstName)), card({ type: 'sweep-end', date: day })];
}

// ── the other choices on the offer ───────────────────────────────────────────

/** Not tonight: nothing is lost, and the journal stays one tap away. */
export function notTonightMsgs(button: OfferButton, journalDone: boolean): WrapMsg[] {
  if (journalDone) return [tapped(button), say(WRAP_COPY.notTonightReply)];
  return [
    tapped(button),
    offer(WRAP_COPY.notTonightReply, 'wrap_declined', [
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
  },
): WrapMsg[] {
  switch (step) {
    case 'offer':
      return p.left > 0 ? offerAgain(p.day, p.skipsLeft) : [];
    case 'partial':
      return p.left > 0 ? [offer('', 'wrap_partial', partialButtons(p.left))] : [];
    case 'journal':
      return p.journalDone ? [] : [offer('', 'journal', journalButtons())];
    case 'questions':
      return p.question
        ? [
            offer('', 'question', questionButtons(p.question.choices), {
              question_id: p.question.id,
            }),
          ]
        : [];
    case 'close':
      return [offer('', 'wrap_close', closeButtons(p.day, p.canPlan))];
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
