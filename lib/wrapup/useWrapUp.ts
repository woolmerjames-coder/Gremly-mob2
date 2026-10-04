/**
 * The evening wrap up in today's thread.
 *
 * Gremly opens on the day, offers the Sweep cards, then goes through
 * habits, the journal, his questions and the close,
 * all in the thread the morning brief opened. This hook does the work for
 * each step and adds what flow.ts says the step puts in the thread. Where it
 * has got to is kept on the thread (session.ts), so it can be left and picked
 * up from anywhere.
 *
 * Nothing here is written by a model. Every change to an item goes through
 * the change model (a card's decision, a todo moved on, a habit logged) and
 * tonight's journal entry is saved as the old Sweep saved it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import type {
  BriefPlanMeta,
  OfferButton,
  PlanItem,
  SweepHabitsMeta,
  SweepJournalMeta,
  WrapStep,
  WrapUpState,
} from '../brief/types';
import { briefMetaOf, liveOfferId, visibleThreadMessages } from '../brief/messages';
import { ampm, clock } from '../brief/dayCard';
import { withFeedAnimation } from '../brief/feeding';
import { scheduleDcoRefresh } from '../brief/dcoRefresh';
import { applyChange } from '../changes/apply';
import { checkChange } from '../changes/model';
import { contextFor } from '../changes/snapshot';
import { applySweepDecision } from '../changes/sweep';
import { calculateSweepContribution, GAUGE_WEIGHTS } from '../constants/soulDocument';
import { getDateService } from '../date/DateService';
import { meetingsFromStore } from '../plan/storePlan';
import type { Mood } from '../shared/moods';
import { WEEKLY_SKIP_BUDGET, selectWrapUp } from '../store/selectors';
import { useGremlyStore } from '../store/useGremlyStore';
import { useMascotStore } from '../store/useMascotStore';
import { answerQuestion, markQuestionAsked } from '../story/storyApi';
import { supabase } from '../supabase/client';
import { markSweepCompleted } from '../sweep/engine';
import { wrapNow } from './day';
import {
  answeredMsgs,
  buttonsAgain,
  closeMsgs,
  habitsMsgs,
  journalAskMsgs,
  journalSavedMsgs,
  leaveRestMsgs,
  moodAskMsgs,
  newSinceMsgs,
  nightMsgs,
  nightOnlyMsgs,
  notTonightMsgs,
  offerAgain,
  openingMsgs,
  partialMsgs,
  questionMsg,
  questionsStartMsgs,
  resumeMsgs,
  say,
  skippedMsgs,
  sortedMsgs,
  tapped,
  typed,
  type WrapMsg,
} from './flow';
import { habitsToCheckIn, runBefore } from './habits';
import { journalFor, journalTitle, saveJournal, setJournalMoods } from './journal';
import { fetchWrapQuestions, itemKindOf, pickQuestions, type WrapQuestion } from './questions';
import { recapFrom } from './recap';
import {
  type Awaiting,
  currentWrap,
  holdUndo,
  loadWrap,
  recordDecision,
  runUndo,
  setAwaiting,
  undoDecision,
  updateWrap,
  useWrapSession,
} from './session';
import {
  cardsLeft,
  decidedIds,
  keptFor,
  newSince,
  newWrapState,
  pastCards,
  sweepCounts,
} from './state';
import { touchedTonight } from './teaser';
import { WRAP_COPY, habitsSavedLine, nightLine, partWords } from './words';

const STEP_PAUSE_MS = 350;

/** The same buttons with no words above them. */
const noWords = (m: WrapMsg): WrapMsg => ({ ...m, content: '' });

export interface WrapUpDeps {
  /** Today's thread when it is the chat on screen, else null */
  threadId: string | null;
  /** The wrap up state the thread was read with */
  saved: WrapUpState | null | undefined;
  /** Every message of the thread */
  messages: SpaceChatMessage[];
  appendBriefMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, unknown>,
  ) => Promise<SpaceChatMessage | undefined>;
  patchMessageMetadata: (messageId: string, patch: Record<string, unknown>) => Promise<void>;
  /** Whether they can make new items (the journal entry is one) */
  canCreate: boolean;
  onPaywall: () => void;
  /** Open tonight's cards over the thread */
  openCards: () => void;
  /** Open the week planner */
  openWeek: () => void;
  /** Start the planner for a day, in this thread */
  planDay: (day: string) => void | Promise<void>;
  /** Put words back in the box (an entry that could not be saved) */
  restoreDraft?: (text: string) => void;
  /** Pause between the lines Gremly adds; 0 in tests */
  pauseMs?: number;
}

