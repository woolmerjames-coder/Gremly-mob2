/**
 * The weekly review in today's thread.
 *
 * Gremly opens on the week, shows how it looks to him (the challenge), then
 * goes through what matters most, the shape of the week, an intention, what
 * is ahead and what needs them, all in the thread the morning brief opened.
 * This hook does the work for each step and adds what flow.ts says the step
 * puts in the thread. The read Gremly made, the answers and where the review
 * has got to are kept on the week's row (weekly_reviews), so a review left
 * part way is picked up where it was, with the same read, on any day.
 *
 * Anything typed while it is under way goes to Gremly as a turn in the thread
 * (useDayTurn), with the review as it stands, and he may put changes on a
 * card. After a typed message the review never moves on by itself: a Carry on
 * button shows under the thread, and when Gremly's reply asked something the
 * step cannot be settled without (hold), the button waits until they answer.
 *
 * Today's thread holds the evening wrap up too. The one that spoke last is
 * the one under way: once the wrap up speaks after the review, typed messages
 * and the turn's follow up are the wrap up's again, and the review is picked
 * up from the Week button.
 *
 * The board joins before Done in batch 4. Until then the review goes from
 * what needs them straight to Done.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import type { OfferButton, WeekCardKind, WeekCardMeta } from '../brief/types';
import { briefMetaOf, dayPartAt, visibleThreadMessages } from '../brief/messages';
import { ampm, clock } from '../brief/dayCard';
import { minutesOfDay } from '../brief/time';
import { applyChange } from '../changes/apply';
import { checkWeekChange, type Change } from '../changes/model';
import { intentionNote } from '../changes/week';
import { rowWords } from '../changes/words';
import { callWeekRead, type WeekTurnContext } from '../cortex/CortexClient';
import { getDateService } from '../date/DateService';
import {
  changeWeekReview,
  createWeekReview,
  getWeekReview,
  moveWeekReview,
  saveWeeklyDay,
  type WeekAnswers,
  type WeekReviewRow,
} from '../repo/weekReviewRepo';
import { useGremlyStore } from '../store/useGremlyStore';
import {
  HOURS_MAX,
  addDays,
  cycleOf,
  extraUsed,
  readServes,
  reviewOn,
  reviewWith,
  weekdayOf,
  type DayKind,
} from './model';
import {
  card,
  dayAnswerMsgs,
  dayQuestionMsgs,
  doneMsgs,
  failedMsgs,
  notQuiteMsgs,
  openingMsgs,
  planAgainMsgs,
  planNextMsgs,
  recapMsgs,
  resumeMsgs,
  loadingMsgs,
  skippedMsgs,
  stepMsgs,
  stoppedMsgs,
  talkMsgs,
  say,
  tapped,
  typed,
  type WeekMsg,
} from './review/flow';
import {
  holdUndo,
  loadWeekSession,
  patchDraft,
  patchSession,
  rowSaved,
  runUndo,
  setReview,
  useWeekSession,
} from './review/session';
import {
  MAX_PRIORITIES,
  asksAboutDay,
  daysPlanned,
  gremlyPicks,
  intentionOf,
  isPast,
  milestonesShown,
  prioritiesOf,
  rekeyed,
  settledText,
  stepAfter,
  stepOf,
  stepsFor,
  weekTurnContext,
  type ChatStep,
  type ReviewOn,
} from './review/state';
import { WEEK_COPY, dayName, doneTiles } from './review/words';
import { useThisWeek } from './thisWeek';

const STEP_PAUSE_MS = 350;
const SAID_MAX = 20;

/** The thread went off the screen while the review was adding to it. */
class LeftThread extends Error {}

export interface WeekReviewDeps {
  /** Today's thread when it is the chat on screen, else null */
  threadId: string | null;
  /** The thread's own messages are in (not still loading, nor another chat's). Taken as true when not given. */
  ready?: boolean;
  /** Every message of the thread */
  messages: SpaceChatMessage[];
  appendBriefMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, unknown>,
  ) => Promise<SpaceChatMessage | undefined>;
  patchMessageMetadata: (messageId: string, patch: Record<string, unknown>) => Promise<void>;
  /**
   * A turn with Gremly in the thread (useDayTurn ask): their message is
   * already in the thread, put there by the review, and the review carries
   * on itself after it. hold is the question his reply left it waiting on.
   */
  tellGremly: (text: string) => Promise<{ answered: boolean; card: boolean; hold?: string | null }>;
  /** Pause between the lines Gremly adds; 0 in tests */
  pauseMs?: number;
}

function store(): any {
  return useGremlyStore.getState();
}

function session() {
  return useWeekSession.getState();
}

function nowPart() {
  return dayPartAt(Math.floor(minutesOfDay() / 60));
}

/** The review of another week than the one today's date gives: what it is, from its own row. */
function onFor(today: string, weeklyDay: number, row: WeekReviewRow): ReviewOn {
  const byDate = reviewWith(today, weeklyDay, row);
  if (byDate.week_start === row.week_start) return byDate;
  return {
    kind: row.kind,
    promoted: false,
    fresh: false,
    week_start: row.week_start,
    span_start: today > row.span_start ? today : row.span_start,
    span_end: addDays(row.week_start, 6),
  };
}

/** The week card messages of a thread, newest last, superseded ones left out. */
function weekCards(messages: SpaceChatMessage[]): { m: SpaceChatMessage; meta: WeekCardMeta }[] {
  const out: { m: SpaceChatMessage; meta: WeekCardMeta }[] = [];
  for (const m of visibleThreadMessages(messages)) {
    const meta = briefMetaOf(m);
    if (meta?.type === 'week-card') out.push({ m, meta });
  }
  return out;
}

/** The week's intention as its note has it. */
function intentionOfWeek(weekStart: string): { id: string | null; text: string } | null {
  const note = intentionNote(weekStart);
  const text = String(note?.body ?? note?.title ?? '').trim();
  return text ? { id: (note?.id as string | undefined) ?? null, text } : null;
}

