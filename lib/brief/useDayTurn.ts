/**
 * A message typed in today's thread (Daily brief in Chat).
 *
 * Every message typed in the thread goes here first, with the day as the app
 * holds it (the day record, the plan, the person's items, any open question,
 * the conversation and the task list so far). The agent answers it (agent
 * plan step 7), with a status line while it works; when the agent is off or
 * cannot finish, the day turn answers, as before. Gremly's reply comes first,
 * then one card listing every change with a tick; nothing changes until
 * Accept all (or Apply, with some unticked). That writes the ticked changes
 * through the change model (lib/changes), adds "Updated 3 things", re-fits
 * the plan as one new version, and the brief carries on. Undo on the card
 * puts everything back and re-fits the plan again. A message the day turn
 * finds is not about the day goes to normal chat, as before; the agent
 * answers every message itself.
 */

import { useCallback, useRef, useState } from 'react';
import type { SpaceChatMessage } from '../types';
import {
  callBriefTurn,
  type AgentTask,
  type BriefTurnRequest,
  type BriefTurnResponse,
  type DayTurnRequest,
} from '../cortex/CortexClient';
import { patchDailyThreadMeta } from '../repo/dailyThreadRepo';
import { useTodayThread } from './todayThread';
import { useGremlyStore } from '../store/useGremlyStore';
import { selectHabitsDueToday } from '../store/selectors';
import { getDateService } from '../date/DateService';
import { briefMetaOf, dayPartAt, visibleThreadMessages } from './messages';
import { localDateOf, minutesOfDay } from './time';
import {
  applyCardChanges,
  applyDayChanges,
  changedEventText,
  undoneEventText,
} from './applyChanges';
import { dayRecordFromStore, meetingsFromStore } from '../plan/storePlan';
import type { PlanChange } from '../plan/usePlanFlow';
import type { BriefChangesMeta, BriefPlanMeta, DailyThreadMeta } from './types';