function store(): any {
  return useGremlyStore.getState();
}

/** What the wrap up needs to know now, read from the store and the clock. */
function readNow() {
  const st = store();
  const now = wrapNow();
  const { cards } = selectWrapUp(st);
  const name = typeof st.userName === 'string' ? st.userName.trim() : '';
  return {
    st,
    now,
    cards,
    skipsLeft: Math.max(0, WEEKLY_SKIP_BUDGET - (st.skipsUsedLast7Days ?? 0)),
    firstName: name ? name.split(/\s+/)[0] : null,
  };
}

function clockNow(): string {
  const d = getDateService().now();
  const m = d.getHours() * 60 + d.getMinutes();
  return `${clock(m)} ${ampm(m)}`;
}

/** Today's plan as it was put on Today, from the thread. */
function lockedPlan(messages: SpaceChatMessage[], day: string): PlanItem[] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const meta = briefMetaOf(messages[i]);
    if (meta?.type !== 'brief-plan' || meta.superseded) continue;
    const plan = meta as BriefPlanMeta;
    if (plan.status === 'locked' && plan.date === day) return plan.items;
  }
  return null;
}

/** Tonight's journal entry is in: written, moods picked, or one already there for the day. */
function journalDone(wrap: WrapUpState | null, notes: unknown[], day: string): boolean {
  if (wrap?.journal === 'written' || wrap?.journal === 'mood') return true;
  return !!journalFor(notes as Parameters<typeof journalFor>[0], day);
}

export interface WrapUp {
  /** Start tonight's wrap up, or pick it up where it was left */
  open: () => Promise<void>;
  /** A tap on one of the wrap up's buttons */
  handleButton: (message: SpaceChatMessage, button: OfferButton) => Promise<void>;
  /** A typed message while the wrap up waits for one. False when it is not the wrap up's. */
  takeTyped: (text: string) => Promise<boolean>;
  /** What the next typed message is: the journal entry, an answer, or nothing */
  awaiting: Awaiting;
  /** The X on the pill above the box: the next message goes to Gremly */
  cancelAwaiting: () => void;
  /** The cards closed: the receipt, and what comes next */
  backFromCards: () => Promise<void>;
  /** Put the step's buttons back after an ordinary chat turn */
  resume: () => Promise<void>;
  /** Tomorrow's plan was set or left: good night is offered */
  afterPlan: () => Promise<void>;
  busy: boolean;
  /** Tonight's state, for the cards that draw from it */
  wrap: WrapUpState | null;
  /** Keys whose Undo is still held */
  undoable: Record<string, true>;
  undoDecision: (cid: string) => Promise<void>;
  habits: {
    save: (
      message: SpaceChatMessage,
      done: string[],
      held: Record<string, 'held' | 'not'>,
    ) => Promise<void>;
  };
  journal: {
    saveMoods: (message: SpaceChatMessage, moods: Mood[]) => Promise<void>;
    skipMoods: (message: SpaceChatMessage) => Promise<void>;
    editMoods: (message: SpaceChatMessage, moods: Mood[]) => Promise<void>;
    undo: (message: SpaceChatMessage) => Promise<void>;
  };
}

type LiveOffer = {
  m: SpaceChatMessage;
  meta: Extract<ReturnType<typeof briefMetaOf>, { type: 'brief-offer' }>;
};

/** The wrap up's offer whose buttons are live, if the live offer is one of its own. */
function liveWrapOffer(messages: SpaceChatMessage[]): LiveOffer | null {
  const id = liveOfferId(visibleThreadMessages(messages));
  const m = id ? messages.find((x) => x.id === id) : null;
  const meta = briefMetaOf(m);
  return m && meta?.type === 'brief-offer' && meta.wrap ? { m, meta } : null;
}

/** A plan for the day is already in the thread, proposed or set. */
function planFor(messages: SpaceChatMessage[], day: string): boolean {
  return messages.some((m) => {
    const meta = briefMetaOf(m);
    return (
      meta?.type === 'brief-plan' &&
      !meta.superseded &&
      meta.date === day &&
      (meta.status === 'proposal' || meta.status === 'locked')
    );
  });
}