/**
 * Their week for Ask Gremly: their weekly day and where this week's review
 * stands, so Gremly can put the button to it under a reply. The review itself
 * is never under way there. Null until their week has been read.
 */
export function chatWeekContext(): WeekTurnContext | null {
  const w = useThisWeek.getState();
  if (!w.loaded) return null;
  const day = getDateService().ritualDay();
  return weekTurnContext({
    today: day,
    weeklyDay: w.weeklyDay,
    daysOff: w.daysOff,
    thisWeek: w.review,
    review: null,
    on: null,
    intention: intentionOfWeek(cycleOf(day, w.weeklyDay).week_start),
    talking: null,
    hold: null,
  });
}

/**
 * Whether the review has the thread. Today's thread holds the evening wrap up
 * as well, and whichever of the two spoke last is the one under way in it:
 * the review has the thread until the wrap up says something after it.
 */
function hasThread(messages: SpaceChatMessage[]): boolean {
  const visible = visibleThreadMessages(messages);
  for (let i = visible.length - 1; i >= 0; i--) {
    const meta = briefMetaOf(visible[i]);
    if (meta?.week) return true;
    if (meta?.wrap) return false;
  }
  return false;
}

/**
 * A week's step cards in a thread: the cards of the conversation itself. The
 * opening's mark and the summary are left out, since a thread can hold either
 * without the review being under way in it.
 */
function stepCards(messages: SpaceChatMessage[], weekStart: string) {
  return weekCards(messages).filter(
    (c) => c.meta.week_start === weekStart && c.meta.card !== 'opening' && c.meta.card !== 'done',
  );
}

export interface WeekReview {
  /** Open the review: start it, pick it up where it was left, or show the week once it is done */
  open: () => Promise<void>;
  /** A tap on one of the review's buttons in the thread */
  handleButton: (message: SpaceChatMessage, button: OfferButton) => Promise<void>;
  /** A message typed while the review is under way. False when it is not the review's. */
  takeTyped: (text: string) => Promise<boolean>;
  /** The Carry on button under the thread */
  carryOn: () => Promise<void>;
  /** A change card was applied in the thread while the review is under way */
  onApplied: (changes: Change[]) => Promise<void>;
  /** Their week, for every message sent to Gremly from this thread; null until their week is read */
  context: () => WeekTurnContext | null;
  /** The review is under way in this thread: typed messages are its to take */
  underWay: boolean;
  /** The Carry on button shows */
  canCarryOn: boolean;
  /** The read is being made */
  loading: boolean;
  /** What the box says while the review waits for words */
  placeholder: string | null;
  busy: boolean;
  /** The card that can be acted on for a step: the review's own, in this thread */
  isLive: (meta: WeekCardMeta, messageId: string) => boolean;
  challenge: { agree: () => Promise<void>; disagree: () => Promise<void> };
  priorities: { toggle: (index: number) => void; done: () => Promise<void> };
  shape: {
    toggleBusy: (day: string) => void;
    stepHours: (kind: DayKind, delta: number) => void;
    removeDate: (key: string) => void;
    addDate: (text: string) => Promise<void>;
    done: () => Promise<void>;
  };
  intention: {
    pick: (index: number) => void;
    write: (text: string) => void;
    done: () => Promise<void>;
  };
  ahead: {
    toggleStep: (key: string, index: number) => void;
    setUp: (key: string) => Promise<void>;
    undo: (key: string) => Promise<void>;
    done: () => Promise<void>;
  };
  needsYou: { talk: (index: number) => Promise<void>; done: () => Promise<void> };
  /** Change on a settled card */
  edit: (step: ChatStep) => void;
  /** Take Gremly's guesses for every step not yet done */
  justPlan: () => Promise<void>;
}

