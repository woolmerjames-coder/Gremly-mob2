/**
 * The day turn in today's thread (Daily brief in Chat).
 *
 * Every message typed in the thread goes here first. The worker reads it
 * against the day (the day record, the plan, the person's items, any open
 * question and the conversation) and returns one change set. Gremly's reply
 * comes first, then one card listing every change with a tick; nothing
 * changes until Apply. Apply writes the ticked changes, adds "Updated 3
 * things", re-fits the plan as one new version, and the brief carries on. A
 * message that is not about the day goes to normal chat, as before.
 */

import { useCallback, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import { callDayTurn, type DayTurnRequest } from '../cortex/CortexClient';
import { useGremlyStore } from '../store/useGremlyStore';
import { selectHabitsDueToday } from '../store/selectors';
import { getDateService } from '../date/DateService';
import { briefMetaOf, dayPartAt, visibleThreadMessages } from './messages';
import { localDateOf, minutesOfDay } from './time';
import { applyDayChanges, changedEventText } from './applyChanges';
import { dayRecordFromStore, meetingsFromStore } from '../plan/storePlan';
import type { PlanChange } from '../plan/usePlanFlow';
import type { BriefChangesMeta, BriefPlanMeta } from './types';

export const DAY_TURN_COPY = {
  fallbackReply: "Here's what I'd change.",
  dismissed: "No problem, I've left everything as it is.",
  someFailed: "One of those didn't save. It's marked on the card.",
};

export interface DayTurnDeps {
  threadId: string | null;
  /** The thread's ritual day */
  date: string;
  messages: SpaceChatMessage[];
  appendBriefMessage: (
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, unknown>,
  ) => Promise<SpaceChatMessage | undefined>;
  patchMessageMetadata: (messageId: string, patch: Record<string, unknown>) => Promise<void>;
  plan: {
    livePlan: SpaceChatMessage | null;
    reviseAfterChanges: (change: PlanChange) => Promise<void>;
    pauseSync: () => void;
    resumeSync: () => void;
  };
  /** The brief carries on: the offer held for the question, or the plan offer */
  continueBrief: () => Promise<void>;
}

function planMetaOf(m: SpaceChatMessage | null | undefined): BriefPlanMeta | null {
  const meta = briefMetaOf(m);
  return meta?.type === 'brief-plan' && !meta.superseded ? (meta as BriefPlanMeta) : null;
}

const NOTE_ORDER = ['in the plan', 'due today', 'past its day', 'locked in', 'upcoming', 'no day'];

/** What the day turn is told: the day, the plan, their items, the conversation. */
export function buildDayTurnRequest(
  text: string,
  question: string | null,
  date: string,
  messages: SpaceChatMessage[],
  livePlan: SpaceChatMessage | null,
): DayTurnRequest {
  const s = useGremlyStore.getState();
  const ds = getDateService();
  const plan = planMetaOf(livePlan);
  const inPlan = new Set(plan ? [...plan.items, ...plan.unplaced].map((x) => x.id) : []);
  const soon = ds.addDays(date, 14);
  const recent = ds.addDays(date, -14);

  const todos = s.todos
    .filter((t) => !t.archived && !t.completed_at)
    .map((t) => {
      const due = t.due_day ?? null;
      const note = inPlan.has(t.id)
        ? 'in the plan'
        : due === date
          ? 'due today'
          : due && due < date
            ? 'past its day'
            : t.commitment
              ? 'locked in'
              : due && due <= soon
                ? 'upcoming'
                : !due && t.created_at && (localDateOf(t.created_at) ?? '') >= recent
                  ? 'no day'
                  : null;
      return note
        ? {
            id: t.id,
            kind: 'todo' as const,
            title: t.name || t.title || 'Untitled',
            due_day: due,
            due_time: (t as { due_time?: string | null }).due_time ?? null,
            minutes: t.time_estimate_minutes ?? null,
            note,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => NOTE_ORDER.indexOf(a.note) - NOTE_ORDER.indexOf(b.note))
    .slice(0, 60);

  const todayHabits = new Set(selectHabitsDueToday(s as any).map((h: { id: string }) => h.id));
  const habits = s.habits
    .filter((h) => !h.archived)
    .map((h) => ({
      id: h.id,
      kind: 'habit' as const,
      title: h.name || 'Habit',
      due_day: null,
      due_time: null,
      minutes: h.time_estimate_minutes ?? null,
      note: inPlan.has(h.id) ? 'in the plan' : todayHabits.has(h.id) ? 'habit today' : 'habit',
    }))
    .slice(0, 20);

  const rec = dayRecordFromStore(date);
  const history = visibleThreadMessages(messages)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-12)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  return {
    text,
    question,
    history,
    date,
    now: minutesOfDay(),
    items: [...todos, ...habits],
    meetings: meetingsFromStore(date).map((m) => ({ title: m.title, start: m.start, end: m.end })),
    record: {
      travel: rec.travel,
      blocks: rec.blocks.map((b) => ({
        id: b.id,
        title: b.title,
        start: b.start,
        end: b.end,
        travel: b.travel,
      })),
      plan_end: rec.planEnd,
    },
    plan: plan
      ? {
          status: plan.status === 'locked' ? 'locked' : 'proposal',
          items: plan.items.map((x) => ({
            id: x.id,
            kind: x.kind,
            title: x.title,
            start: x.start,
            end: x.end,
          })),
        }
      : null,
  };
}

export function useDayTurn(deps: DayTurnDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const say = useCallback(async (text: string) => {
    await depsRef.current.appendBriefMessage('assistant', text, {
      type: 'brief-text',
      part: dayPartAt(Math.floor(minutesOfDay() / 60)),
      ids: [],
    });
  }, []);

  /**
   * Read a typed message as a day turn. True when it was about the day and is
   * now in the thread; false leaves it to normal chat.
   */
  const run = useCallback(
    async (text: string, question: string | null): Promise<boolean> => {
      const d = depsRef.current;
      if (busyRef.current || !d.threadId) return false;
      busyRef.current = true;
      setThinking(true);
      try {
        const res = await callDayTurn(
          buildDayTurnRequest(text, question, d.date, d.messages, d.plan.livePlan),
        );
        if (!res.ok) {
          console.warn('[DayTurn] could not be reached:', res.error);
          return false;
        }
        const data = res.data;
        const changes = data?.changes ?? [];
        if (!data?.about_day || (!changes.length && !data.reply)) return false;
        await d.appendBriefMessage('user', text, {});
        setThinking(false);
        await say(data.reply || DAY_TURN_COPY.fallbackReply);
        if (changes.length) {
          const meta: BriefChangesMeta = {
            type: 'brief-changes',
            changes,
            checklist: data.checklist ?? [],
            status: 'open',
            prompt_version: data.prompt_version,
          };
          await d.appendBriefMessage('system', '', meta as unknown as Record<string, unknown>);
        } else if (!(data.checklist ?? []).some((a) => a.status === 'needs_answer')) {
          // nothing to apply and nothing asked back: the brief carries on
          await d.continueBrief();
        }
        return true;
      } catch (err) {
        console.warn('[DayTurn] failed:', err);
        return false;
      } finally {
        busyRef.current = false;
        setThinking(false);
      }
    },
    [say],
  );

  const apply = useCallback(
    async (message: SpaceChatMessage, unticked: string[]) => {
      const d = depsRef.current;
      const meta = briefMetaOf(message);
      if (busyRef.current || meta?.type !== 'brief-changes' || meta.status !== 'open') return;
      busyRef.current = true;
      setBusy(true);
      const chosen = meta.changes.filter((c) => !unticked.includes(c.cid));
      const plan = planMetaOf(d.plan.livePlan);
      d.plan.pauseSync();
      try {
        const res = await applyDayChanges(chosen, {
          date: d.date,
          threadId: d.threadId,
          inPlan: new Set(plan ? [...plan.items, ...plan.unplaced].map((x) => x.id) : []),
          hasPlan: !!plan,
        });
        await d.patchMessageMetadata(message.id, {
          status: 'applied',
          unticked,
          applied: res.done,
          failed: res.failed,
        });
        if (res.done.length) {
          await d.appendBriefMessage('system', changedEventText(res.done.length), {
            type: 'brief-event',
            icon: 'saved',
          });
        }
        if (res.failed.length) await say(DAY_TURN_COPY.someFailed);
        const p = res.plan;
        if (plan && (p.add.length || p.remove.length || p.pin.length || res.frameChanged)) {
          await d.plan.reviseAfterChanges(p);
        }
      } catch (err) {
        console.warn('[DayTurn] apply failed:', err);
      } finally {
        d.plan.resumeSync();
        busyRef.current = false;
        setBusy(false);
      }
      await depsRef.current.continueBrief();
    },
    [say],
  );

  const dismiss = useCallback(
    async (message: SpaceChatMessage) => {
      const d = depsRef.current;
      const meta = briefMetaOf(message);
      if (busyRef.current || meta?.type !== 'brief-changes' || meta.status !== 'open') return;
      busyRef.current = true;
      setBusy(true);
      try {
        await d.patchMessageMetadata(message.id, { status: 'dismissed' });
        await say(DAY_TURN_COPY.dismissed);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
      await depsRef.current.continueBrief();
    },
    [say],
  );

  return { thinking, busy, run, apply, dismiss };
}
