/**
 * Planning in today's thread (Daily brief in Chat).
 *
 * Plan my day / afternoon / evening asks the plan picker which candidates go
 * in, places them on the device, and adds Gremly's line, the plan card and up
 * to three suggested changes. Removing (×) and Add something change the card
 * in place with no AI call. A suggested or typed change proposes a new
 * version, and the earlier one folds to "Earlier plan, replaced". Saying yes
 * writes the plan to Today. Not now folds the card, with Show it again.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import { callPlanPick } from '../cortex/CortexClient';
import { patchDailyThreadMeta } from '../repo/dailyThreadRepo';
import { useGremlyStore } from '../store/useGremlyStore';
import { selectOverdueTodos } from '../store/selectors';
import { briefMetaOf, dayPartAt } from '../brief/messages';
import { clearFrom } from '../brief/pinned';
import { minutesOfDay, minutesOfTheirDay } from '../brief/time';
import { planLabel } from '../brief/offerFlow';
import { useTodayThread } from '../brief/todayThread';
import type {
  BriefOfferMeta,
  BriefPlanMeta,
  OfferButton,
  PlanItem,
  UnplacedItem,
} from '../brief/types';
import { applyChanges } from '../changes/apply';
import { checkChange, type Change } from '../changes/model';
import { contextFor } from '../changes/snapshot';
import { backDayName, laterBackDay, laterOffered } from '../sweep/cardDays';
import type { Candidate } from './candidatePool';
import {
  PLAN_COPY,
  dayAfter,
  dayAfterWord,
  planRoom,
  spacingAskText,
  spacingButtons,
  unfitAskText,
  unfitButtons,
  unfitLaterText,
  unfitLeftText,
  unfitMovedText,
  unfitStayedText,
  type PickRoom,
  type PlanFit,
  applyOp,
  changeText,
  entriesOf,
  entryFromCandidate,
  placePlan,
  refitKeeping,
  fitPlan,
  CHOSEN_REASON,
  alreadySetText,
  dismissedText,
  planDay,
  yesText,
  namesOf,
  suggestions,
  unplacedText,
  whatCanWait,
  type PlanEntry,
  type PlanOp,
} from './planFlow';
import {
  candidateFromStore,
  dayRecordFromStore,
  lockPlanItems,
  meetingsFromStore,
  plannedTimePatch,
  poolForDay,
  saveEstimates,
} from './storePlan';
import { DEFAULT_PLAN_END, type DayRecord, type DayThreadMeta } from '../brief/dayRecord';
import { generateDropId } from '../minddrop/ids';
import { syncPlanItems, timeSignature, type StoreTimes } from './livePlan';
import { PLAN_DAY_END, freeMinutes, roomLeft } from './slotFitter';
import { getDateService, nowTimestamp } from '../date/DateService';

/** What the day turn's changes mean for the plan (lib/brief/applyChanges.ts). */
export interface PlanChange {
  add: {
    id: string;
    kind: 'todo' | 'habit';
    start: number | null;
    /** No time, but a stretch of the day: it is fitted in from here */
    after?: number | null;
    minutes: number | null;
  }[];
  remove: string[];
  pin: { id: string; start: number }[];
}

export interface PlanFlowDeps {
  threadId: string | null;
  /** The thread's ritual day */
  date: string;
  /** Every message of the thread */
  messages: SpaceChatMessage[];
  appendBriefMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, unknown>,
  ) => Promise<SpaceChatMessage | undefined>;
  patchMessageMetadata: (messageId: string, patch: Record<string, unknown>) => Promise<void>;
  /** A new plan card was added (the screen scrolls its top into view) */
  onNewPlan?: (messageId: string) => void;
}

const up5 = (m: number) => Math.ceil(m / 5) * 5;

function planMetaOf(m: SpaceChatMessage | undefined | null): BriefPlanMeta | null {
  const meta = briefMetaOf(m);
  return meta?.type === 'brief-plan' && !meta.superseded ? (meta as BriefPlanMeta) : null;
}

/** The plan that counts: the newest proposal or locked plan (for a day, when given). */
export function livePlanOf(messages: SpaceChatMessage[], day?: string): SpaceChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const meta = planMetaOf(messages[i]);
    if (meta && (meta.status === 'proposal' || meta.status === 'locked')) {
      if (!day || meta.date === day) return messages[i];
    }
  }
  return null;
}

/**
 * Today, for a plan, is the person's day: it ends at their day end, not at
 * midnight. So after midnight "today" is still the day being wrapped up
 * (with no time left in it), and the plan for the day the clock already
 * shows is a plan for another day, from the morning.
 */
const theirDay = () => getDateService().ritualDay();
const isToday = (day: string) => day === theirDay();

/** The words for a plan's day, as the person would say it now. */
export function planDayNow(day: string) {
  return planDay(day, theirDay(), getDateService().isInLateNightPeriod());
}

/** Nothing in a plan for today starts before now; a plan for another day keeps its start. */
function fromFor(meta: BriefPlanMeta): number {
  return isToday(meta.date)
    ? Math.max(meta.from ?? 0, up5(minutesOfTheirDay()))
    : (meta.from ?? PLAN_DAY_START);
}

/** The earliest a time the person names can go: now on today's plan, any time on another day. */
function nowFor(meta: BriefPlanMeta): number {
  return isToday(meta.date) ? up5(minutesOfTheirDay()) : 0;
}

/** Planning another day starts at 8am. */
export const PLAN_DAY_START = 8 * 60;

/** What the picker hears about the day's set times and travel. */
function frameForPicker(rec: DayRecord) {
  return {
    fixed: rec.blocks.map((b) => ({
      title: b.title,
      start: b.start,
      end: b.end,
      travel: b.travel,
    })),
    travel: rec.travel ? { label: rec.travel.label, departs: rec.travel.departs } : null,
    plan_end: rec.planEnd,
  };
}

/** Re-fit a day's plan around its meetings and set times, ending when they set off. */
/**
 * A plan fitted again after a change, keeping what the person gave a time
 * themselves where it is (planFlow.ts refitKeeping).
 */
function refitForDay(
  entries: PlanEntry[],
  meta: BriefPlanMeta,
  from: number,
  touched: Iterable<string> = [],
) {
  const rec = dayRecordFromStore(meta.date);
  return refitKeeping(
    entries,
    meta.items,
    rec.busy,
    from,
    rec.planEnd,
    touched,
    nowFor(meta),
    // the plan's own gap: one made back to back stays back to back
    meta.buffer,
  );
}