export function useWeekReview(deps: WeekReviewDeps): WeekReview {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const threadId = deps.threadId;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const s = useWeekSession();
  const mine = !!threadId && s.threadId === threadId;

  const idleRef = useRef<Promise<void>>(Promise.resolve());

  // Today's thread is on screen: the review in hand is this thread's. With
  // another chat on screen there is no thread here (null), and what is in
  // hand is left as it is, so another chat screen never empties this one's.
  useEffect(() => {
    if (threadId) loadWeekSession(threadId);
  }, [threadId]);

  // A thread that already holds the review (the app was closed part way, or
  // the thread was opened from history) reads the week's row, so its cards
  // can be drawn and, when it is still under way, carried on.
  const heldWeek = useMemo(() => {
    const cards = weekCards(deps.messages);
    return cards.length ? cards[cards.length - 1].meta.week_start : null;
  }, [deps.messages]);
  useEffect(() => {
    if (!threadId || !heldWeek) return;
    const now = session();
    // only when no review is in hand: one being opened or under way here is left alone
    if (now.threadId !== threadId || now.row || now.on || now.loading) return;
    const userId = store().userId as string | null;
    if (!userId) return;
    let stale = false;
    void (async () => {
      try {
        const row = await getWeekReview(userId, heldWeek);
        if (stale || !row || session().threadId !== threadId) return;
        if (session().row || session().on) return;
        const today = getDateService().ritualDay();
        const lastHours =
          (await getWeekReview(userId, addDays(row.week_start, -7)))?.answers.hours ?? null;
        if (stale || session().threadId !== threadId || session().row || session().on) return;
        setReview(row, onFor(today, useThisWeek.getState().weeklyDay, row), lastHours);
      } catch (err) {
        console.warn('[Week] could not read the review this thread holds:', err);
      }
    })();
    return () => {
      stale = true;
    };
  }, [threadId, heldWeek]);

  const pause = useCallback(async () => {
    const ms = depsRef.current.pauseMs ?? STEP_PAUSE_MS;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }, []);

  const save = useCallback(
    async (msgs: WeekMsg[]) => {
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (i > 0 || m.role !== 'user') await pause();
        // A message goes to whichever chat is on screen. Once that is not the
        // review's thread nothing more is added, so the review's lines and
        // cards never land in another chat.
        const thread = depsRef.current.threadId;
        if (!thread || thread !== session().threadId) throw new LeftThread();
        const added = await depsRef.current.appendBriefMessage(
          m.role,
          m.content,
          m.meta as unknown as Record<string, unknown>,
        );
        if (!added) throw new Error('A message of the review could not be added to the thread.');
      }
    },
    [pause],
  );

  /**
   * One piece of the review's work at a time. When it fails, the thread says
   * so (failed), so a tap that did not take is never left looking as if it
   * had. A thread that went off screen part way cannot be told anything: the
   * review is picked up from its row when the thread is back.
   */
  const run = useCallback(
    (work: () => Promise<void>, failed: string = WEEK_COPY.stepFailed): Promise<void> => {
      if (busyRef.current) return Promise.resolve();
      busyRef.current = true;
      setBusy(true);
      const going = (async () => {
        try {
          await work();
        } catch (err) {
          if (err instanceof LeftThread) {
            console.warn('[Week] the thread went off screen part way through a step');
            patchSession({ left: true });
            return;
          }
          console.warn('[Week] a step failed:', err);
          try {
            await save([say(failed, nowPart())]);
          } catch (e) {
            if (e instanceof LeftThread) patchSession({ left: true });
            console.warn('[Week] and the thread could not be told that it failed:', e);
          }
        } finally {
          busyRef.current = false;
          setBusy(false);
        }
      })();
      idleRef.current = going;
      return going;
    },
    [save],
  );

  const choose = useCallback(
    (message: SpaceChatMessage, id: string) =>
      depsRef.current.patchMessageMetadata(message.id, {
        chosen: { id, at: getDateService().nowTimestamp() },
      }),
    [],
  );

  /** Write to the review's row and keep every copy of it in step. */
  const saveRow = useCallback(
    async (change: Parameters<typeof changeWeekReview>[1]): Promise<WeekReviewRow> => {
      const row = session().row;
      if (!row) throw new Error('There is no review to save to.');
      const saved = await changeWeekReview(row.id, change);
      if (!saved) throw new Error("This week's review is no longer there.");
      rowSaved(saved);
      useThisWeek.getState().setReview(saved);
      return saved;
    },
    [],
  );

  /** The live card of a step in this thread: its newest one, when it is for the review's week. */
  const cardOf = useCallback((kind: WeekCardKind): SpaceChatMessage | null => {
    const week = session().row?.week_start;
    const cards = weekCards(depsRef.current.messages).filter(
      (c) => c.meta.card === kind && c.meta.week_start === week,
    );
    return cards.length ? cards[cards.length - 1].m : null;
  }, []);

  const today = () => getDateService().ritualDay();
  const daysOff = () => useThisWeek.getState().daysOff;

  /** What the Done card says, kept on the card so the thread can draw it on any day. */
  const recapOf = (row: WeekReviewRow) => ({
    intention: row.answers.intention ?? null,
    tiles: doneTiles({
      priorities: (row.answers.priorities ?? []).length,
      steps: (row.answers.milestones ?? []).reduce((n, m) => n + m.steps, 0),
      talked: (row.answers.needs_you ?? []).length,
    }),
  });

  /** The review is finished: the summary, and the question about their weekly day when it is due. */
  const finish = useCallback(
    async (row: WeekReviewRow, guessed: boolean) => {
      const on = session().on;
      patchSession({ finishedHere: true, talking: null, hold: null, editing: null, fixing: false });
      // the summary goes on the card itself, so it reads the same on any day
      await save(
        doneMsgs({ weekStart: row.week_start, guessed, part: nowPart(), summary: recapOf(row) }),
      );
      if (asksAboutDay(row, on)) {
        await saveRow((now) => ({ answers: { ...now.answers, day_asked: true } }));
        await save(dayQuestionMsgs(weekdayOf(today()), useThisWeek.getState().weeklyDay));
      }
    },
    [save, saveRow],
  );

  /** A step begins: its line and its card, or the end. */
  const begin = useCallback(
    async (step: ChatStep | 'done', row: WeekReviewRow, guessed = false) => {
      if (step === 'done') return finish(row, guessed);
      await save(
        stepMsgs(step, {
          weekStart: row.week_start,
          read: row.read,
          today: today(),
          part: nowPart(),
        }),
      );
    },
    [finish, save],
  );

  /**
   * A step is settled: its answers are saved, its card says what it came to,
   * and the next step begins. A card opened again with Change is saved where
   * it is, and the review stays on the step it had reached.
   */
  const settle = useCallback(
    async (step: ChatStep, answer: (a: WeekAnswers) => WeekAnswers) => {
      const now = session();
      const row = now.row;
      const on = now.on;
      if (!row || !on) return;
      const editing = now.editing === step;
      const next = editing ? stepOf(row) : stepAfter(stepsFor(row.read, today()), step);
      const saved = await saveRow((r) => ({
        answers: { ...answer(r.answers), step: next },
        ...(next === 'done' && r.status !== 'done'
          ? { status: 'done' as const, completed_at: getDateService().nowTimestamp() }
          : {}),
      }));
      const shown = cardOf(step);
      if (shown) {
        await depsRef.current.patchMessageMetadata(shown.id, {
          settled: settledText(step, saved, { daysOff: daysOff(), days: daysPlanned(on) }),
        });
      }
      patchSession({ editing: null, talking: null, hold: null, fixing: false });
      if (!editing) await begin(next, saved);
    },
    [begin, cardOf, saveRow],
  );

  /** The read for the review in hand: asked for behind the loading card. */
  const fetchRead = useCallback(async (): Promise<WeekReviewRow | null> => {
    const userId = store().userId as string | null;
    if (!userId) return null;
    patchSession({ loading: true });
    try {
      const day = today();
      const res = await callWeekRead({ date: day });
      if (res.ok) {
        setReview(res.data.review, res.data.on as ReviewOn);
        useThisWeek.getState().setReview(res.data.review);
        return res.data.review;
      }
      console.warn('[Week] the read did not come back:', res.error);
      // a read that was nearly made may have been finished and kept: look before asking again
      const on = session().on;
      if (!on) return null;
      const row = await getWeekReview(userId, on.week_start);
      const now = row ? onFor(day, useThisWeek.getState().weeklyDay, row) : null;
      if (row && now && readServes(now, row)) {
        setReview(row, now);
        return row;
      }
      return null;
    } finally {
      patchSession({ loading: false });
    }
  }, []);

  /**
   * The review an opening today is, with its week's row and the row of the
   * week they are in: worked out afresh from the date and the account each
   * time, never from what the thread last showed.
   */
  const locate = useCallback(async () => {
    const userId = store().userId as string | null;
    const thread = depsRef.current.threadId;
    if (!thread || !userId) return null;
    // the review being opened is this thread's
    loadWeekSession(thread);
    await useThisWeek.getState().refresh();
    const { weeklyDay, review: cycleRow, loaded } = useThisWeek.getState();
    // never read: their weekly day here would be a default, and the wrong week could be opened
    if (!loaded) throw new Error('Their weekly day and this week could not be read.');
    const day = today();
    const byDate = reviewOn(day, weeklyDay);
    const target =
      cycleRow && cycleRow.week_start === byDate.week_start
        ? cycleRow
        : await getWeekReview(userId, byDate.week_start);
    return {
      userId,
      weeklyDay,
      cycleRow,
      day,
      byDate,
      target,
      on: reviewWith(day, weeklyDay, target),
    };
  }, []);

  /** Let's do it: the read when there is none that serves, then the challenge. */
  const start = useCallback(async () => {
    const userId = store().userId as string | null;
    const now = session();
    if (!userId || !now.on) return;
    let row = now.row;
    if (!row || !readServes(now.on, row)) {
      await save(loadingMsgs(nowPart()));
      row = await fetchRead();
      if (!row) {
        await save(failedMsgs());
        return;
      }
    }
    // last week's free hours, which the shape starts from
    const last = await getWeekReview(userId, addDays(row.week_start, -7)).catch(() => null);
    setReview(row, session().on, last?.answers.hours ?? null);
    patchSession({ finishedHere: false, talking: null, hold: null, editing: null, fixing: false });
    const saved = await saveRow((r) => ({
      status: 'started' as const,
      answers: {
        ...r.answers,
        step: 'challenge',
        // A week planned again from a fresh read: what they said of the last
        // read's challenge, and that the rest was guessed, belonged to that
        // one. Everything else they settled stays, as where the cards start.
        ...(r.status === 'done' ? { challenge: undefined, guessed: undefined } : {}),
      },
    }));
    await begin('challenge', saved);
  }, [begin, fetchRead, save, saveRow]);

  /**
   * Where the review goes from here, by what the week's row says: the week
   * they planned once it is done, the step it was left on when it is under
   * way, and otherwise the opening, or straight in when they have already
   * said Let's do it (startNow).
   */
  const route = useCallback(
    async (startNow: boolean) => {
      const d = depsRef.current;
      const found = await locate();
      if (!found) return;
      const { userId, weeklyDay, cycleRow, day, byDate, target, on } = found;
      const part = nowPart();
      const visible = visibleThreadMessages(d.messages);
      const last = briefMetaOf(visible[visible.length - 1]);

      // done: the week they planned
      const recap = async (row: WeekReviewRow) => {
        if (
          last?.type === 'week-card' &&
          last.card === 'done' &&
          last.week_start === row.week_start
        )
          return;
        await save(recapMsgs(row.week_start, recapOf(row), part));
      };
      if (target?.status === 'done') {
        // Out of their weekly window, with the week's one extra still free,
        // the rest of the week can be planned again from a fresh read: the
        // week is shown with that offer under it, and Let's do it there goes on
        // to start it below.
        const again = on.kind === 'extra' && !extraUsed(target);
        if (!again || !startNow) {
          setReview(target, on);
          const offered = last?.type === 'brief-offer' && last.kind === 'week_open' && !last.chosen;
          if (again && offered) return;
          await recap(target);
          if (again) await save(planAgainMsgs());
          return;
        }
      }

      // under way: picked up where it was left, with the read it began with
      if (target?.status === 'started' && target.read) {
        const lastHours =
          (await getWeekReview(userId, addDays(target.week_start, -7)).catch(() => null))?.answers
            .hours ?? null;
        setReview(target, on, lastHours);
        const step = stepOf(target);
        if (step === 'done') {
          // its last step was settled and the row was not marked: it is finished
          const saved = await saveRow(() => ({
            status: 'done' as const,
            completed_at: getDateService().nowTimestamp(),
          }));
          await finish(saved, false);
          return;
        }
        const held = stepCards(d.messages, target.week_start);
        if (!held.length) {
          const steps = stepsFor(target.read, day);
          const upTo = steps.slice(0, steps.indexOf(step) + 1);
          await save(resumeMsgs(upTo.length ? upTo : [step], target.week_start, part));
          return;
        }
        // this thread holds it already: its card comes back when it is not the last thing there
        const liveCard = [...held].reverse().find((c) => c.meta.card === step);
        const lastNow = visibleThreadMessages(depsRef.current.messages);
        if (!liveCard || lastNow[lastNow.length - 1]?.id !== liveCard.m.id) {
          if (liveCard) await d.patchMessageMetadata(liveCard.m.id, { superseded: true });
          await save([card(step, target.week_start)]);
        }
        return;
      }

      setReview(target, on);
      if (startNow) {
        await start();
        return;
      }
      // the opening, unless it is already the last thing in the thread
      if (last?.type === 'brief-offer' && last.kind === 'week_open' && !last.chosen) return;
      const m = minutesOfDay();
      const opener = {
        kind: on.kind,
        since: cycleOf(day, weeklyDay).since,
        weekday: weekdayOf(day),
        part,
        weekStart: on.week_start,
        at: `${dayName(weekdayOf(day))}, ${clock(m)} ${ampm(m)}`,
      };
      // the day before their weekly day, with this week done: show it, then offer next week early
      if (byDate.kind === 'brought_forward' && cycleRow?.status === 'done') {
        await recap(cycleRow);
        await save(planNextMsgs({ weekday: opener.weekday, part }));
        return;
      }
      await save(openingMsgs(opener));
    },
    [finish, locate, save, saveRow, start],
  );

  const open = useCallback(() => run(() => route(false), WEEK_COPY.openFailed), [route, run]);

  // Back in the thread after it went off screen part way through a step: what
  // the review could not add then is put there now, from what its row says.
  const ready = deps.ready !== false;
  useEffect(() => {
    if (!mine || !ready || !s.left || busy) return;
    patchSession({ left: false });
    void run(() => route(false), WEEK_COPY.openFailed);
  }, [busy, mine, ready, route, run, s.left]);

  /** Not this week: said on the row when it is the weekly review, so it stops being put forward. */
  const skip = useCallback(async () => {
    const found = await locate();
    if (!found) return;
    const { userId, weeklyDay, target: row, on } = found;
    // a week under way or done is not skipped by an old button
    if (on.kind === 'weekly' && (!row || ['ready', 'skipped'].includes(row.status))) {
      const saved = row
        ? await changeWeekReview(row.id, () => ({ status: 'skipped' as const }))
        : await createWeekReview(userId, {
            week_start: on.week_start,
            span_start: on.span_start,
            status: 'skipped',
            kind: on.kind,
          });
      if (saved) {
        setReview(saved, on);
        useThisWeek.getState().setReview(saved);
      }
    } else {
      setReview(row, on);
    }
    await save(skippedMsgs(on.kind, weeklyDay, nowPart()));
  }, [locate, save]);

  /**
   * The Done step's answer about their weekly day. Moving it is two things:
   * their weekly day, and then the review just done, which counts as the new
   * week's. Each can fail without the other, so Gremly's line says which of
   * them happened.
   */
  const answerDay = useCallback(
    async (move: boolean) => {
      const userId = store().userId as string | null;
      const day = today();
      const todayIs = weekdayOf(day);
      const was = useThisWeek.getState().weeklyDay;
      const part = nowPart();
      const row = session().row;
      if (!move || !userId || !row) {
        await save(dayAnswerMsgs({ moved: false, today: todayIs, weeklyDay: was }, part));
        return;
      }
      // their weekly day first: once this is saved it has moved, whatever follows
      try {
        await saveWeeklyDay(userId, todayIs);
      } catch (err) {
        console.warn('[Week] could not move the weekly day:', err);
        await save(
          dayAnswerMsgs({ moved: false, failed: true, today: todayIs, weeklyDay: was }, part),
        );
        return;
      }
      useThisWeek.getState().setWeeklyDay(todayIs);

      // then the review just done: it counts as the new week's
      let counted: 'yes' | 'taken' | 'no' = 'no';
      let intentionLeft = false;
      try {
        const to = rekeyed(day, todayIs, row);
        const moved = await moveWeekReview(row.id, { ...to, kind: 'weekly' });
        if (moved === 'taken') {
          counted = 'taken';
          console.warn(
            `[Week] the weekly day moved, but the week starting ${to.week_start} already has a review, so this one stays with ${row.week_start}`,
          );
        } else if (!moved) {
          console.warn(
            `[Week] the weekly day moved, but the review ${row.id} is no longer there to count for the new week`,
          );
        } else {
          counted = 'yes';
          setReview(moved, onFor(day, todayIs, moved));
          if (to.week_start !== row.week_start) {
            // its cards in the thread say which week they are for, and follow it
            for (const c of weekCards(depsRef.current.messages)) {
              if (c.meta.week_start !== row.week_start) continue;
              await depsRef.current.patchMessageMetadata(c.m.id, { week_start: to.week_start });
            }
            // and so does the week's intention
            const note = intentionNote(row.week_start);
            if (note) {
              try {
                await store().updateNote(note.id, {
                  target_date: to.week_start,
                  views: { ...(note.views ?? {}), week_review: true, week_start: to.week_start },
                });
              } catch (err) {
                console.warn('[Week] the intention could not be moved to the new week:', err);
              }
              intentionLeft = intentionNote(to.week_start)?.id !== note.id;
            }
          }
        }
      } catch (err) {
        console.warn(
          '[Week] the weekly day moved, but the review could not be counted for the new week:',
          err,
        );
      }
      await useThisWeek
        .getState()
        .refresh()
        .catch((err: unknown) => console.warn('[Week] could not read their week again:', err));
      await save(
        dayAnswerMsgs(
          { moved: true, counted, intentionLeft, today: todayIs, weeklyDay: was },
          part,
        ),
      );
    },
    [save],
  );

  /**
   * A message for Gremly while the review is under way: it goes into the
   * thread as the review's own (unless a tap already put it there), then the
   * turn, then what his reply left. When he cannot be reached the review says
   * so and stays where it is.
   */
  const tell = useCallback(
    async (text: string, shown = false): Promise<void> => {
      const row = session().row;
      if (!row) return;
      const step = stepOf(row);
      if (!shown) await save([typed(text)]);
      const r = await depsRef.current.tellGremly(text);
      if (!r.answered) {
        await save([say(WEEK_COPY.noAnswer, nowPart())]);
        return;
      }
      patchSession({ hold: r.hold ?? null });
      const fixing = session().fixing && step === 'challenge';
      await saveRow((x) => ({
        answers: {
          ...x.answers,
          // what they told Gremly along the way, for the week's spread to weigh
          said: [...(x.answers.said ?? []), { step, text: text.slice(0, 500) }].slice(-SAID_MAX),
          ...(fixing ? { challenge: { agreed: false, note: text.slice(0, 300) } } : {}),
        },
      })).catch((err) => console.warn('[Week] could not keep what they said:', err));
      if (fixing) patchSession({ fixing: false });
    },
    [save, saveRow],
  );

  const handleButton = useCallback(
    (message: SpaceChatMessage, button: OfferButton) =>
      run(async () => {
        // the review's buttons are answered in today's thread only: one left
        // in an earlier day's thread stays as it is
        if (!depsRef.current.threadId) return;
        await choose(message, button.id);
        const part = nowPart();
        await save([tapped(button.label, button.id, button.action)]);
        switch (button.action) {
          case 'week_reason':
            // the reason they tapped goes to Gremly as their words
            await tell(button.value ?? button.label, true);
            return;
          case 'week_start':
          case 'week_retry':
            // by what the week's row says now: straight in, or picked up where it was left
            await route(true);
            return;
          case 'week_skip':
            await skip();
            return;
          case 'week_stop':
            await save(stoppedMsgs(part));
            return;
          case 'week_keep_day':
            await answerDay(false);
            return;
          case 'week_move_day':
            await answerDay(true);
            return;
          default:
        }
      }),
    [answerDay, choose, route, run, save, skip, tell],
  );

  const row = mine ? s.row : null;
  const started = !!row && row.status === 'started';
  // the review is this thread's once the thread holds one of its cards
  const inThread = useMemo(
    () => !!row && stepCards(deps.messages, row.week_start).length > 0,
    [deps.messages, row],
  );
  // and it has the thread until the wrap up speaks after it
  const holds = useMemo(() => hasThread(deps.messages), [deps.messages]);
  const underWay = started && inThread && holds && stepOf(row) !== 'done';

  const underWayRef = useRef(underWay);
  underWayRef.current = underWay;

  const takeTyped = useCallback(
    async (text: string): Promise<boolean> => {
      if (!underWayRef.current) return false;
      // the review's to take: while a step is being saved it waits its turn
      while (busyRef.current) await idleRef.current;
      await run(() => tell(text));
      return true;
    },
    [run, tell],
  );

  const carryOn = useCallback(
    () =>
      run(async () => {
        const now = session();
        const r = now.row;
        if (!r || r.status !== 'started') return;
        const step = stepOf(r);
        if (step === 'done') return;
        // at the challenge, what they typed was their say on the read: the review moves on
        if (step === 'challenge') {
          await settle('challenge', (a) => ({ ...a, challenge: a.challenge ?? { agreed: false } }));
          return;
        }
        // any other step's card comes back at the foot of the thread, with what was picked kept
        const old = cardOf(step);
        if (old) await depsRef.current.patchMessageMetadata(old.id, { superseded: true });
        patchSession({ talking: null, hold: null });
        await save([card(step, r.week_start)]);
      }),
    [cardOf, run, save, settle],
  );

  const onApplied = useCallback(
    async (changes: Change[]) => {
      const now = session();
      const r = now.row;
      if (!r || r.status !== 'started' || !changes.length) return;
      const intention = changes.find((c) => c.op === 'intention');
      const about = now.talking != null ? r.read?.needs_you?.[now.talking] : null;
      if (!intention && !about) return;
      try {
        await saveRow((x) => {
          const answers = { ...x.answers };
          if (intention) {
            answers.intention = String(intention.fields?.text ?? '').trim() || null;
            answers.intention_id = intentionNote(x.week_start)?.id ?? answers.intention_id ?? null;
          }
          if (about) {
            // what was decided on the one they opened, in the card's own words
            const decision = rowWords(changes[0], { relative: false });
            answers.needs_you = [
              ...(answers.needs_you ?? []).filter((n) => n.title !== about.title),
              { title: about.title, item_ids: about.item_ids ?? [], decision },
            ];
          }
          return { answers };
        });
        if (intention) {
          patchDraft((d) => ({
            ...d,
            intention: { pick: null, own: String(intention.fields?.text ?? '').trim() },
          }));
        }
      } catch (err) {
        console.warn('[Week] could not keep what the card changed:', err);
      }
    },
    [saveRow],
  );

  const context = useCallback((): WeekTurnContext | null => {
    const now = session();
    const w = useThisWeek.getState();
    // their weekly day and this week's review are not read yet: nothing true to send
    if (!w.loaded) return null;
    const here = now.threadId === depsRef.current.threadId ? now.row : null;
    // the review Gremly is told about is the one under way here: its cards are
    // in this thread, and the wrap up has not spoken since
    const cards =
      !!here &&
      stepCards(depsRef.current.messages, here.week_start).length > 0 &&
      hasThread(depsRef.current.messages);
    const live =
      here && cards && (here.status === 'started' || (here.status === 'done' && now.finishedHere))
        ? here
        : null;
    const day = getDateService().ritualDay();
    return weekTurnContext({
      today: day,
      weeklyDay: w.weeklyDay,
      daysOff: w.daysOff,
      thisWeek: w.review,
      review: live,
      on: live ? now.on : null,
      intention: intentionOfWeek(live?.week_start ?? cycleOf(day, w.weeklyDay).week_start),
      talking: now.talking,
      hold: now.hold,
    });
  }, []);

  // ── the cards ──────────────────────────────────────────────────────────────

  const editable = (step: ChatStep): boolean => {
    const now = session();
    return (
      !!now.row &&
      now.row.status === 'started' &&
      (stepOf(now.row) === step || now.editing === step)
    );
  };

  const challenge = useMemo(
    () => ({
      agree: () => run(() => settle('challenge', (a) => ({ ...a, challenge: { agreed: true } }))),
      disagree: () =>
        run(async () => {
          if (!editable('challenge')) return;
          patchSession({ fixing: true });
          await saveRow((x) => ({ answers: { ...x.answers, challenge: { agreed: false } } }));
          await save(notQuiteMsgs(nowPart()));
        }),
    }),
    [run, save, saveRow, settle],
  );

  const priorities = useMemo(
    () => ({
      toggle: (index: number) => {
        if (!editable('priorities')) return;
        patchDraft((d) => {
          const has = d.priorities.includes(index);
          if (!has && d.priorities.length >= MAX_PRIORITIES) return d;
          return {
            ...d,
            priorities: has ? d.priorities.filter((i) => i !== index) : [...d.priorities, index],
          };
        });
      },
      done: () =>
        run(async () => {
          const now = session();
          if (!now.draft || !editable('priorities')) return;
          const picked = prioritiesOf(now.row?.read ?? null, now.draft.priorities);
          await settle('priorities', (a) => ({ ...a, priorities: picked }));
        }),
    }),
    [run, settle],
  );

  const shape = useMemo(
    () => ({
      toggleBusy: (day: string) => {
        if (!editable('shape')) return;
        patchDraft((d) => ({
          ...d,
          busy: d.busy.includes(day) ? d.busy.filter((x) => x !== day) : [...d.busy, day].sort(),
        }));
      },
      stepHours: (kind: DayKind, delta: number) => {
        if (!editable('shape')) return;
        patchDraft((d) => ({
          ...d,
          hours: {
            ...d.hours,
            [kind]: Math.max(0, Math.min(HOURS_MAX, (d.hours[kind] ?? 0) + delta)),
          },
        }));
      },
      removeDate: (key: string) => {
        if (!editable('shape')) return;
        patchDraft((d) => ({ ...d, datesOut: [...d.datesOut.filter((k) => k !== key), key] }));
      },
      // a deadline in their own words is Gremly's to read: he offers it on a card
      addDate: async (text: string) => {
        const t = text.trim();
        if (!t || !editable('shape')) return;
        await run(() => tell(t));
      },
      done: () =>
        run(async () => {
          const now = session();
          const d = now.draft;
          if (!d || !now.on || !editable('shape')) return;
          const days = daysPlanned(now.on);
          await settle('shape', (a) => ({
            ...a,
            hours: d.hours,
            // busy days already gone stay as they were
            busy_days: [...(a.busy_days ?? []).filter((x) => !days.includes(x)), ...d.busy].sort(),
            dates_out: d.datesOut,
          }));
        }),
    }),
    [run, settle, tell],
  );

  const intention = useMemo(
    () => ({
      pick: (index: number) => {
        if (!editable('intention')) return;
        patchDraft((d) => ({ ...d, intention: { pick: index, own: '' } }));
      },
      write: (text: string) => {
        if (!editable('intention')) return;
        patchDraft((d) => ({
          ...d,
          intention: { pick: text.trim() ? null : d.intention.pick, own: text },
        }));
      },
      done: () =>
        run(async () => {
          const now = session();
          const r = now.row;
          if (!now.draft || !now.on || !r || !editable('intention')) return;
          const text = intentionOf(r.read, now.draft.intention);
          let noteId = r.answers.intention_id ?? null;
          if (text) {
            // kept as the week's intention note, the way a card of Gremly's keeps it
            const note = intentionNote(r.week_start);
            const was = String(note?.body ?? note?.title ?? '').trim();
            const checked = checkWeekChange(
              { cid: 'week-intention', op: 'intention', intention: text },
              {
                today: today(),
                week: {
                  first: now.on.span_start,
                  last: now.on.span_end,
                  week_start: r.week_start,
                  has_review: true,
                  intention: note ? { id: note.id, text: was } : null,
                },
              },
            );
            if (checked.ok) {
              const out = await applyChange(checked.change, { source: 'thread' });
              if (!out.ok) throw new Error(out.message);
              noteId = out.createdId ?? (note?.id as string | undefined) ?? noteId;
            } else if (checked.reason === 'no_change') {
              noteId = (note?.id as string | undefined) ?? noteId;
            } else {
              throw new Error(`The intention could not be kept: ${checked.reason}`);
            }
          } else if (r.answers.intention) {
            // None this week after all, where the review held one: its note is
            // put away, so the week and Gremly no longer have it.
            const note = intentionNote(r.week_start);
            if (note) {
              await store().archiveNote(note.id, 'cleared in the weekly review');
              if (intentionNote(r.week_start)) {
                throw new Error("The week's intention could not be cleared.");
              }
            }
            noteId = null;
          }
          await settle('intention', (a) => ({
            ...a,
            intention: text || null,
            intention_id: noteId,
          }));
        }),
    }),
    [run, settle],
  );

  const ahead = useMemo(
    () => ({
      toggleStep: (key: string, index: number) => {
        const now = session();
        // steps are chosen before a milestone is set up
        if (!editable('ahead') || now.row?.answers.milestones?.some((m) => m.about === key)) return;
        patchDraft((d) => {
          const out = d.stepsOut[key] ?? [];
          return {
            ...d,
            stepsOut: {
              ...d.stepsOut,
              [key]: out.includes(index) ? out.filter((i) => i !== index) : [...out, index],
            },
          };
        });
      },
      setUp: (key: string) =>
        run(async () => {
          const now = session();
          const r = now.row;
          if (!r || !now.on || !now.draft || !editable('ahead')) return;
          if (r.answers.milestones?.some((m) => m.about === key)) return;
          const m = milestonesShown(r.read, today()).find((x) => x.key === key);
          if (!m) return;
          const out = now.draft.stepsOut[key] ?? [];
          const steps = m.steps.filter((_, i) => !out.includes(i));
          if (!steps.length) return;
          const checked = checkWeekChange(
            {
              cid: `week-milestone-${key}`,
              op: 'milestone',
              milestone: { goal: m.goal, date: m.date, steps },
            },
            {
              today: today(),
              week: {
                first: now.on.span_start,
                last: now.on.span_end,
                week_start: r.week_start,
                has_review: true,
              },
            },
          );
          if (!checked.ok) throw new Error(`The steps could not be set up: ${checked.reason}`);
          const done = await applyChange(checked.change, { source: 'thread' });
          if (!done.ok) throw new Error(done.message);
          try {
            // the check ins went on the row: read what is there now, then add what was set up
            await saveRow((x) => ({
              answers: {
                ...x.answers,
                milestones: [
                  ...(x.answers.milestones ?? []).filter((y) => y.about !== key),
                  { about: key, goal: m.goal, steps: steps.length },
                ],
              },
            }));
          } catch (err) {
            // The row does not say these steps are set up, so the card would
            // offer them again and a second tap would make them twice: they
            // are taken back, and the step fails as a whole.
            try {
              await done.revert();
            } catch (undo) {
              console.warn(
                `[Week] the steps for ${m.goal} were made, the review could not be saved, and they could not be taken back:`,
                undo,
              );
            }
            throw err;
          }
          holdUndo(`milestone:${key}`, done.revert);
        }),
      undo: (key: string) =>
        run(async () => {
          if (!editable('ahead')) return;
          if (!(await runUndo(`milestone:${key}`))) return;
          await saveRow((x) => ({
            answers: {
              ...x.answers,
              milestones: (x.answers.milestones ?? []).filter((y) => y.about !== key),
            },
          }));
        }),
      done: () => run(() => settle('ahead', (a) => a)),
    }),
    [run, saveRow, settle],
  );

  const needsYou = useMemo(
    () => ({
      talk: (index: number) =>
        run(async () => {
          const r = session().row;
          const one = r?.read?.needs_you?.[index];
          if (!r || !one || !editable('needs_you')) return;
          patchSession({ talking: index, hold: null });
          await save(talkMsgs(one.title, one.question));
        }),
      done: () => run(() => settle('needs_you', (a) => a)),
    }),
    [run, save, settle],
  );

  const edit = useCallback((step: ChatStep) => {
    const r = session().row;
    if (!r || r.status !== 'started' || !isPast(step, stepOf(r))) return;
    patchSession({ editing: step });
  }, []);

  const justPlan = useCallback(
    () =>
      run(async () => {
        const now = session();
        const r = now.row;
        const d = now.draft;
        if (!r || !d || !now.on || r.status !== 'started') return;
        const at = stepOf(r);
        if (at === 'done') return;
        const days = daysPlanned(now.on);
        const steps = stepsFor(r.read, today());
        const left = (step: ChatStep) => steps.includes(step) && !isPast(step, at);
        const saved = await saveRow((x) => {
          const a = { ...x.answers };
          // Gremly's picks and guesses stand for what they did not settle themselves
          if (left('challenge')) a.challenge = a.challenge ?? { agreed: true };
          if (left('priorities')) a.priorities = prioritiesOf(r.read, gremlyPicks(r.read));
          if (left('shape')) {
            a.hours = d.hours;
            a.busy_days = [
              ...(a.busy_days ?? []).filter((y) => !days.includes(y)),
              ...d.busy,
            ].sort();
            a.dates_out = d.datesOut;
          }
          if (left('intention')) a.intention = a.intention ?? null;
          return {
            answers: { ...a, step: 'done', guessed: true },
            status: 'done' as const,
            completed_at: getDateService().nowTimestamp(),
          };
        });
        // the card they were on says what was taken for it
        const shown = cardOf(at);
        if (shown) {
          await depsRef.current.patchMessageMetadata(shown.id, {
            settled: settledText(at, saved, { daysOff: daysOff(), days }),
          });
        }
        await save([tapped(WEEK_COPY.justPlan, 'week_just_plan', 'week_just_plan')]);
        await finish(saved, true);
      }),
    [cardOf, finish, run, save, saveRow],
  );

  // the review's own card for a step: the newest one in this thread, for its week
  const liveIds = useMemo(() => {
    const ids = new Set<string>();
    if (!row) return ids;
    const seen = new Set<string>();
    const cards = weekCards(deps.messages).filter((c) => c.meta.week_start === row.week_start);
    // A week being planned again in the thread its first go was finished in:
    // the cards up to that summary belong to the finished go, and only show
    // what was settled on them.
    let from = 0;
    if (row.status === 'started') {
      cards.forEach((c, i) => {
        if (c.meta.card === 'done' && !c.meta.recap) from = i + 1;
      });
    }
    for (let i = cards.length - 1; i >= from; i--) {
      if (seen.has(cards[i].meta.card)) continue;
      seen.add(cards[i].meta.card);
      ids.add(cards[i].m.id);
    }
    return ids;
  }, [deps.messages, row]);
  const isLive = useCallback(
    (meta: WeekCardMeta, messageId: string) =>
      !!row && meta.week_start === row.week_start && liveIds.has(messageId),
    [liveIds, row],
  );

  // Carry on shows when the review is under way and something came after the
  // step's card: a message, Gremly's reply, a change card. Never while he waits
  // for an answer, and never over one of the review's own questions.
  const canCarryOn = useMemo(() => {
    if (!underWay || !row || s.loading || s.hold || busy) return false;
    const visible = visibleThreadMessages(deps.messages);
    const last = visible[visible.length - 1];
    if (!last) return false;
    const meta = briefMetaOf(last);
    const step = stepOf(row);
    if (meta?.type === 'week-card' && meta.card === step && liveIds.has(last.id)) return false;
    if (meta?.type === 'brief-offer' && meta.week && meta.kind !== 'week_reasons' && !meta.chosen)
      return false;
    return true;
  }, [busy, deps.messages, liveIds, row, s.hold, s.loading, underWay]);

  const placeholder = !underWay
    ? null
    : s.hold
      ? WEEK_COPY.holdHint
      : s.fixing
        ? WEEK_COPY.challengeHint
        : WEEK_COPY.typeHint;

  const loading = mine && s.loading;
  // one object that changes only when something a card or the screen draws from does
  return useMemo(
    () => ({
      open,
      handleButton,
      takeTyped,
      carryOn,
      onApplied,
      context,
      underWay,
      canCarryOn,
      loading,
      placeholder,
      busy,
      isLive,
      challenge,
      priorities,
      shape,
      intention,
      ahead,
      needsYou,
      edit,
      justPlan,
    }),
    [
      open,
      handleButton,
      takeTyped,
      carryOn,
      onApplied,
      context,
      underWay,
      canCarryOn,
      loading,
      placeholder,
      busy,
      isLive,
      challenge,
      priorities,
      shape,
      intention,
      ahead,
      needsYou,
      edit,
      justPlan,
    ],
  );
}
