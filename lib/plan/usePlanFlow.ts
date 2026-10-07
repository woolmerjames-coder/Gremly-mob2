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
import type { BriefOfferMeta, BriefPlanMeta, OfferButton, PlanItem } from '../brief/types';
import type { Candidate } from './candidatePool';
import {
  PLAN_COPY,
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
import { PLAN_DAY_END, freeMinutes } from './slotFitter';
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
  return refitKeeping(entries, meta.items, rec.busy, from, rec.planEnd, touched, nowFor(meta));
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

  /** Add a version of the plan (and the suggestions under it). */
  const addPlan = useCallback(
    async (fit: ReturnType<typeof fitPlan>, pool: Candidate[], day: string) => {
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
      const text = unplacedText(fit.unplaced);
      if (text) await say(text);
      const buttons = suggestions(meta, pool);
      if (buttons.length) await offer('', { kind: 'plan_edit', buttons });
    },
    [offer, say],
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

  /** Make the plan from entries already chosen: Gremly's line, then the card. */
  const makePlan = useCallback(
    async (day: string, entries: PlanEntry[], intro: string, pool: Candidate[]) => {
      const rec = dayRecordFromStore(day);
      const from = sessionRef.current?.day === day ? sessionRef.current.from : rec.planEnd;
      const fit = fitPlan(entries, rec.busy, from, rec.planEnd);
      await replaceOpen(false, day);
      setTyping(false);
      await say(intro);
      await addPlan(fit, pool, day);
    },
    [addPlan, replaceOpen, say],
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

  /** Picked on the sheet: the plan is what they picked, all theirs. */
  const planPicked = useCallback(
    (picks: { id: string; kind: 'todo' | 'habit'; minutes: number; estimated: boolean }[]) =>
      run(async () => {
        const sess = sessionRef.current;
        setPickSession(null);
        if (!sess || !picks.length) return;
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
        const all = withKept(entries, pool, sess.kept, sess.from);
        // Gremly's own line fits only when what they picked is what it suggested
        const same =
          !!sess.entries?.length &&
          sess.entries.length === picks.length &&
          sess.entries.every((e) => picks.some((p) => p.id === e.id));
        await makePlan(sess.day, all, same && sess.intro ? sess.intro : PLAN_COPY.yourPicks, pool);
      }),
    [makePlan, run],
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
        });
        await d.patchMessageMetadata(planMsg.id, { ...fit });
        await refreshSuggestions(planMsg, { ...meta, ...fit });
        const left = fit.unplaced.filter((u) => u.id !== id);
        const text = unplacedText(left);
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
        const text = unplacedText(moved);
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
    planPicked,
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