/** The item a question was about, as it is now, to show under the answer. */
function linkedItem(q: WrapQuestion | null) {
  const kind = itemKindOf(q?.record_table ?? null);
  if (!q?.record_id || !kind) return null;
  const st = store();
  const ds = getDateService();
  const list = kind === 'todo' ? st.todos : kind === 'habit' ? st.habits : st.notes;
  const item = (list as Record<string, any>[]).find((x) => x.id === q.record_id);
  if (!item || item.archived) return null;
  const day = kind === 'todo' ? item.due_day : kind === 'note' ? item.target_date : null;
  return {
    id: item.id as string,
    kind,
    title: String(item.name || item.title || 'Untitled').trim(),
    ...(day ? { when: ds.formatForChip(String(day).slice(0, 10)) } : {}),
  };
}

export function useWrapUp(deps: WrapUpDeps): WrapUp {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const threadId = deps.threadId;
  const wrap = useWrapSession((s) => (threadId && s.threadId === threadId ? s.wrap : null));
  const awaiting = useWrapSession((s) => (threadId && s.threadId === threadId ? s.awaiting : null));
  const undoable = useWrapSession((s) => s.undoable);
  // tonight's questions still to ask; the first is the one on screen
  const queueRef = useRef<WrapQuestion[]>([]);

  // the thread on screen: its saved state is taken once
  useEffect(() => {
    if (threadId) loadWrap(threadId, depsRef.current.saved ?? null);
  }, [threadId]);

  const pause = useCallback(async () => {
    const ms = depsRef.current.pauseMs ?? STEP_PAUSE_MS;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }, []);

  const save = useCallback(
    async (msgs: WrapMsg[]) => {
      const out: (SpaceChatMessage | undefined)[] = [];
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        if (i > 0 || m.role !== 'user') await pause();
        out.push(
          await depsRef.current.appendBriefMessage(
            m.role,
            m.content,
            m.meta as unknown as Record<string, unknown>,
          ),
        );
      }
      return out;
    },
    [pause],
  );

  const run = useCallback(async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } catch (err) {
      console.warn('[WrapUp] a step failed:', err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const patch = useCallback(
    (id: string, meta: Record<string, unknown>) => depsRef.current.patchMessageMetadata(id, meta),
    [],
  );
  const choose = useCallback(
    (message: SpaceChatMessage, id: string) =>
      patch(message.id, { chosen: { id, at: getDateService().nowTimestamp() } }),
    [patch],
  );
  const setStep = (step: WrapStep, more: Partial<WrapUpState> = {}) =>
    updateWrap((w) => (w ? { ...w, step, ...more } : w));

  /** The cards are behind it: the Sweep counts as done for the day (the streak, the last sweep time). */
  const settle = useCallback(async (path: NonNullable<WrapUpState['path']>) => {
    const w = currentWrap();
    if (!w) return;
    const at = getDateService().nowTimestamp();
    updateWrap((x) => (x ? { ...x, path: x.path ?? path, settled_at: x.settled_at ?? at } : x));
    if (w.settled_at) return;
    const st = store();
    if (!st.userId) return;
    const c = sweepCounts(w.decisions);
    try {
      const res = await markSweepCompleted(st.userId, supabase, { kept: c.kept, cleared: c.letGo });
      if (res.streak > 0) {
        st.setSweepPreferences?.({
          lastSweepCompletedAt: at,
          sweepStreak: res.streak,
          totalSweepCount: (st.totalSweepCount ?? 0) + 1,
        });
      }
    } catch (err) {
      console.warn('[WrapUp] could not mark the Sweep done:', err);
    }
  }, []);

  /** Feeding for the cards sorted so far: what the old Sweep gave, credited as it goes. */
  const creditCards = useCallback(async () => {
    const w = currentWrap();
    if (!w) return;
    const decided = sweepCounts(w.decisions).decided;
    const had = w.credited ?? 0;
    if (decided <= had) return;
    const delta =
      calculateSweepContribution(decided, false) - calculateSweepContribution(had, false);
    updateWrap((x) => (x ? { ...x, credited: decided } : x));
    if (delta > 0.0001) {
      await withFeedAnimation(() => store().addGaugeContribution('sweep', delta)).catch((err) =>
        console.warn('[WrapUp] could not credit the cards:', err),
      );
    }
  }, []);

  /** Put the buttons for the step back when none are live (after a chat turn, or on coming back). */
  const buttonsBack = useCallback(async () => {
    const d = depsRef.current;
    const w = currentWrap();
    if (!w || !d.threadId) return;
    if (liveOfferId(visibleThreadMessages(d.messages))) return;
    const { st, now, cards, skipsLeft } = readNow();
    const msgs = buttonsAgain(w.step, {
      day: now.words,
      skipsLeft,
      left: cardsLeft(w, cards).length,
      journalDone: journalDone(w, st.notes, now.day),
      question: queueRef.current[0] ?? null,
      canPlan: !planFor(d.messages, now.tomorrow),
    });
    if (msgs.length) await save(msgs);
  }, [save]);

  // ── the steps, last first (each one hands on to the next) ──────────────────

  const toClose = useCallback(async () => {
    const w = currentWrap();
    if (!w) return;
    setAwaiting(null);
    queueRef.current = [];
    setStep('close');
    // a night with nothing to sort: finishing the wrap up feeds, as one card would
    if (w.path === 'clear' && !(w.credited && w.credited > 0)) {
      updateWrap((x) => (x ? { ...x, credited: 1 } : x));
      await withFeedAnimation(() =>
        store().addGaugeContribution('sweep', calculateSweepContribution(1, false)),
      ).catch((err) => console.warn('[WrapUp] could not credit the wrap up:', err));
    }
    const { now } = readNow();
    const lined = keptFor(w, now.tomorrow);
    await save(
      closeMsgs({
        day: now.words,
        meetings: meetingsFromStore(now.tomorrow).length,
        lined,
        canPlan: !planFor(depsRef.current.messages, now.tomorrow),
      }),
    );
  }, [save]);

  const nextQuestion = useCallback(async () => {
    queueRef.current = queueRef.current.slice(1);
    const next = queueRef.current[0];
    await pause();
    if (!next) return toClose();
    setAwaiting('question');
    await save([questionMsg(next)]);
  }, [pause, save, toClose]);

  /** An answer, tapped or typed: saved to what Gremly knows, then the next question. */
  const answered = useCallback(
    async (questionId: string | undefined, answer: string) => {
      setAwaiting(null);
      const saved = questionId
        ? await answerQuestion(questionId, answer).catch(() => false)
        : false;
      if (saved) scheduleDcoRefresh();
      const q = queueRef.current.find((x) => x.id === questionId) ?? null;
      await save(answeredMsgs(saved, saved ? linkedItem(q) : null));
      await nextQuestion();
    },
    [save, nextQuestion],
  );

  const toQuestions = useCallback(async () => {
    const w = currentWrap();
    if (!w) return;
    let open: WrapQuestion[] = [];
    try {
      open = await fetchWrapQuestions();
    } catch (err) {
      console.warn("[WrapUp] could not read Gremly's questions:", err);
    }
    const askedToday = new Set<string>();
    for (const m of depsRef.current.messages) {
      const meta = briefMetaOf(m);
      if (meta?.type === 'brief-offer' && meta.question_id) askedToday.add(meta.question_id);
    }
    const picked = pickQuestions(open, {
      day: readNow().now.day,
      decidedIds: decidedIds(w),
      askedToday,
    });
    if (!picked.length) return toClose();
    queueRef.current = picked;
    setStep('questions', { questions: picked.map((q) => q.id) });
    setAwaiting('question');
    await save(questionsStartMsgs(picked.length, picked[0]));
  }, [save, toClose]);

  /** After the journal: good night when only the journal was wanted, the close on a skip night, else his questions. */
  const afterJournal = useCallback(async () => {
    const w = currentWrap();
    if (!w) return;
    setAwaiting(null);
    if (w.journal_only) {
      setStep('declined', { journal_only: false });
      const { now, firstName } = readNow();
      await save([say(nightLine(firstName, now.words.early))]);
      return;
    }
    if (w.path === 'skip') return toClose();
    return toQuestions();
  }, [save, toClose, toQuestions]);

  /** The journal is asked on every path; it is passed over only when tonight's entry is already written. */
  const toJournal = useCallback(async () => {
    const w = currentWrap();
    if (!w) return;
    const { st, now } = readNow();
    if (journalDone(w, st.notes, now.day)) return afterJournal();
    setStep('journal');
    // the box saves to the journal from here; the pill above it says so
    setAwaiting('journal');
    await save(journalAskMsgs(!!w.journal_only, now.words.early));
  }, [save, afterJournal]);

  const toHabits = useCallback(async () => {
    const { st, now } = readNow();
    const { rows, already } = habitsToCheckIn(st.habits, st.habitProgress ?? [], now.day);
    if (!rows.length) return toJournal();
    setStep('habits');
    await save(habitsMsgs(rows, already, now.day, now.words.early));
  }, [save, toJournal]);

  const start = useCallback(async () => {
    const d = depsRef.current;
    await store()
      .refreshSkipBudget?.()
      ?.catch(() => undefined);
    const { st, now, cards, skipsLeft, firstName } = readNow();
    const recap = recapFrom({
      day: now.day,
      dayStartMs: now.dayStartMs,
      todos: st.todos,
      habits: st.habits,
      habitProgress: st.habitProgress ?? [],
      notes: st.notes,
      meetings: meetingsFromStore(now.day).length,
      plan: lockedPlan(d.messages, now.day),
    });
    updateWrap(() =>
      newWrapState(
        getDateService().nowTimestamp(),
        cards.map((c) => c.candidate.id),
        cards.length ? null : 'clear',
      ),
    );
    useMascotStore.getState().requestMode('waving');
    await save(
      openingMsgs({
        clock: clockNow(),
        recap,
        day: now.words,
        firstName,
        evening: now.evening,
        cards: cards.length,
        skipsLeft,
      }),
    );
    if (cards.length) return;
    await settle('clear');
    await pause();
    await toHabits();
  }, [save, pause, settle, toHabits]);

  /** One receipt in the thread: an earlier one is put away when a new one is added. */
  const receiptsAway = useCallback(async () => {
    for (const m of depsRef.current.messages) {
      const meta = briefMetaOf(m);
      if (meta?.type === 'sweep-receipt' && !meta.superseded) {
        await patch(m.id, { superseded: true });
      }
    }
  }, [patch]);

  const cardsBack = useCallback(async () => {
    const w = currentWrap();
    if (!w || !depsRef.current.threadId) return;
    const decidedNow = useWrapSession.getState().cardsDecided;
    useWrapSession.setState({ cardsDecided: 0 });
    const { now, cards, skipsLeft } = readNow();
    const left = cardsLeft(w, cards).length;
    // new cards sorted after the wrap up had already moved on
    const extra = pastCards(w);

    if (decidedNow === 0 && left > 0) {
      // closed with nothing decided: the same choices again
      if (extra) return save(newSinceMsgs(left)).then(() => undefined);
      if (w.decisions.length) {
        setStep('partial');
        await save(
          buttonsAgain('partial', {
            day: now.words,
            skipsLeft,
            left,
            journalDone: false,
            question: null,
            canPlan: true,
          }),
        );
      } else {
        setStep('offer');
        await save(offerAgain(now.words, skipsLeft));
      }
      return;
    }

    await receiptsAway();
    await creditCards();
    const c = sweepCounts(currentWrap()?.decisions ?? []);
    if (left > 0) {
      if (!extra) setStep('partial');
      await save(partialMsgs(c.decided, left, now.words));
      return;
    }
    await save(sortedMsgs(c.letGo));
    if (extra) return buttonsBack();
    await settle('cards');
    await pause();
    await toHabits();
  }, [save, pause, settle, toHabits, receiptsAway, creditCards, buttonsBack]);

  const backFromCards = useCallback(() => run(cardsBack), [run, cardsBack]);
  const resume = useCallback(() => run(buttonsBack), [run, buttonsBack]);

  const afterPlan = useCallback(
    () =>
      run(async () => {
        const d = depsRef.current;
        if (currentWrap()?.step !== 'close') return;
        if (liveOfferId(visibleThreadMessages(d.messages))) return;
        await save(nightOnlyMsgs(readNow().now.words));
      }),
    [run, save],
  );

  const open = useCallback(
    () =>
      run(async () => {
        const d = depsRef.current;
        if (!d.threadId) return;
        loadWrap(d.threadId, d.saved ?? null);
        const w = currentWrap();
        if (!w) return start();
        const { now, cards, skipsLeft } = readNow();
        // turned down earlier in the day, and now it is the evening: that no
        // was about then. Tonight opens on the day as it stands now
        if (w.step === 'declined' && now.evening && !touchedTonight(w, now.dayEndHour)) {
          return start();
        }
        const left = cardsLeft(w, cards);
        if (w.step === 'declined') {
          if (!left.length) {
            await settle('clear');
            return toHabits();
          }
          // coming back after Not tonight: the same choices, said once more
          setStep('offer', {
            journal_only: false,
            items: [...new Set([...w.items, ...left.map((c) => c.candidate.id)])],
          });
          await save(resumeMsgs(left.length, now.words, skipsLeft));
          return;
        }
        // left while the cards were open: pick up as if they had just closed
        if (w.step === 'cards' && !useWrapSession.getState().cardsOpen) return cardsBack();
        if (w.step === 'close' || w.step === 'done') {
          // new things since it was finished: once, for the new ones only
          const fresh = newSince(w, cards);
          if (fresh.length) {
            updateWrap((x) =>
              x ? { ...x, items: [...x.items, ...fresh.map((c) => c.candidate.id)] } : x,
            );
            await save(newSinceMsgs(fresh.length));
            return;
          }
        }
        await buttonsBack();
      }),
    [run, save, start, settle, toHabits, cardsBack, buttonsBack],
  );

  // ── the offer's other choices ──────────────────────────────────────────────

  /** Move it all on: one of the weekly skips. It skips only the cards; habits and the journal still come. */
  const skipNight = useCallback(
    async (button: OfferButton) => {
      const { now, cards } = readNow();
      const left = cardsLeft(currentWrap(), cards);
      const todoCards = left.filter((c) => c.candidate.kind === 'todo');
      let moved = 0;
      for (const c of todoCards) {
        const res = await applySweepDecision({
          candidateId: c.candidate.id,
          candidateKind: 'todo',
          action: 'keep',
          dueDateStr: now.tomorrow,
        });
        if (!res.ok) continue;
        recordDecision(res.record, res.revert);
        moved += 1;
      }
      const st = store();
      if (st.userId) {
        const { error } = await supabase
          .from('sweep_skip_events')
          .insert({ owner_id: st.userId, target_date: now.tomorrow, todo_count: moved });
        if (error) console.warn('[WrapUp] could not record the skip:', error);
        await st.refreshSkipBudget?.()?.catch(() => undefined);
      }
      updateWrap((x) => (x ? { ...x, path: 'skip' } : x));
      await save(
        skippedMsgs(
          button,
          { moved, waiting: left.length - todoCards.length, skipsLeft: readNow().skipsLeft },
          now.words,
        ),
      );
      await settle('skip');
      await pause();
      await toHabits();
    },
    [save, pause, settle, toHabits],
  );

  const handleButton = useCallback(
    async (message: SpaceChatMessage, button: OfferButton): Promise<void> => {
      const meta = briefMetaOf(message);
      if (meta?.type !== 'brief-offer' || meta.chosen) return;
      const d = depsRef.current;
      if (!d.threadId) return;
      loadWrap(d.threadId, d.saved ?? null);

      switch (button.action) {
        case 'journal_write':
          // nothing is added: the box saves to the journal from here
          setAwaiting('journal');
          return;
        case 'answer_other':
          setAwaiting('question');
          return;
        case 'plan_week':
          // the offer stays as it is, for when they come back
          d.openWeek();
          return;
        default:
          break;
      }

      return run(async () => {
        await choose(message, button.id);
        switch (button.action) {
          case 'sweep':
            await save([tapped(button)]);
            if (!pastCards(currentWrap())) setStep('cards');
            depsRef.current.openCards();
            return;
          case 'sweep_skip':
            return skipNight(button);
          case 'not_tonight': {
            const { st, now } = readNow();
            setAwaiting(null);
            setStep('declined');
            await save(
              notTonightMsgs(
                button,
                journalDone(currentWrap(), st.notes, now.day),
                now.words.early,
              ),
            );
            return;
          }
          case 'sweep_leave': {
            const w = currentWrap();
            const { now, cards } = readNow();
            const left = cardsLeft(w, cards).length;
            await save(leaveRestMsgs(button, left, now.words));
            if (pastCards(w)) return buttonsBack();
            await settle('cards');
            await pause();
            return toHabits();
          }
          case 'journal_only':
            await save([tapped(button)]);
            updateWrap((x) => (x ? { ...x, journal_only: true } : x));
            return toJournal();
          case 'journal_mood': {
            const { now } = readNow();
            setAwaiting(null);
            await save(
              moodAskMsgs(
                button,
                now.day,
                journalTitle(now.words.weekday, false, now.part),
                now.words.early,
              ),
            );
            return;
          }
          case 'journal_skip':
            setAwaiting(null);
            await save([tapped(button), say(WRAP_COPY.journalSkipped)]);
            updateWrap((x) => (x ? { ...x, journal: 'skipped' } : x));
            await pause();
            return afterJournal();
          case 'answer':
            await save([tapped(button)]);
            return answered(meta.question_id, button.value || button.label);
          case 'skip':
            setAwaiting(null);
            if (meta.question_id) {
              markQuestionAsked(meta.question_id).catch((err) =>
                console.warn('[WrapUp] could not mark the question asked:', err),
              );
            }
            await save([tapped(button), say(WRAP_COPY.questionSkipped)]);
            return nextQuestion();
          case 'plan_tomorrow':
            await save([tapped(button)]);
            await depsRef.current.planDay(readNow().now.tomorrow);
            return;
          case 'night': {
            const { now, firstName } = readNow();
            await save(nightMsgs(button, firstName, now.day, now.words.early));
            setStep('done', { finished_at: getDateService().nowTimestamp() });
            useMascotStore.getState().requestMode(store().isFedToday ? 'fed' : 'waving');
            return;
          }
          default:
            return;
        }
      });
    },
    [
      run,
      choose,
      save,
      pause,
      settle,
      skipNight,
      toHabits,
      toJournal,
      afterJournal,
      answered,
      nextQuestion,
      buttonsBack,
    ],
  );

  /** Tonight's entry is in: Gremly is fed for it, once a night. */
  const creditJournal = useCallback(() => {
    if (currentWrap()?.journal_fed) return;
    updateWrap((x) => (x ? { ...x, journal_fed: true } : x));
    void withFeedAnimation(() =>
      store().addGaugeContribution('journal', GAUGE_WEIGHTS.JOURNAL_BONUS),
    ).catch((err) => console.warn('[WrapUp] could not credit the journal:', err));
  }, []);

  const takeTyped = useCallback(
    async (text: string): Promise<boolean> => {
      const d = depsRef.current;
      const session = useWrapSession.getState();
      const words = text.trim();
      if (!session.awaiting || !words || !d.threadId || session.threadId !== d.threadId) {
        return false;
      }
      const live = liveWrapOffer(d.messages);
      const wanted = session.awaiting === 'journal' ? 'journal' : 'question';
      // what it was waiting on has gone: the message is an ordinary one
      if (!live || live.meta.kind !== wanted) {
        setAwaiting(null);
        return false;
      }
      // Gremly is mid step: the words go back in the box, to send again
      if (busyRef.current) {
        d.restoreDraft?.(text);
        return true;
      }

      if (session.awaiting === 'question') {
        await run(async () => {
          await choose(live.m, 'typed');
          await save([typed(words, 'answer')]);
          await answered(live.meta.question_id, words);
        });
        return true;
      }

      if (!d.canCreate) {
        d.restoreDraft?.(text);
        d.onPaywall();
        return true;
      }
      await run(async () => {
        const { now } = readNow();
        setAwaiting(null);
        await choose(live.m, 'typed');
        await save([typed(words, 'journal_write')]);
        const res = await saveJournal({
          text: words,
          moods: [],
          day: now.day,
          weekday: now.words.weekday,
          part: now.part,
        });
        if (!res.ok) {
          // not saved: their words go back in the box, and the journal waits as it was
          depsRef.current.restoreDraft?.(text);
          await save([
            say(WRAP_COPY.journalFailed),
            ...journalAskMsgs(false, now.words.early).map(noWords),
          ]);
          setAwaiting('journal');
          return;
        }
        holdUndo(`journal:${res.noteId}`, res.revert);
        const out = await save(
          journalSavedMsgs({
            day: now.day,
            noteId: res.noteId,
            title: res.title,
            text: words,
            early: now.words.early,
          }),
        );
        updateWrap((x) => (x ? { ...x, journal: 'written' } : x));
        creditJournal();
        // the moods read from their words arrive a little later
        const card = out[1];
        void res.moods.then((found) => {
          if (found?.length && card) void patch(card.id, { moods: found });
        });
        await pause();
        await afterJournal();
      });
      return true;
    },
    [run, choose, save, pause, patch, answered, afterJournal, creditJournal],
  );

  const cancelAwaiting = useCallback(() => setAwaiting(null), []);

  // ── the cards in the thread ────────────────────────────────────────────────

  const undoOne = useCallback(async (cid: string) => {
    await undoDecision(cid);
  }, []);

  const habits = {
    /** Log what happened today. Each check in is the change model's log, on the person's day. */
    save: useCallback(
      (message: SpaceChatMessage, done: string[], held: Record<string, 'held' | 'not'>) =>
        run(async () => {
          const meta = briefMetaOf(message);
          if (meta?.type !== 'sweep-habits' || meta.status !== 'open') return;
          const card = meta as SweepHabitsMeta;
          const heldIds = Object.keys(held).filter((id) => held[id] === 'held');
          const logged = new Set<string>();
          for (const id of [...done, ...heldIds]) {
            const raw = { op: 'log', type: 'habit', id, days: [card.date] };
            const checked = checkChange(raw, contextFor(raw));
            if (!checked.ok) continue;
            const res = await applyChange(
              { ...checked.change, cid: `habit-${id}` },
              { source: 'sweep' },
            );
            if (res.ok) logged.add(id);
          }
          const titleOf = (id: string) => card.habits.find((h) => h.id === id)?.title ?? '';
          const built = done.filter((id) => logged.has(id));
          // the first one with a run of days, as it stands now
          let streak: { title: string; days: number } | null = null;
          const progress = (store().habitProgress ?? []) as {
            habit_id: string;
            occurred_day: string;
          }[];
          for (const id of built) {
            const days = new Set(
              progress
                .filter((p) => p.habit_id === id)
                .map((p) => String(p.occurred_day).slice(0, 10)),
            );
            const n = runBefore(days, card.date) + 1;
            if (n >= 3) {
              streak = { title: titleOf(id), days: n };
              break;
            }
          }
          await patch(message.id, { status: 'saved', done: built, held });
          await save([
            say(
              habitsSavedLine({
                logged: built.length,
                streak,
                held: heldIds.filter((id) => logged.has(id)).map(titleOf),
                notHeld: Object.keys(held)
                  .filter((id) => held[id] === 'not')
                  .map(titleOf),
                early: card.early,
              }),
            ),
          ]);
          await pause();
          await toJournal();
        }),
      [run, patch, save, pause, toJournal],
    ),
  };

  const journal = {
    /** Just pick a mood: tonight's reflection is the moods alone. */
    saveMoods: useCallback(
      (message: SpaceChatMessage, moods: Mood[]) =>
        run(async () => {
          const meta = briefMetaOf(message);
          if (meta?.type !== 'sweep-journal' || meta.status !== 'mood' || !moods.length) return;
          if (!depsRef.current.canCreate) return depsRef.current.onPaywall();
          const card = meta as SweepJournalMeta;
          const { now } = readNow();
          const res = await saveJournal({
            text: '',
            moods,
            day: card.date,
            weekday: now.words.weekday,
            part: now.part,
          });
          if (!res.ok) {
            await save([say(WRAP_COPY.journalFailed)]);
            return;
          }
          holdUndo(`journal:${res.noteId}`, res.revert);
          await patch(message.id, { status: 'saved', note_id: res.noteId, moods });
          updateWrap((x) => (x ? { ...x, journal: 'mood' } : x));
          creditJournal();
          await save([say(partWords(now.words.early).journalMoodSaved)]);
          await pause();
          await afterJournal();
        }),
      [run, patch, save, pause, afterJournal, creditJournal],
    ),
    skipMoods: useCallback(
      (message: SpaceChatMessage) =>
        run(async () => {
          const meta = briefMetaOf(message);
          if (meta?.type !== 'sweep-journal' || meta.status !== 'mood') return;
          await patch(message.id, { status: 'skipped' });
          updateWrap((x) => (x ? { ...x, journal: 'skipped' } : x));
          await save([say(WRAP_COPY.journalSkipped)]);
          await pause();
          await afterJournal();
        }),
      [run, patch, save, pause, afterJournal],
    ),
    editMoods: useCallback(
      async (message: SpaceChatMessage, moods: Mood[]) => {
        const meta = briefMetaOf(message);
        if (meta?.type !== 'sweep-journal' || meta.status !== 'saved' || !meta.note_id) return;
        try {
          await setJournalMoods(meta.note_id, meta.date, moods);
          await patch(message.id, { moods });
        } catch (err) {
          console.warn('[WrapUp] could not change the moods:', err);
        }
      },
      [patch],
    ),
    /** Take tonight's entry back out of the journal. */
    undo: useCallback(
      async (message: SpaceChatMessage) => {
        const meta = briefMetaOf(message);
        if (meta?.type !== 'sweep-journal' || meta.status !== 'saved' || !meta.note_id) return;
        if (!(await runUndo(`journal:${meta.note_id}`))) return;
        await patch(message.id, { status: 'removed' });
        updateWrap((x) => (x ? { ...x, journal: 'skipped' } : x));
      },
      [patch],
    ),
  };

  return {
    open,
    handleButton,
    takeTyped,
    awaiting,
    cancelAwaiting,
    backFromCards,
    resume,
    afterPlan,
    busy,
    wrap,
    undoable,
    undoDecision: undoOne,
    habits,
    journal,
  };
}
