/**
 * Planning in today's thread (Daily brief in Chat).
 *
 * Plan my day / afternoon / evening asks the plan picker which candidates go
 * in, places them on the device, and adds Gremly's line, the plan card and up
 * to three suggested changes. Removing (×) and Add something change the card
 * in place with no AI call. A suggested or typed change proposes a new
 * version, and the earlier one folds to "Earlier plan, replaced". Lock it in
 * writes the plan to Today. Not now folds the card, with Show it again.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import { nowTimestamp } from '../date/DateService';
import { callPlanPick } from '../cortex/CortexClient';
import { patchDailyThreadMeta } from '../repo/dailyThreadRepo';
import { useGremlyStore } from '../store/useGremlyStore';
import { selectOverdueTodos } from '../store/selectors';
import { briefMetaOf, dayPartAt } from '../brief/messages';
import { clearFrom } from '../brief/pinned';
import { minutesOfDay } from '../brief/time';
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
  fitPlan,
  lockText,
  suggestions,
  unplacedText,
  whatCanWait,
  type PlanEntry,
  type PlanOp,
} from './planFlow';
import {
  candidateFromStore,
  lockPlanItems,
  meetingsFromStore,
  poolFromStore,
  saveEstimates,
} from './storePlan';

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

/** The plan that counts: the newest proposal or locked plan. */
export function livePlanOf(messages: SpaceChatMessage[]): SpaceChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const meta = planMetaOf(messages[i]);
    if (meta && (meta.status === 'proposal' || meta.status === 'locked')) return messages[i];
  }
  return null;
}