export const DAY_TURN_COPY = {
  fallbackReply: "Here's what I'd change.",
  dismissed: "No problem, I've left everything as it is.",
  someFailed: "One of those didn't save. It's marked on the card.",
  undoFailed: "I couldn't put all of that back. Have a look at the items it changed.",
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
    /** Make a plan for the day (Plan with Gremly), when they accept Gremly's offer */
    start: (day: string) => Promise<void>;
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

/**
 * What undoing a card means for the plan: what it added comes out, what it
 * took out goes back where it was, and what it moved goes back to its time.
 */
export function inversePlanChange(p: PlanChange, plan: BriefPlanMeta | null): PlanChange {
  const was = new Map((plan?.items ?? []).map((i) => [i.id, i]));
  const unplaced = new Set((plan?.unplaced ?? []).map((u) => u.id));
  return {
    remove: p.add.map((a) => a.id).filter((id) => !was.has(id) && !unplaced.has(id)),
    add: p.remove.map((id) => {
      const i = was.get(id);
      return {
        id,
        kind: i?.kind === 'habit' ? ('habit' as const) : ('todo' as const),
        start: i ? i.start : null,
        minutes: i?.minutes ?? null,
      };
    }),
    pin: [...p.pin.map((x) => x.id), ...p.add.map((a) => a.id)]
      .filter((id) => was.has(id))
      .map((id) => ({ id, start: was.get(id)!.start })),
  };
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

/** The agent's task list so far in today's thread, from its metadata. */
function tasksOf(threadId: string): AgentTask[] {
  const t = useTodayThread.getState().thread;
  const meta = (t && t.id === threadId ? t.metadata_json : null) as Partial<DailyThreadMeta> | null;
  return Array.isArray(meta?.agent_tasks) ? meta!.agent_tasks! : [];
}

/** What the agent is told: the day turn's request, where they are, and the task list. */
export function buildBriefTurnRequest(
  text: string,
  question: string | null,
  date: string,
  messages: SpaceChatMessage[],
  livePlan: SpaceChatMessage | null,
  threadId: string,
): BriefTurnRequest {
  return {
    ...buildDayTurnRequest(text, question, date, messages, livePlan),
    timezone: getDateService().getTimezone(),
    tasks: tasksOf(threadId),
  };
}

const CHECKLIST: Record<string, 'proposed' | 'needs_answer' | 'not_possible' | 'noted'> = {
  proposed: 'proposed',
  needs_answer: 'needs_answer',
  not_possible: 'not_possible',
  done: 'noted',
};

/** Gremly asked something back, or has an ask still to come back to: the brief waits. */
function waitingOn(tasks: AgentTask[]): boolean {
  return tasks.some((t) => t.status === 'needs_answer' || t.status === 'open');
}

export function useDayTurn(deps: DayTurnDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [thinking, setThinking] = useState(false);
  /** What Gremly is doing right now, while it works on a message */
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // what each applied card can put back, while this screen is open
  const undoRef = useRef(
    new Map<
      string,
      { revert: () => Promise<void>; inverse: PlanChange; frameChanged: boolean; count: number }
    >(),
  );
  const [undoable, setUndoable] = useState<string[]>([]);

  const say = useCallback(async (text: string) => {
    await depsRef.current.appendBriefMessage('assistant', text, {
      type: 'brief-text',
      part: dayPartAt(Math.floor(minutesOfDay() / 60)),
      ids: [],
    });
  }, []);

  /** The day turn's answer, as before step 7. False leaves the message to normal chat. */
  const fromDayTurn = useCallback(
    async (text: string, data: Extract<BriefTurnResponse, { engine: 'day_turn' }>) => {
      const d = depsRef.current;
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
    },
    [say],
  );

  /** The agent's answer: the reply, the card, and the task list kept on the thread. */
  const fromAgent = useCallback(
    async (text: string, data: Extract<BriefTurnResponse, { engine: 'agent' }>) => {
      const d = depsRef.current;
      const reply = String(data.reply ?? '').trim();
      const card = Array.isArray(data.card) ? data.card : [];
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      if (!reply && !card.length) return false;
      await d.appendBriefMessage('user', text, {});
      setThinking(false);
      await say(reply || DAY_TURN_COPY.fallbackReply);
      if (d.threadId) {
        try {
          await patchDailyThreadMeta(d.threadId, { agent_tasks: tasks });
          useTodayThread.getState().patchMeta(d.threadId, { agent_tasks: tasks });
        } catch (err) {
          console.warn('[BriefTurn] could not keep the task list:', err);
        }
      }
      if (card.length) {
        const meta: BriefChangesMeta = {
          type: 'brief-changes',
          changes: [],
          card,
          checklist: tasks
            .filter((t) => CHECKLIST[t.status])
            .map((t) => ({ ask: t.ask, status: CHECKLIST[t.status] })),
          status: 'open',
          prompt_version: data.prompt_version,
        };
        await d.appendBriefMessage('system', '', meta as unknown as Record<string, unknown>);
      } else if (!waitingOn(tasks)) {
        // nothing to apply and nothing asked back: the brief carries on
        await d.continueBrief();
      }
      return true;
    },
    [say],
  );

  /**
   * Read a typed message against the day. True when it is answered in the
   * thread; false leaves it to normal chat.
   */
  const run = useCallback(
    async (text: string, question: string | null): Promise<boolean> => {
      const d = depsRef.current;
      if (busyRef.current || !d.threadId) return false;
      busyRef.current = true;
      setThinking(true);
      setStatus(null);
      try {
        const res = await callBriefTurn(
          buildBriefTurnRequest(text, question, d.date, d.messages, d.plan.livePlan, d.threadId),
          { onStatus: (line) => setStatus(line) },
        );
        if (!res.ok) {
          console.warn('[BriefTurn] could not be reached:', res.error);
          return false;
        }
        if (res.data.engine === 'agent') return await fromAgent(text, res.data);
        if (res.data.agent_error)
          console.warn('[BriefTurn] the day turn answered:', res.data.agent_error);
        return await fromDayTurn(text, res.data);
      } catch (err) {
        console.warn('[BriefTurn] failed:', err);
        return false;
      } finally {
        busyRef.current = false;
        setThinking(false);
        setStatus(null);
      }
    },
    [fromAgent, fromDayTurn],
  );

  const apply = useCallback(
    async (message: SpaceChatMessage, unticked: string[]) => {
      const d = depsRef.current;
      const meta = briefMetaOf(message);
      if (busyRef.current || meta?.type !== 'brief-changes' || meta.status !== 'open') return;
      busyRef.current = true;
      setBusy(true);
      let planDay = false;
      const plan = planMetaOf(d.plan.livePlan);
      const ctx = {
        date: d.date,
        threadId: d.threadId,
        inPlan: new Set(plan ? [...plan.items, ...plan.unplaced].map((x) => x.id) : []),
        hasPlan: !!plan,
      };
      d.plan.pauseSync();
      try {
        // the agent's card is in the change model's shape; the day turn's in its own kinds
        const res = meta.card?.length
          ? await applyCardChanges(
              meta.card.filter((c) => !unticked.includes(c.cid)),
              ctx,
            )
          : await applyDayChanges(
              meta.changes.filter((c) => !unticked.includes(c.cid)),
              ctx,
            );
        if (res.done.length) {
          undoRef.current.set(message.id, {
            revert: res.revert,
            inverse: inversePlanChange(res.plan, plan),
            frameChanged: res.frameChanged,
            count: res.done.length,
          });
          setUndoable((u) => [...u, message.id]);
        }
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
        // their yes to Gremly's offer to plan the day: the planner takes it from here
        if (res.planDay && !plan) planDay = true;
      } catch (err) {
        console.warn('[DayTurn] apply failed:', err);
      } finally {
        d.plan.resumeSync();
        busyRef.current = false;
        setBusy(false);
      }
      // the planner draws the plan next; otherwise the brief carries on
      if (planDay) await depsRef.current.plan.start(d.date);
      else await depsRef.current.continueBrief();
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

  const undo = useCallback(
    async (message: SpaceChatMessage) => {
      const d = depsRef.current;
      const meta = briefMetaOf(message);
      const entry = undoRef.current.get(message.id);
      if (
        busyRef.current ||
        meta?.type !== 'brief-changes' ||
        meta.status !== 'applied' ||
        !entry
      ) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      d.plan.pauseSync();
      try {
        await entry.revert();
        undoRef.current.delete(message.id);
        setUndoable((u) => u.filter((x) => x !== message.id));
        await d.patchMessageMetadata(message.id, { status: 'undone' });
        await d.appendBriefMessage('system', undoneEventText(entry.count), {
          type: 'brief-event',
          icon: 'saved',
        });
        const p = entry.inverse;
        if (
          planMetaOf(d.plan.livePlan) &&
          (p.add.length || p.remove.length || p.pin.length || entry.frameChanged)
        ) {
          await d.plan.reviseAfterChanges(p);
        }
      } catch (err) {
        console.warn('[DayTurn] undo failed:', err);
        await say(DAY_TURN_COPY.undoFailed);
      } finally {
        d.plan.resumeSync();
        busyRef.current = false;
        setBusy(false);
      }
    },
    [say],
  );

  const canUndo = useCallback((messageId: string) => undoable.includes(messageId), [undoable]);

  return { thinking, status, busy, run, apply, dismiss, undo, canUndo };
}