/** The pool for a plan: the day's candidates, plus anything the plan holds that is not one now. */
function poolWith(entries: PlanEntry[], day: string): Candidate[] {
  const pool = poolForDay(day);
  const ids = new Set(pool.map((c) => c.id));
  for (const e of entries) {
    if (ids.has(e.id)) continue;
    pool.push({
      id: e.id,
      kind: e.kind,
      title: e.title,
      minutes: e.minutes,
      why: e.reason ?? '',
      window: e.window,
      source: e.kind === 'reach' ? 'reach' : 'due',
      fromFact: e.fromFact,
    });
  }
  return pool;
}

/** The pick sheet while a plan is being made (components/brief/PickSheet.tsx). */
export interface PickSession {
  day: string;
  /** Free minutes in the day from where planning starts */
  free: number;
  /** Gremly's suggestions, null while it chooses */
  suggested:
    | {
        id: string;
        kind: 'todo' | 'habit';
        title: string;
        minutes: number;
        reason: string | null;
      }[]
    | null;
}

interface SessionData {
  day: string;
  from: number;
  pool: Candidate[];
  kept: string[];
  /** Gremly's picks as plan entries, once back */
  entries: PlanEntry[] | null;
  intro: string | null;
}

/** "Before I plan, is there anything that has to happen today…" */
export function askFirstText(d: { today: boolean; word: string }): string {
  return `Happy to. Before I plan, is there anything that has to happen ${d.word}, or something you'd like to put first?`;
}

/** The picker's answer as plan entries, with Gremly's line and the lengths it estimated. */
function picksOf(
  res: Awaited<ReturnType<typeof callPlanPick>>,
  pool: Candidate[],
  from: number,
): {
  entries: PlanEntry[];
  intro: string | null;
  estimates: { id: string; kind: string; minutes: number }[];
} {
  const byId = new Map(pool.map((c) => [c.id, c]));
  if (res.ok && res.data?.picks?.length) {
    const entries = res.data.picks.flatMap((p): PlanEntry[] => {
      const c = byId.get(p.id);
      if (!c) return [];
      return [
        {
          ...entryFromCandidate(c, from, p.window),
          minutes: p.minutes,
          reason: p.reason || c.why || null,
        },
      ];
    });
    return {
      entries,
      intro: res.data.intro ?? null,
      estimates: res.data.picks
        .filter((p) => p.estimated)
        .map((p) => ({ id: p.id, kind: byId.get(p.id)?.kind ?? 'todo', minutes: p.minutes })),
    };
  }
  if (!res.ok) console.warn('[Plan] the picker could not be reached:', res.error);
  // without the picker: the first few candidates
  const entries: PlanEntry[] = [];
  for (const c of pool.filter((x) => x.source !== 'reach')) {
    entries.push(entryFromCandidate(c, from));
    if (entries.length >= 4) break;
  }
  return { entries, intro: null, estimates: [] };
}

/** What was kept in Sweep is in the plan, as theirs. */
function withKept(
  entries: PlanEntry[],
  pool: Candidate[],
  kept: string[],
  from: number,
): PlanEntry[] {
  const out = [...entries];
  for (const id of kept) {
    const at = out.findIndex((e) => e.id === id);
    if (at >= 0) {
      out[at] = { ...out[at], chosen: true };
      continue;
    }
    const c = pool.find((x) => x.id === id);
    if (c) out.push({ ...entryFromCandidate(c, from), reason: PLAN_COPY.keptReason, chosen: true });
  }
  return out;
}

/** What the sheet hands back for each pick. */
type SheetPick = { id: string; kind: 'todo' | 'habit'; minutes: number; estimated?: boolean };

/**
 * The plan entries for what was picked on the sheet, all theirs, with what
 * was kept in Sweep. One of Gremly's suggestions keeps the window and reason
 * Gremly gave it. Used to make the plan and to say how the picks fit, so the
 * two agree.
 */
function entriesForPicks(
  sess: SessionData,
  picks: SheetPick[],
): { entries: PlanEntry[]; pool: Candidate[] } {
  const pool = [...sess.pool];
  const gremly = new Map((sess.entries ?? []).map((e) => [e.id, e]));
  const entries: PlanEntry[] = [];
  for (const p of picks) {
    const g = gremly.get(p.id);
    if (g) {
      entries.push({ ...g, chosen: true });
      continue;
    }
    const c = pool.find((x) => x.id === p.id) ?? candidateFromStore(p.id, p.kind);
    if (!c) continue;
    if (!pool.some((x) => x.id === c.id)) pool.push(c);
    const e = entryFromCandidate(c, sess.from);
    entries.push({
      ...e,
      minutes: c.minutes ?? p.minutes,
      chosen: true,
      reason: CHOSEN_REASON,
    });
  }
  return { entries: withKept(entries, pool, sess.kept, sess.from), pool };
}

/** A plan entry as it is kept on a message, and read back from one. */
function unplacedOf(e: PlanEntry): UnplacedItem {
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    window: e.window,
    minutes: e.minutes,
    reason: e.reason,
    fromFact: e.fromFact,
    ...(e.chosen ? { chosen: true } : {}),
  };
}
function entryOf(u: UnplacedItem, from: number): PlanEntry {
  return {
    id: u.id,
    kind: u.kind ?? 'todo',
    title: u.title,
    minutes: u.minutes ?? 30,
    window: u.window ?? [from, PLAN_DAY_END],
    reason: u.reason ?? null,
    fromFact: u.fromFact,
    ...(u.chosen ? { chosen: true } : {}),
  };
}

/**
 * How picks would sit in a plan already made, for Add something: placed as
 * adding them would place them, around what the plan holds and with the
 * plan's own gap. A plan keeps the gap it was made with, so there is no back
 * to back to offer here: a pick either has a place or it does not.
 */
export function addRoomFor(meta: BriefPlanMeta, picks: SheetPick[]): PickRoom {
  const from = fromFor(meta);
  const rec = dayRecordFromStore(meta.date);
  const entries = entriesOf(meta);
  const have = new Set(entries.map((e) => e.id));
  const pool = poolWith(entries, meta.date);
  const added: PlanEntry[] = [];
  for (const p of picks) {
    if (have.has(p.id)) continue;
    const c = pool.find((x) => x.id === p.id) ?? candidateFromStore(p.id, p.kind);
    if (!c) continue;
    added.push({ ...entryFromCandidate(c, from), chosen: true, reason: CHOSEN_REASON });
  }
  const fit = placePlan([...entries, ...added], {
    busy: rec.busy,
    from,
    dayEnd: rec.planEnd,
    now: nowFor(meta),
    placed: meta.items,
    buffer: meta.buffer,
  });
  // what has no place once they are added: the picks themselves, and anything
  // already placed that they push out (a pick goes ahead of what Gremly chose)
  const counted = new Set([...added.map((e) => e.id), ...meta.items.map((x) => x.id)]);
  const over = fit.unplaced
    .filter((u) => counted.has(u.id))
    .reduce((a, u) => a + (u.minutes ?? 30), 0);
  if (over > 0) return { fit: 'over', left: 0, over };
  return {
    fit: 'spaced',
    left: roomLeft(rec.busy, fit.items, from, Math.max(from, rec.planEnd), meta.buffer),
    over: 0,
  };
}