/** The pool for a plan: today's candidates, plus anything the plan holds that is not one now. */
function poolWith(entries: PlanEntry[]): Candidate[] {
  const pool = poolFromStore();
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

export function usePlanFlow(deps: PlanFlowDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [typing, setTyping] = useState(false);
  const busyRef = useRef(false);
  const extraRef = useRef<Candidate | null>(null);

  const livePlan = useMemo(() => livePlanOf(deps.messages), [deps.messages]);
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
    async (fit: ReturnType<typeof fitPlan>, pool: Candidate[]) => {
      const d = depsRef.current;
      const version = d.messages.filter((m) => planMetaOf(m)).length + 1;
      const meta: BriefPlanMeta = {
        type: 'brief-plan',
        version,
        status: 'proposal',
        date: d.date,
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

  /** Earlier proposals fold away under a new one. */
  const replaceOpen = useCallback(async (alsoLocked: boolean) => {
    const d = depsRef.current;
    for (const m of d.messages) {
      const meta = planMetaOf(m);
      if (meta && (meta.status === 'proposal' || (alsoLocked && meta.status === 'locked'))) {
        await d.patchMessageMetadata(m.id, { status: 'replaced' });
      }
    }
  }, []);

  /** Plan my day / afternoon / evening, Plan anyway, Plan with Gremly. */
  const start = useCallback(
    (fromOffer?: BriefOfferMeta | null) =>
      run(async () => {
        const d = depsRef.current;
        const live = livePlanOf(d.messages);
        if (planMetaOf(live)?.status === 'locked') {
          await say(PLAN_COPY.alreadyLocked);
          return;
        }
        const now = minutesOfDay();
        const meetings = meetingsFromStore(d.date);
        const gap =
          fromOffer?.plan_from !== undefined && fromOffer.plan_from !== null
            ? Math.max(fromOffer.plan_from, now)
            : clearFrom(meetings, now);
        if (gap === null) {
          await say(PLAN_COPY.noRoom);
          return;
        }
        const from = up5(Math.max(gap, now));
        const pool = poolFromStore();
        if (!pool.length) {
          await say(PLAN_COPY.nothingToPlan);
          return;
        }
        setTyping(true);
        const res = await callPlanPick({
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
          })),
          meetings: meetings.map((m) => ({ title: m.title, start: m.start, end: m.end })),
        });
        const byId = new Map(pool.map((c) => [c.id, c]));
        let entries: PlanEntry[] = [];
        let intro: string = PLAN_COPY.introFallback;
        if (res.ok && res.data?.picks?.length) {
          entries = res.data.picks.flatMap((p): PlanEntry[] => {
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
          if (res.data.intro) intro = res.data.intro;
          saveEstimates(
            res.data.picks
              .filter((p) => p.estimated)
              .map((p) => ({ id: p.id, kind: byId.get(p.id)?.kind ?? 'todo', minutes: p.minutes })),
          );
        } else {
          if (!res.ok) console.warn('[Plan] the picker could not be reached:', res.error);
          // without the picker: the first few candidates, about half the free time
          let budget = (22 * 60 - from - meetings.filter((m) => m.end > from).length * 30) / 2;
          for (const c of pool.filter((x) => x.source !== 'reach')) {
            const e = entryFromCandidate(c, from);
            if (e.minutes > budget) continue;
            entries.push(e);
            budget -= e.minutes;
            if (entries.length >= 4) break;
          }
        }
        const fit = fitPlan(entries, meetings, from);
        await replaceOpen(false);
        setTyping(false);
        await say(intro);
        await addPlan(fit, pool);
      }),
    [addPlan, replaceOpen, run, say],
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
        buttons: suggestions(meta, poolWith(entriesOf(meta))),
      });
    }
  }, []);

  /** × on a row, or Add something: the same card, re-fitted. */
  const changeInPlace = useCallback(
    (planMsg: SpaceChatMessage, op: PlanOp) =>
      run(async () => {
        const d = depsRef.current;
        const meta = planMetaOf(planMsg);
        if (!meta || meta.status !== 'proposal') return;
        const from = Math.max(meta.from ?? 0, up5(minutesOfDay()));
        const entries = entriesOf(meta);
        const pool = poolWith(entries);
        // something picked from Due today that is not a candidate today
        const extra = extraRef.current;
        extraRef.current = null;
        if (extra && !pool.some((c) => c.id === extra.id)) pool.push(extra);
        const next = applyOp(entries, op, pool, from, meta.items);
        const fit = fitPlan(next, meetingsFromStore(d.date), from);
        await d.patchMessageMetadata(planMsg.id, { ...fit });
        await refreshSuggestions(planMsg, { ...meta, ...fit });
        if (op.op === 'add' && !fit.items.some((x) => x.id === op.id)) {
          const title = pool.find((c) => c.id === op.id)?.title ?? 'that';
          await say(changeText(op, title, undefined, false));
        }
      }),
    [refreshSuggestions, run, say],
  );

  const removeItem = useCallback(
    (planMsg: SpaceChatMessage, id: string) =>
      changeInPlace(planMsg, { op: 'remove', id, window: null }),
    [changeInPlace],
  );
  const addItem = useCallback(
    (planMsg: SpaceChatMessage, id: string, kind: 'todo' | 'habit') => {
      extraRef.current = candidateFromStore(id, kind);
      return changeInPlace(planMsg, { op: 'add', id, window: null });
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
        const wasLocked = meta.status === 'locked';
        const from = Math.max(meta.from ?? 0, up5(minutesOfDay()));
        let entries = entriesOf(meta);
        const pool = poolWith(entries);
        for (const op of ops) entries = applyOp(entries, op, pool, from, meta.items);
        const fit = fitPlan(entries, meetingsFromStore(d.date), from);
        const first = ops[0];
        const title = pool.find((c) => c.id === first.id)?.title ?? 'that';
        await replaceOpen(true);
        await say(
          changeText(
            first,
            title,
            fit.items.find((x) => x.id === first.id),
            wasLocked,
          ),
        );
        await addPlan(fit, pool);
      }),
    [addPlan, replaceOpen, run, say],
  );

  const applySuggestion = useCallback((op: PlanOp) => applyOps([op]), [applyOps]);

  const lock = useCallback(
    (planMsg: SpaceChatMessage) =>
      run(async () => {
        const d = depsRef.current;
        const meta = planMetaOf(planMsg);
        if (!meta || meta.status !== 'proposal' || !meta.items.length) return;
        const earlier: PlanItem[] = [];
        for (const m of d.messages) {
          const o = planMetaOf(m);
          if (o && o.status === 'locked' && m.id !== planMsg.id) {
            earlier.push(...o.items);
            await d.patchMessageMetadata(m.id, { status: 'replaced' });
          }
        }
        const res = await lockPlanItems(d.date, meta.items, earlier);
        await d.patchMessageMetadata(planMsg.id, { status: 'locked', items: res.items });
        if (d.threadId) {
          const at = nowTimestamp();
          patchDailyThreadMeta(d.threadId, { plan_locked_at: at })
            .then(() => useTodayThread.getState().patchMeta(d.threadId!, { plan_locked_at: at }))
            .catch((err) => console.warn('[Plan] could not note the lock:', err));
        }
        await say(lockText(res.created));
      }),
    [run, say],
  );

  const dismiss = useCallback(
    (planMsg: SpaceChatMessage) =>
      run(async () => {
        await depsRef.current.patchMessageMetadata(planMsg.id, { status: 'dismissed' });
        await say(PLAN_COPY.dismissed);
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

  /** What can wait? (data, no model), with what to do next. */
  const answerWhatCanWait = useCallback(
    (fromOffer?: BriefOfferMeta | null) =>
      run(async () => {
        const d = depsRef.current;
        const pool = poolFromStore();
        const overdue = selectOverdueTodos(useGremlyStore.getState() as any).length;
        const text = whatCanWait(pool, overdue);
        const now = minutesOfDay();
        const gap =
          fromOffer?.plan_from !== undefined && fromOffer?.plan_from !== null
            ? Math.max(fromOffer!.plan_from!, now)
            : clearFrom(meetingsFromStore(d.date), now);
        const hasLive = !!livePlanOf(d.messages);
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
      const pool = poolWith(entries);
      setTyping(true);
      const res = await callPlanPick({
        mode: 'edit',
        now: minutesOfDay(),
        gap_from: Math.max(meta.from ?? 0, up5(minutesOfDay())),
        pool: pool.map((c) => ({
          id: c.id,
          kind: c.kind,
          title: c.title,
          minutes: c.minutes,
          why: c.why,
          window: c.window,
        })),
        meetings: meetingsFromStore(d.date).map((m) => ({
          title: m.title,
          start: m.start,
          end: m.end,
        })),
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
    removeItem,
    addItem,
    applySuggestion,
    lock,
    dismiss,
    showAgain,
    answerWhatCanWait,
    editFromText,
  };
}