/** The todos they picked themselves that the plan had no room for. */
function unfitTodos(unplaced: UnplacedItem[]): UnplacedItem[] {
  return unplaced.filter((u) => u.chosen && (u.kind ?? 'todo') === 'todo');
}

/** Every one of them can still be put off for later, and has a day to come back on. */
function canAllBePutOff(todos: UnplacedItem[]): boolean {
  const s = useGremlyStore.getState();
  const all = s.todos as Record<string, any>[];
  return todos.every((u) => {
    const todo = all.find((t) => t.id === u.id);
    return (
      !!todo &&
      laterOffered(todo) &&
      !!laterBackDay({
        todoId: u.id,
        today: getDateService().ritualDay(),
        weeklyDay: s.weeklyDay ?? 0,
        todos: all,
      })
    );
  });
}

export function usePlanFlow(deps: PlanFlowDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [typing, setTyping] = useState(false);
  const busyRef = useRef(false);
  // picked from the sheet but not a candidate today (a todo due another day)
  const extraRef = useRef<Candidate[]>([]);

  const livePlan = useMemo(() => livePlanOf(deps.messages), [deps.messages]);

  // The living plan: a time changed elsewhere (a card, Today) moves the item
  // on the card; a proposal re-fits the rest around it, and a locked plan
  // moves it on Today too.
  // paused while the day turn applies its changes and writes a new version
  const syncPausedRef = useRef(false);
  const storeTodos = useGremlyStore((s) => s.todos);
  const storeHabits = useGremlyStore((s) => s.habits);
  useEffect(() => {
    const msg = livePlan;
    const meta = planMetaOf(msg);
    if (!msg || !meta || busyRef.current || syncPausedRef.current) return;
    const lookup = (id: string, kind: 'todo' | 'habit'): StoreTimes | undefined =>
      kind === 'habit'
        ? (storeHabits.find((h) => h.id === id) as StoreTimes | undefined)
        : (storeTodos.find((t) => t.id === id) as StoreTimes | undefined);
    const sync = syncPlanItems(meta.items, meta.date, lookup);
    if (!sync) return;
    const moved = new Set(sync.moved);
    let patch: Partial<BriefPlanMeta> = { items: sync.items };
    if (moved.size && meta.status === 'proposal') {
      // a time changed on the item is one the person set, and so is any set before
      const pins = new Map(sync.items.filter((x) => moved.has(x.id)).map((x) => [x.id, x.start]));
      const rec = dayRecordFromStore(meta.date);
      const fit = placePlan(entriesOf({ ...meta, items: sync.items }), {
        busy: rec.busy,
        from: fromFor(meta),
        dayEnd: rec.planEnd,
        now: nowFor(meta),
        pins,
        placed: sync.items,
        buffer: meta.buffer,
      });
      const seenOf = new Map(sync.items.map((x) => [x.id, x.seen]));
      patch = { ...fit, items: fit.items.map((x) => ({ ...x, seen: seenOf.get(x.id) })) };
    } else if (moved.size && meta.status === 'locked') {
      // Today follows the card: the planned start, and the block it falls in,
      // move with the item
      const s = useGremlyStore.getState();
      patch = {
        items: sync.items.map((x) => {
          if (!moved.has(x.id)) return x;
          const write = plannedTimePatch(meta.date, x.start);
          if (x.kind === 'habit') void s.updateHabit(x.id, write);
          else void s.updateTodo(x.id, write);
          return {
            ...x,
            seen: timeSignature({
              ...lookup(x.id, x.kind === 'habit' ? 'habit' : 'todo'),
              ...write,
            }),
          };
        }),
      };
    }
    void depsRef.current
      .patchMessageMetadata(msg.id, patch as Record<string, unknown>)
      .catch((err) => console.warn('[Plan] could not bring the plan up to date:', err));
  }, [livePlan, storeTodos, storeHabits]);
  const inPlanIds = useMemo(() => {
    const meta = planMetaOf(livePlan);
    return new Set(meta ? [...meta.items.map((x) => x.id), ...meta.unplaced.map((x) => x.id)] : []);
  }, [livePlan]);

  const say = useCallback(async (text: string) => {
    const part = dayPartAt(Math.floor(minutesOfDay() / 60));
    await depsRef.current.appendBriefMessage('assistant', text, {
      type: 'brief-text',
      part,
      ids: [],
    });
  }, []);

  const offer = useCallback(async (content: string, meta: Omit<BriefOfferMeta, 'type'>) => {
    await depsRef.current.appendBriefMessage('assistant', content, {
      ...meta,
      type: 'brief-offer',
    });
  }, []);

  const run = useCallback(async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await work();
    } catch (err) {
      console.warn('[Plan] failed:', err);
    } finally {
      busyRef.current = false;
      setTyping(false);
    }
  }, []);

  /**
   * As run, for a tap that cannot be made again: an offer's buttons are spent
   * once one is tapped, so its work waits for what is under way, not dropped.
   */
  const runWhenFree = useCallback(
    async (work: () => Promise<void>) => {
      for (let i = 0; i < 100 && busyRef.current; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return run(work);
    },
    [run],
  );

  /**
   * Gremly's line for what did not fit. For a plan made from their picks, the
   * todos among it are offered another day or Later; true when they were, and
   * then the suggested changes wait, since only the newest offer in the
   * thread has buttons to tap (moveUnfit adds them after the answer).
   */
  const sayUnfit = useCallback(
    async (unplaced: UnplacedItem[], day: string, ask: boolean): Promise<boolean> => {
      const word = planDayNow(day).word;
      const unfit = ask ? unfitTodos(unplaced) : [];
      if (!unfit.length) {
        const text = unplacedText(unplaced, word);
        if (text) await say(text);
        return false;
      }
      const next = dayAfterWord(day, theirDay(), getDateService().isInLateNightPeriod());
      const later = canAllBePutOff(unfit);
      await offer(unfitAskText(unplaced, unfit, { day: word, next, later }), {
        kind: 'plan_unfit',
        plan_day: day,
        unfit: unfit.map((u) => ({ id: u.id, title: u.title })),
        buttons: unfitButtons(unfit.length, next, later),
      });
      return true;
    },
    [offer, say],
  );

  /**
   * Add a version of the plan (and the suggestions under it). askUnfit: the
   * plan is being made from what they picked, so the todos among their picks
   * that did not fit are offered another day or Later, not only named.
   */
  const addPlan = useCallback(
    async (fit: PlanFit, pool: Candidate[], day: string, askUnfit = false) => {
      const d = depsRef.current;
      const version = d.messages.filter((m) => planMetaOf(m)).length + 1;
      const meta: BriefPlanMeta = {
        type: 'brief-plan',
        version,
        status: 'proposal',
        date: day,
        ...fit,
      };
      const msg = await d.appendBriefMessage(
        'system',
        '',
        meta as unknown as Record<string, unknown>,
      );
      if (msg) d.onNewPlan?.(msg.id);
      if (await sayUnfit(fit.unplaced, day, askUnfit)) return;
      const buttons = suggestions(meta, pool);
      if (buttons.length) await offer('', { kind: 'plan_edit', buttons });
    },
    [offer, sayUnfit],
  );

  /** Earlier proposals for the same day fold away under a new one. */
  const replaceOpen = useCallback(async (alsoLocked: boolean, day: string) => {
    const d = depsRef.current;
    for (const m of d.messages) {
      const meta = planMetaOf(m);
      if (meta && meta.date !== day) continue;
      if (meta && (meta.status === 'proposal' || (alsoLocked && meta.status === 'locked'))) {
        await d.patchMessageMetadata(m.id, { status: 'replaced' });
      }
    }
  }, []);

  /**
   * The pick sheet for a plan being made: the day's items with Gremly's
   * suggestions on top (null while it chooses). Closed: null.
   */
  const [pickSession, setPickSession] = useState<PickSession | null>(null);
  const sessionRef = useRef<SessionData | null>(null);
  // Gremly asked what to put first: the next typed message is the answer
  const askedForRef = useRef<string | null>(null);

  /**
   * Make the plan from entries already chosen: Gremly's line, then the card.
   * from: where the plan starts when it is not the session's (an answer given
   * later). buffer: the gap between things, when it is not the usual one.
   * picked: the entries are what they picked, so what did not fit is offered
   * another day or Later.
   */
  const makePlan = useCallback(
    async (
      day: string,
      entries: PlanEntry[],
      intro: string,
      pool: Candidate[],
      opts: { from?: number; buffer?: number; picked?: boolean } = {},
    ) => {
      const rec = dayRecordFromStore(day);
      const from =
        opts.from ?? (sessionRef.current?.day === day ? sessionRef.current.from : rec.planEnd);
      const fit = fitPlan(entries, rec.busy, from, rec.planEnd, opts.buffer);
      setTyping(false);
      // nothing they picked has a place: no empty card, only what did not fit
      if (opts.picked && !fit.items.length) {
        await sayUnfit(fit.unplaced, day, true);
        return;
      }
      await replaceOpen(false, day);
      await say(intro);
      await addPlan(fit, pool, day, !!opts.picked);
    },
    [addPlan, replaceOpen, say, sayUnfit],
  );

  /**
   * Plan my day / afternoon / evening, and planning another day. The pick
   * sheet opens at once with the day's items, and Gremly's suggestions join
   * it when they are back. direct: no sheet, Gremly plans it (Just plan it,
   * an answer to what to put first, what was kept in Sweep).
   */
  const start = useCallback(
    (
      fromOffer?: BriefOfferMeta | null,
      opts: { day?: string; direct?: boolean; asked?: string; kept?: string[] } = {},
    ) =>
      run(async () => {
        const d = depsRef.current;
        const day = opts.day ?? fromOffer?.plan_day ?? theirDay();
        const today = isToday(day);
        const live = livePlanOf(d.messages, day);
        if (planMetaOf(live)?.status === 'locked') {
          await say(alreadySetText(planDayNow(day)));
          return;
        }
        const now = today ? minutesOfTheirDay() : PLAN_DAY_START;
        const meetings = meetingsFromStore(day);
        // set times and travel count too; nothing is planned after they set off
        const rec = dayRecordFromStore(day);
        const travelling = rec.planEnd < DEFAULT_PLAN_END;
        const gap = !today
          ? PLAN_DAY_START
          : fromOffer?.plan_from !== undefined && fromOffer.plan_from !== null
            ? Math.max(fromOffer.plan_from, now)
            : clearFrom(rec.busy, now, rec.planEnd);
        const from = gap === null ? null : up5(Math.max(gap, now));
        if (from === null || from + 15 > rec.planEnd) {
          await say(travelling ? PLAN_COPY.noRoomTravel : PLAN_COPY.noRoom);
          return;
        }
        const pool = poolForDay(day);
        if (!pool.length) {
          await say(PLAN_COPY.nothingToPlan);
          return;
        }
        // kept for today in Sweep just now: always in the plan
        const kept = [...new Set([...(fromOffer?.kept_ids ?? []), ...(opts.kept ?? [])])];
        askedForRef.current = null;
        const session: SessionData = { day, from, pool, kept, entries: null, intro: null };
        sessionRef.current = session;
        const ask = () =>
          callPlanPick({
            mode: 'pick',
            now,
            gap_from: from,
            pool: pool.map((c) => ({
              id: c.id,
              kind: c.kind,
              title: c.title,
              minutes: c.minutes,
              why: c.why,
              window: c.window,
              ...(kept.includes(c.id) ? { kept: true } : {}),
            })),
            meetings: meetings.map((m) => ({ title: m.title, start: m.start, end: m.end })),
            ...frameForPicker(rec),
            for_day: day,
            ...(opts.asked ? { asked: opts.asked } : {}),
          }).then((res) => {
            const picked = picksOf(res, pool, from);
            if (picked.estimates.length) saveEstimates(picked.estimates);
            return picked;
          });

        if (opts.direct) {
          setTyping(true);
          const picked = await ask();
          const entries = withKept(picked.entries, pool, kept, from);
          await makePlan(day, entries, picked.intro ?? PLAN_COPY.introFallback, pool);
          return;
        }
        // the sheet opens now; Gremly's suggestions follow
        setPickSession({
          day,
          free: freeMinutes(rec.busy, [], from, rec.planEnd),
          suggested: null,
        });
        void ask().then((picked) => {
          if (sessionRef.current !== session) return;
          session.entries = picked.entries;
          session.intro = picked.intro;
          setPickSession((p) =>
            p && p.day === day
              ? {
                  ...p,
                  suggested: picked.entries.map((e) => ({
                    id: e.id,
                    kind: e.kind === 'habit' ? 'habit' : 'todo',
                    title: e.title,
                    minutes: e.minutes,
                    reason: e.reason,
                  })),
                }
              : p,
          );
        });
      }),
    [makePlan, run, say],
  );

  /**
   * How picks would sit in the day being planned, for the sheet: placed as
   * the plan itself would place them, so the time left counts the gaps the
   * plan keeps. Null when no plan is being made.
   */
  const pickRoom = useCallback((picks: SheetPick[]): PickRoom | null => {
    const sess = sessionRef.current;
    if (!sess) return null;
    const rec = dayRecordFromStore(sess.day);
    return planRoom(entriesForPicks(sess, picks).entries, {
      busy: rec.busy,
      from: sess.from,
      dayEnd: rec.planEnd,
    });
  }, []);

  /**
   * Picked on the sheet: the plan is what they picked, all theirs. When the
   * picks fit the day only with no gaps between them, Gremly asks first
   * whether they want them back to back or with some space.
   */
  const planPicked = useCallback(
    (picks: SheetPick[]) =>
      run(async () => {
        const sess = sessionRef.current;
        setPickSession(null);
        if (!sess || !picks.length) return;
        const { entries: all, pool } = entriesForPicks(sess, picks);
        // Gremly's own line fits only when what they picked is what it suggested
        const same =
          !!sess.entries?.length &&
          sess.entries.length === picks.length &&
          sess.entries.every((e) => picks.some((p) => p.id === e.id));
        const intro = same && sess.intro ? sess.intro : PLAN_COPY.yourPicks;
        const rec = dayRecordFromStore(sess.day);
        const room = planRoom(all, { busy: rec.busy, from: sess.from, dayEnd: rec.planEnd });
        if (room.fit === 'tight') {
          // what they picked rides on the question, so the answer makes the
          // plan from it whenever it comes
          await offer(spacingAskText(planDayNow(sess.day)), {
            kind: 'plan_spacing',
            plan_day: sess.day,
            plan_from: sess.from,
            picks: all.map(unplacedOf),
            buttons: spacingButtons(),
          });
          return;
        }
        await makePlan(sess.day, all, intro, pool, { picked: true });
      }),
    [makePlan, offer, run],
  );

  /**
   * Their answer to back to back or with some space. Back to back places what
   * they picked with no gaps, and the plan keeps to that. With some space
   * keeps the gaps, says what did not fit and offers it another day or Later.
   */
  const planSpacing = useCallback(
    (asked: BriefOfferMeta | null, how: string | undefined) =>
      runWhenFree(async () => {
        const d = depsRef.current;
        const day = asked?.plan_day ?? theirDay();
        // answered late: the day may be over, or have a plan said yes to since
        if (day < theirDay()) {
          await say(PLAN_COPY.dayGone);
          return;
        }
        if (planMetaOf(livePlanOf(d.messages, day))?.status === 'locked') {
          await say(alreadySetText(planDayNow(day)));
          return;
        }
        // what they picked, less anything done, put away or deleted since
        const st = useGremlyStore.getState();
        const still = (p: UnplacedItem) =>
          p.kind === 'reach'
            ? true
            : p.kind === 'habit'
              ? st.habits.some((h) => h.id === p.id && !h.archived)
              : st.todos.some((t) => t.id === p.id && !t.archived && !t.completed_at);
        const picks = (asked?.picks ?? []).filter(still);
        if (!picks.length) {
          await say(PLAN_COPY.nothingToPlan);
          return;
        }
        const rec = dayRecordFromStore(day);
        // time has moved on since it was asked: nothing today starts before now
        const asFrom = asked?.plan_from ?? PLAN_DAY_START;
        const from = isToday(day) ? Math.max(asFrom, up5(minutesOfTheirDay())) : asFrom;
        if (from + 15 > rec.planEnd) {
          await say(rec.planEnd < DEFAULT_PLAN_END ? PLAN_COPY.noRoomTravel : PLAN_COPY.noRoom);
          return;
        }
        const entries = picks.map((p) => entryOf(p, from));
        const pool = poolWith(entries, day);
        const tight = how === 'tight';
        await makePlan(day, entries, tight ? PLAN_COPY.backToBack : PLAN_COPY.withSpace, pool, {
          from,
          picked: true,
          ...(tight ? { buffer: 0 } : {}),
        });
      }),
    [makePlan, runWhenFree, say],
  );

  /**
   * Their answer about the todos that did not fit: moved to the day after the
   * plan's, put off for later (each to its own back day), or left. Each write
   * goes through the change model, and they come off the plan, since they are
   * no longer that day's.
   */
  const moveUnfit = useCallback(
    (asked: BriefOfferMeta | null, how: string | undefined) =>
      runWhenFree(async () => {
        const d = depsRef.current;
        const day = asked?.plan_day ?? theirDay();
        const wanted = asked?.unfit ?? [];
        // the suggested changes under the plan, which waited for this answer
        const suggest = async (now?: BriefPlanMeta) => {
          const meta = now ?? planMetaOf(livePlanOf(depsRef.current.messages, day));
          if (!meta || meta.status !== 'proposal') return;
          const buttons = suggestions(meta, poolWith(entriesOf(meta), meta.date));
          if (buttons.length) await offer('', { kind: 'plan_edit', buttons });
        };
        if (how !== 'tomorrow' && how !== 'later') {
          await say(unfitLeftText(wanted.length));
          await suggest();
          return;
        }
        const next = dayAfter(day);
        const moved: { id: string; title: string; day: string }[] = [];
        for (const u of wanted) {
          // read each time: the day one comes back on depends on those before it
          const s = useGremlyStore.getState();
          const todo = s.todos.find((t) => t.id === u.id);
          // done, put away or deleted since it was offered: there is nothing to move
          if (!todo || todo.archived || todo.completed_at) continue;
          const backOn =
            how === 'later'
              ? laterBackDay({
                  todoId: u.id,
                  today: theirDay(),
                  weeklyDay: s.weeklyDay ?? 0,
                  todos: s.todos as Record<string, any>[],
                })
              : null;
          if (how === 'later' && !backOn) continue;
          const raw =
            how === 'later'
              ? { op: 'later', type: 'todo', id: u.id, back_on: backOn }
              : { op: 'change', type: 'todo', id: u.id, fields: { day: next } };
          const checked = checkChange(raw, contextFor(raw));
          if (!checked.ok) {
            // already where it was being sent: it is there, with nothing to write
            if (checked.reason === 'no_change') {
              moved.push({ id: u.id, title: u.title, day: backOn ?? next });
            } else {
              console.warn('[Plan] a todo that did not fit could not be moved:', checked.reason);
            }
            continue;
          }
          const change: Change = { ...checked.change, cid: `unfit-${u.id}` };
          const { outcomes } = await applyChanges([change], {
            source: 'thread',
            threadId: d.threadId,
          });
          if (outcomes[0]?.ok) moved.push({ id: u.id, title: u.title, day: backOn ?? next });
        }
        if (!moved.length) {
          await say(PLAN_COPY.unfitFailed);
          await suggest();
          return;
        }
        // Off the plan: a todo moved to another day is not this day's to fit
        // in. The plan is read as it is now, since a change made after the
        // offer may have found one of them a place: it comes out of there too,
        // and a plan on Today takes back the time it had given it.
        const gone = new Set(moved.map((m) => m.id));
        const live = livePlanOf(d.messages, day);
        const meta = planMetaOf(live);
        const placed = meta ? meta.items.filter((x) => gone.has(x.id)) : [];
        const patch = meta
          ? {
              ...(placed.length ? { items: meta.items.filter((x) => !gone.has(x.id)) } : {}),
              unplaced: meta.unplaced.filter((x) => !gone.has(x.id)),
              ...(meta.order ? { order: meta.order.filter((id) => !gone.has(id)) } : {}),
            }
          : null;
        if (live && patch) await d.patchMessageMetadata(live.id, patch);
        if (meta?.status === 'locked') {
          for (const x of placed) {
            void useGremlyStore
              .getState()
              .updateTodo(x.id, { daily_block: null, scheduled_start_iso: null });
          }
        }
        const stayed = wanted.filter((u) => !gone.has(u.id)).map((u) => u.title);
        const done =
          how === 'later'
            ? unfitLaterText(moved.map((m) => ({ title: m.title, day: backDayName(m.day) })))
            : unfitMovedText(
                moved.map((m) => m.title),
                dayAfterWord(day, theirDay(), getDateService().isInLateNightPeriod()),
              );
        await say(stayed.length ? `${done} ${unfitStayedText(stayed)}` : done);
        await suggest(meta && patch ? { ...meta, ...patch } : undefined);
      }),
    [offer, runWhenFree, say],
  );

  /** Nothing picked: Gremly asks what to put first before it plans. */
  const askFirst = useCallback(
    () =>
      run(async () => {
        const sess = sessionRef.current;
        setPickSession(null);
        if (!sess) return;
        askedForRef.current = sess.day;
        await offer(askFirstText(planDayNow(sess.day)), {
          kind: 'plan_ask',
          plan_day: sess.day,
          buttons: [{ id: 'plan_direct', label: 'Just plan it', action: 'plan', primary: true }],
        });
      }),
    [offer, run],
  );

  /** The sheet closed without a plan. */
  const closePicks = useCallback(() => {
    sessionRef.current = null;
    setPickSession(null);
  }, []);

  /** Their answer to what to put first: Gremly plans around it. */
  const planWithAnswer = useCallback(
    async (text: string): Promise<boolean> => {
      const day = askedForRef.current;
      if (!day) return false;
      askedForRef.current = null;
      await depsRef.current.appendBriefMessage('user', text, {});
      await start(null, { day, direct: true, asked: text });
      return true;
    },
    [start],
  );

  /** Refresh the suggestions under a plan changed in place. */
  const refreshSuggestions = useCallback(async (planMsg: SpaceChatMessage, meta: BriefPlanMeta) => {
    const d = depsRef.current;
    const idx = d.messages.findIndex((m) => m.id === planMsg.id);
    const next = d.messages.slice(idx + 1).find((m) => {
      const o = briefMetaOf(m);
      return o?.type === 'brief-offer' && o.kind === 'plan_edit' && !o.chosen;
    });
    if (next) {
      await d.patchMessageMetadata(next.id, {
        buttons: suggestions(meta, poolWith(entriesOf(meta), meta.date)),
      });
    }
  }, []);

  /** × on a row, or Add something: the same card, re-fitted. */
  const changeInPlace = useCallback(
    (planMsg: SpaceChatMessage, ops: PlanOp[]) =>
      run(async () => {
        const d = depsRef.current;
        const meta = planMetaOf(planMsg);
        if (!meta || meta.status !== 'proposal' || !ops.length) return;
        const from = fromFor(meta);
        let entries = entriesOf(meta);
        const pool = poolWith(entries, meta.date);
        // picked from the sheet, not a candidate today
        for (const extra of extraRef.current) {
          if (!pool.some((c) => c.id === extra.id)) pool.push(extra);
        }
        extraRef.current = [];
        for (const op of ops) entries = applyOp(entries, op, pool, from, meta.items);
        const fit = refitForDay(
          entries,
          meta,
          from,
          ops.map((o) => o.id),
        );
        await d.patchMessageMetadata(planMsg.id, { ...fit });
        await refreshSuggestions(planMsg, { ...meta, ...fit });
        const left = ops.filter((o) => o.op === 'add' && !fit.items.some((x) => x.id === o.id));
        if (left.length === 1) {
          const title = pool.find((c) => c.id === left[0].id)?.title ?? 'that';
          await say(changeText(left[0], title, undefined, false));
        } else if (left.length > 1) {
          const text = unplacedText(
            left.map((o) => ({
              id: o.id,
              title: pool.find((c) => c.id === o.id)?.title ?? 'that',
            })),
            planDayNow(meta.date).word,
          );
          if (text) await say(text);
        }
      }),
    [refreshSuggestions, run, say],
  );

  /**
   * A time or length changed by hand on the card: it goes there (or at the
   * first free time after), as a time they set, and the rest fits around it.
   */
  const retimeItem = useCallback(
    (planMsg: SpaceChatMessage, id: string, start: number, minutes: number) =>
      run(async () => {
        const d = depsRef.current;
        const meta = planMetaOf(planMsg);
        if (!meta || meta.status !== 'proposal') return;
        const entries = entriesOf(meta).map((e) => (e.id === id ? { ...e, minutes } : e));
        const rec = dayRecordFromStore(meta.date);
        const fit = placePlan(entries, {
          busy: rec.busy,
          from: fromFor(meta),
          dayEnd: rec.planEnd,
          now: nowFor(meta),
          pins: new Map([[id, start]]),
          placed: meta.items,
          buffer: meta.buffer,
        });
        await d.patchMessageMetadata(planMsg.id, { ...fit });
        await refreshSuggestions(planMsg, { ...meta, ...fit });
        const left = fit.unplaced.filter((u) => u.id !== id);
        const text = unplacedText(left, planDayNow(meta.date).word);
        if (text) await say(text);
      }),
    [refreshSuggestions, run, say],
  );

  /**
   * Busy time added on the card: a set time on today, kept in the thread like
   * the ones Gremly adds, and the plan fits around it.
   */
  const addBusy = useCallback(
    (planMsg: SpaceChatMessage, block: { title: string; start: number; end: number }) =>
      run(async () => {
        const d = depsRef.current;
        const meta = planMetaOf(planMsg);
        if (!meta || meta.status !== 'proposal' || !d.threadId) return;
        const thread = useTodayThread.getState().thread;
        const tm = (thread?.id === d.threadId ? thread.metadata_json : null) as
          | (DayThreadMeta & { ritual_day?: string })
          | null;
        if (tm?.ritual_day && tm.ritual_day !== meta.date) return;
        const fixed_blocks = [
          ...(tm?.fixed_blocks ?? []),
          {
            id: `chat:${generateDropId()}`,
            title: block.title,
            start: block.start,
            end: block.end,
            travel: false,
          },
        ];
        await patchDailyThreadMeta(d.threadId, { fixed_blocks });
        useTodayThread.getState().patchMeta(d.threadId, { fixed_blocks });
        const fit = refitForDay(entriesOf(meta), meta, fromFor(meta));
        await d.patchMessageMetadata(planMsg.id, { ...fit });
        await refreshSuggestions(planMsg, { ...meta, ...fit });
        const moved = fit.unplaced.filter((u) => meta.items.some((x) => x.id === u.id));
        const text = unplacedText(moved, planDayNow(meta.date).word);
        if (text) await say(text);
      }),
    [refreshSuggestions, run, say],
  );

  const removeItem = useCallback(
    (planMsg: SpaceChatMessage, id: string) =>
      changeInPlace(planMsg, [{ op: 'remove', id, window: null }]),
    [changeInPlace],
  );
  /** Picked on the sheet: all of them join the plan at once, as theirs. */
  const addItems = useCallback(
    (planMsg: SpaceChatMessage, picks: { id: string; kind: 'todo' | 'habit' }[]) => {
      extraRef.current = picks
        .map((p) => candidateFromStore(p.id, p.kind))
        .filter((c): c is Candidate => !!c);
      // picked by them: they keep their place ahead of what Gremly chose
      return changeInPlace(
        planMsg,
        picks.map((p) => ({ op: 'add', id: p.id, window: null, chosen: true })),
      );
    },
    [changeInPlace],
  );

  /** A suggested or typed change: a new version of the plan. */
  const applyOps = useCallback(
    (ops: PlanOp[]) =>
      run(async () => {
        const d = depsRef.current;
        const live = livePlanOf(d.messages);
        const meta = planMetaOf(live);
        if (!live || !meta || !ops.length) return;
        const wasSet = meta.status === 'locked';
        const from = fromFor(meta);
        let entries = entriesOf(meta);
        const pool = poolWith(entries, meta.date);
        for (const op of ops) entries = applyOp(entries, op, pool, from, meta.items);
        const fit = refitForDay(
          entries,
          meta,
          from,
          ops.map((o) => o.id),
        );
        const first = ops[0];
        const title = pool.find((c) => c.id === first.id)?.title ?? 'that';
        await replaceOpen(true, meta.date);
        await say(
          changeText(
            first,
            title,
            fit.items.find((x) => x.id === first.id),
            wasSet,
          ),
        );
        await addPlan(fit, pool, meta.date);
      }),
    [addPlan, replaceOpen, run, say],
  );

  const applySuggestion = useCallback((op: PlanOp) => applyOps([op]), [applyOps]);

  /**
   * Yes to a proposal: it goes on its day, with its times. The stored status
   * keeps the name it has always had ('locked'), which the brief's writers
   * read; there is no Lock In on the items any more.
   */
  const accept = useCallback(
    (planMsg: SpaceChatMessage) =>
      run(async () => {
        const d = depsRef.current;
        const meta = planMetaOf(planMsg);
        if (!meta || meta.status !== 'proposal' || !meta.items.length) return;
        const earlier: PlanItem[] = [];
        for (const m of d.messages) {
          const o = planMetaOf(m);
          if (o && o.status === 'locked' && o.date === meta.date && m.id !== planMsg.id) {
            earlier.push(...o.items);
            await d.patchMessageMetadata(m.id, { status: 'replaced' });
          }
        }
        const res = await lockPlanItems(meta.date, meta.items, earlier);
        // what saying yes just wrote is what the plan has seen
        const st = useGremlyStore.getState();
        const items = res.items.map((x) => ({
          ...x,
          seen: timeSignature(
            (x.kind === 'habit'
              ? st.habits.find((h) => h.id === x.id)
              : st.todos.find((t) => t.id === x.id)) as StoreTimes | undefined,
          ),
        }));
        await d.patchMessageMetadata(planMsg.id, { status: 'locked', items });
        if (d.threadId) {
          const at = nowTimestamp();
          patchDailyThreadMeta(d.threadId, { plan_locked_at: at })
            .then(() => useTodayThread.getState().patchMeta(d.threadId!, { plan_locked_at: at }))
            .catch((err) => console.warn('[Plan] could not note the plan:', err));
        }
        await say(yesText(res.created, planDayNow(meta.date)));
      }),
    [run, say],
  );

  const dismiss = useCallback(
    (planMsg: SpaceChatMessage) =>
      run(async () => {
        await depsRef.current.patchMessageMetadata(planMsg.id, { status: 'dismissed' });
        const meta = planMetaOf(planMsg);
        await say(meta ? dismissedText(planDayNow(meta.date)) : PLAN_COPY.dismissed);
      }),
    [run, say],
  );

  const showAgain = useCallback(
    (planMsg: SpaceChatMessage) =>
      run(async () => {
        // only one open proposal at a time
        const d = depsRef.current;
        for (const m of d.messages) {
          const o = planMetaOf(m);
          if (o?.status === 'proposal' && m.id !== planMsg.id) {
            await d.patchMessageMetadata(m.id, { status: 'replaced' });
          }
        }
        await d.patchMessageMetadata(planMsg.id, { status: 'proposal' });
      }),
    [run],
  );

  /** After Sweep: what was kept for today joins the plan already there. */
  const addKept = useCallback(
    (ids: string[]) =>
      run(async () => {
        const d = depsRef.current;
        const live = livePlanOf(d.messages);
        const meta = planMetaOf(live);
        if (!live || !meta) {
          busyRef.current = false;
          // no plan yet: Gremly plans around what they kept, which is theirs
          await start(null, { direct: true, kept: ids });
          return;
        }
        const wasSet = meta.status === 'locked';
        const from = fromFor(meta);
        let entries = entriesOf(meta);
        const pool = poolWith(entries, meta.date);
        const adding = ids.filter((id) => !entries.some((e) => e.id === id));
        for (const id of adding)
          entries = applyOp(
            entries,
            { op: 'add', id, window: null, chosen: true },
            pool,
            from,
            meta.items,
          );
        const fit = refitForDay(entries, meta, from);
        const placed = adding.filter((id) => fit.items.some((x) => x.id === id));
        const titles = (list: string[]) =>
          list.map((id) => pool.find((c) => c.id === id)?.title ?? 'that');
        let text = placed.length
          ? `Added ${namesOf(titles(placed))}.`
          : `There isn't a good gap left today, so I've left ${adding.length === 1 ? 'it' : 'them'} off.`;
        if (wasSet) text += PLAN_COPY.again;
        await replaceOpen(true, meta.date);
        await say(text);
        await addPlan(fit, pool, meta.date);
      }),
    [addPlan, replaceOpen, run, say, start],
  );

  /**
   * After the day turn's changes: a new version of the plan with what was
   * added, taken out or given a time, re-fitted around the day as it is now
   * (set times, setting off). Nothing when there is no plan yet.
   */
  const reviseAfterChanges = useCallback(
    (change: PlanChange) =>
      run(async () => {
        const d = depsRef.current;
        const live = livePlanOf(d.messages);
        const meta = planMetaOf(live);
        if (!live || !meta) return;
        const wasSet = meta.status === 'locked';
        const from = fromFor(meta);
        const st = useGremlyStore.getState();
        // titles as they are now (a rename on the card)
        const titleOf = (id: string, kind: string): string | null => {
          const x =
            kind === 'habit'
              ? st.habits.find((h) => h.id === id)
              : st.todos.find((t) => t.id === id);
          return (x as { name?: string; title?: string } | undefined)?.name || null;
        };
        const remove = new Set(change.remove);
        const pins = new Map(change.pin.map((p) => [p.id, p.start]));
        const entries = entriesOf(meta)
          .filter((e) => !remove.has(e.id))
          .map((e) => ({ ...e, title: titleOf(e.id, e.kind) ?? e.title }));
        const pool = poolWith(entries, meta.date);
        for (const a of change.add) {
          if (a.start !== null) pins.set(a.id, a.start);
          if (entries.some((e) => e.id === a.id)) continue;
          const c = pool.find((x) => x.id === a.id) ?? candidateFromStore(a.id, a.kind);
          if (!c) continue;
          if (!pool.some((x) => x.id === c.id)) pool.push(c);
          const e = entryFromCandidate(c, from);
          entries.push({
            ...e,
            minutes: a.minutes ?? e.minutes,
            // a stretch of the day they asked to fill
            ...(a.start == null && a.after != null
              ? { window: [Math.max(a.after, from), PLAN_DAY_END] as [number, number] }
              : {}),
          });
        }
        const rec = dayRecordFromStore(meta.date);
        // a time named on the card goes there (or the first free time after
        // it); times named before and what they picked keep their places
        const fit = placePlan(entries, {
          busy: rec.busy,
          from,
          dayEnd: rec.planEnd,
          now: nowFor(meta),
          pins,
          placed: meta.items.filter((x) => !remove.has(x.id)),
          buffer: meta.buffer,
        });
        await replaceOpen(true, meta.date);
        if (wasSet) await say(PLAN_COPY.againAfterChanges);
        await addPlan(fit, pool, meta.date);
      }),
    [addPlan, replaceOpen, run, say],
  );

  /** The living plan waits while the day turn applies its changes. */
  const pauseSync = useCallback(() => {
    syncPausedRef.current = true;
  }, []);
  const resumeSync = useCallback(() => {
    syncPausedRef.current = false;
  }, []);

  /** What can wait? (data, no model), with what to do next. */
  const answerWhatCanWait = useCallback(
    (fromOffer?: BriefOfferMeta | null) =>
      run(async () => {
        const d = depsRef.current;
        const pool = poolForDay(theirDay());
        const overdue = selectOverdueTodos(useGremlyStore.getState() as any).length;
        const text = whatCanWait(pool, overdue);
        const now = minutesOfTheirDay();
        const rec = dayRecordFromStore(theirDay());
        const gap =
          fromOffer?.plan_from !== undefined && fromOffer?.plan_from !== null
            ? Math.max(fromOffer!.plan_from!, now)
            : clearFrom(rec.busy, now, rec.planEnd);
        const hasLive = !!livePlanOf(d.messages, theirDay());
        const planButton: OfferButton | null =
          gap !== null && !hasLive
            ? { id: 'plan', label: planLabel(gap), action: 'plan', primary: overdue === 0 }
            : null;
        const buttons: OfferButton[] = overdue
          ? [
              {
                id: 'sweep',
                label: hasLive ? 'Sweep now' : 'Sweep first',
                action: 'sweep',
                primary: true,
              },
              ...(planButton
                ? [planButton]
                : [{ id: 'thanks', label: 'Thanks, Gremly', action: 'thanks' as const }]),
            ]
          : [
              ...(planButton ? [planButton] : []),
              { id: 'thanks', label: 'Thanks, Gremly', action: 'thanks' as const },
            ];
        await offer(text, { kind: 'follow_up', buttons, plan_from: gap ?? undefined });
      }),
    [offer, run],
  );

  /**
   * A message typed while a plan is open: if it asks to change the plan, the
   * change is made and true comes back; anything else is left for chat.
   */
  const editFromText = useCallback(
    async (text: string): Promise<boolean> => {
      const d = depsRef.current;
      const live = livePlanOf(d.messages);
      const meta = planMetaOf(live);
      if (!live || !meta) return false;
      const entries = entriesOf(meta);
      const pool = poolWith(entries, meta.date);
      setTyping(true);
      const res = await callPlanPick({
        mode: 'edit',
        now: minutesOfTheirDay(),
        gap_from: fromFor(meta),
        pool: pool.map((c) => ({
          id: c.id,
          kind: c.kind,
          title: c.title,
          minutes: c.minutes,
          why: c.why,
          window: c.window,
        })),
        meetings: meetingsFromStore(meta.date).map((m) => ({
          title: m.title,
          start: m.start,
          end: m.end,
        })),
        ...frameForPicker(dayRecordFromStore(meta.date)),
        live_plan: meta.items.map((x) => ({ id: x.id, start: x.start, end: x.end })),
        text,
      });
      setTyping(false);
      if (!res.ok || !res.data?.isPlanChange || !res.data.ops?.length) return false;
      await d.appendBriefMessage('user', text, {});
      await applyOps(res.data.ops);
      return true;
    },
    [applyOps],
  );

  return {
    typing,
    livePlan,
    inPlanIds,
    start,
    pickSession,
    pickRoom,
    planPicked,
    planSpacing,
    moveUnfit,
    askFirst,
    closePicks,
    planWithAnswer,
    awaitingAnswer: () => askedForRef.current !== null,
    removeItem,
    addItems,
    retimeItem,
    addBusy,
    applySuggestion,
    accept,
    dismiss,
    showAgain,
    answerWhatCanWait,
    editFromText,
    addKept,
    reviseAfterChanges,
    pauseSync,
    resumeSync,
  };
}
