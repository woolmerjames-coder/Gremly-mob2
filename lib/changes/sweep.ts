/**
 * Sweep's decisions as changes.
 *
 * A decision on a Sweep card (keep it for a day, keep it as it is, bring it
 * back later, let it go) is written here and nowhere else, as it is made.
 * Each write hands back its Undo, and a record in the change model's shape:
 * what it did, with what the item was before. Today's thread keeps those
 * records as the sweep's state.
 *
 * Moving a todo to a day and letting an item go are the change model's own
 * operations (change, archive). Keeping an item as it is and bringing it back
 * later are Sweep's own. They write Sweep's marks (swept_at, resurface_at,
 * skipped_in_sweep_at), which the change model keeps off its field list on
 * purpose, so Gremly is never told about them and cannot propose them:
 * checkChange answers unknown_op for both. They live here, beside the model,
 * and nothing in workers/shared/changes knows them.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { supabase } from '../supabase/client';
import { getDateService } from '../date/DateService';
import { maybeAsk } from '../notifications/ask';
import type { ItemReminder } from '../types';
import { applyChange } from './apply';
import { checkChange } from './model';
import { contextFor, findItem } from './snapshot';

/** Sweep's own operations. Never added to OPS: the agent's tool list is built from that. */
export const SWEEP_OPS = {
  keep: 'keep an item as it is: Sweep has looked at it',
  later: 'bring an item back in a later Sweep',
} as const;
export type SweepOp = keyof typeof SWEEP_OPS;

/** What a card decided, as the card step records it. */
export type SweepDecision = {
  candidateId: string;
  candidateKind: 'todo' | 'note';
  action: 'keep' | 'clear' | 'skip';

  // Todo scheduling
  dueDateStr?: string;

  // Todo and event reminders (push notifications)
  reminderDateStr?: string;
  reminderTime?: string;

  // Resurfacing (Sweep brings it back; no notification for a note)
  resurfaceDateStr?: string;

  // Note actions
  noteAction?: 'fine' | 'resurface' | 'maketodo';
  resurfaceTiming?: 'nextweek' | '2weeks' | 'pick';

  // Space assignment
  spaceId?: string;

  // Event reminder
  eventReminder?: 'daybefore' | 'weekbefore' | 'custom';

  // Event prep todo
  prepTodoText?: string;

  /** Why a cleared item was put away, when it was not an ordinary let go */
  archiveReason?: string;
};

/** One decision in the change model's shape, as today's thread keeps it. */
export interface SweepRecord {
  cid: string;
  op: 'change' | 'archive' | SweepOp;
  type: 'todo' | 'note';
  id: string;
  /** The item's name when it was decided */
  title: string;
  /** What was set: day, reminder_day, later, left */
  fields?: Record<string, unknown>;
  /** The same fields as they were */
  before?: Record<string, unknown>;
  /** kept, let go, or left for the next Sweep */
  out: 'kept' | 'let_go' | 'left';
  /** The receipt's words for it */
  label: string;
  at: string;
  /** Set when its Undo was used */
  undone_at?: string | null;
}

export type SweepOutcome =
  | { ok: true; record: SweepRecord; revert: () => Promise<void> }
  | { ok: false; reason: 'gone' | 'failed'; message: string };

type Item = Record<string, any>;

function store(): any {
  return useGremlyStore.getState();
}

function titleOf(type: 'todo' | 'note', item: Item): string {
  const t = type === 'todo' ? item.name || item.title : item.title || item.body;
  return String(t || 'Untitled')
    .trim()
    .slice(0, 80);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A day in the receipt's words, counted from the person's day (which after
 * midnight is still yesterday until their day ends): Today, Tomorrow, a
 * weekday within the week, then the date. After midnight tomorrow is named by
 * its weekday, so nobody has to work out which day is meant.
 */
export function sweepDayWords(day: string): string {
  const ds = getDateService();
  const theirDay = ds.ritualDay();
  const n = ds.daysBetween(theirDay, day);
  const date = ds.fromLocalDate(day);
  if (!date) return day;
  if (n === 0) return 'Today';
  if (n === 1 && !ds.isInLateNightPeriod()) return 'Tomorrow';
  if (n > 0 && n <= 7) return WEEKDAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "today", "tomorrow", "on Thursday", "on 16 Oct". */
function onWords(day: string): string {
  const words = sweepDayWords(day);
  return words === 'Today' || words === 'Tomorrow' ? words.toLowerCase() : `on ${words}`;
}

function backWords(day: string): string {
  const ds = getDateService();
  const n = ds.daysBetween(ds.ritualDay(), day);
  if (n === 7) return 'Back in a week';
  if (n === 14) return 'Back in two weeks';
  return `Back ${onWords(day)}`;
}

/** Write a patch to an item, and hand back the write that puts those columns back. */
async function patchWithUndo(
  type: 'todo' | 'note',
  item: Item,
  patch: Item,
): Promise<{ before: Item; revert: () => Promise<void> }> {
  const s = store();
  const update = type === 'todo' ? s.updateTodo : s.updateNote;
  const before: Item = {};
  for (const k of Object.keys(patch)) before[k] = item[k] ?? null;
  await update(item.id, patch);
  return {
    before,
    revert: async () => {
      await (type === 'todo' ? store().updateTodo : store().updateNote)(item.id, before);
    },
  };
}

function reminderFor(id: string, date: string, time: string): ItemReminder {
  return {
    id: `sweep-remind-${getDateService().now().getTime()}-${id.slice(0, 8)}`,
    time,
    frequency: 'once',
    date,
  };
}

/** A default reminder time from the item's part of the day. */
function defaultReminderTime(timeWindow?: string | null): string {
  if (timeWindow === 'day') return '13:00';
  if (timeWindow === 'evening') return '18:00';
  return '09:00';
}

let seq = 0;
function nextCid(): string {
  seq += 1;
  return `s${seq}`;
}

/**
 * Apply one card's decision and hand back its record and its Undo. The item
 * is read from the store as it is now; one that has gone (archived or done
 * since the card was shown) is reported, not written.
 */
export async function applySweepDecision(decision: SweepDecision): Promise<SweepOutcome> {
  const type = decision.candidateKind;
  const item = findItem(type, decision.candidateId);
  if (!item) return { ok: false, reason: 'gone', message: 'That item is no longer there.' };
  const base = {
    cid: nextCid(),
    type,
    id: item.id as string,
    title: titleOf(type, item),
    at: getDateService().nowTimestamp(),
  };
  try {
    if (decision.action === 'clear') return await letGo(decision, item, base);
    if (decision.action === 'skip') return await leave(item, base);
    if (type === 'todo') return await keepTodo(decision, item, base);
    return await keepNote(decision, item, base);
  } catch (err) {
    console.warn('[Sweep] could not save a decision', decision.action, err);
    return {
      ok: false,
      reason: 'failed',
      message: err instanceof Error && err.message ? err.message : 'That could not be saved.',
    };
  }
}

type Base = Pick<SweepRecord, 'cid' | 'type' | 'id' | 'title' | 'at'>;

async function letGo(decision: SweepDecision, item: Item, base: Base): Promise<SweepOutcome> {
  const s = store();
  const reason = decision.archiveReason || 'swept';
  if (base.type === 'todo') await s.archiveTodo(item.id, reason);
  else await s.archiveNote(item.id, reason);
  return {
    ok: true,
    record: { ...base, op: 'archive', out: 'let_go', label: 'Let go' },
    revert: async () => {
      if (base.type === 'todo') await store().restoreTodo(item.id);
      else await store().restoreNote(item.id);
    },
  };
}

/** Left for the next Sweep: it comes back then. */
async function leave(item: Item, base: Base): Promise<SweepOutcome> {
  const now = getDateService().nowTimestamp();
  const w = await patchWithUndo(base.type, item, { skipped_in_sweep_at: now });
  return {
    ok: true,
    record: {
      ...base,
      op: 'keep',
      fields: { left: true },
      before: {},
      out: 'left',
      label: 'Left for next time',
    },
    revert: w.revert,
  };
}

async function keepTodo(decision: SweepDecision, item: Item, base: Base): Promise<SweepOutcome> {
  // Bring it back later: Sweep's own, with a reminder on the day
  if (decision.resurfaceDateStr) {
    const day = decision.resurfaceDateStr;
    void maybeAsk('bell');
    const w = await patchWithUndo('todo', item, {
      resurface_at: day,
      scheduled_date: day,
      due_day: day,
      due_date: null,
      reminders: [reminderFor(item.id, day, defaultReminderTime(item.time_window))],
    });
    return {
      ok: true,
      record: {
        ...base,
        op: 'later',
        fields: { later: day },
        before: { later: w.before.resurface_at ?? null, day: w.before.due_day ?? null },
        out: 'kept',
        label: backWords(day),
      },
      revert: w.revert,
    };
  }

  // Kept for a day: the change model's change, then Sweep's marks
  if (decision.dueDateStr) {
    const day = decision.dueDateStr;
    const reverts: Array<() => Promise<void>> = [];
    const raw = { op: 'change', type: 'todo', id: item.id, fields: { day } };
    const checked = checkChange(raw, contextFor(raw));
    const beforeDay = item.due_day ?? null;
    if (checked.ok) {
      const moved = await applyChange({ ...checked.change, cid: base.cid }, { source: 'sweep' });
      if (!moved.ok) return { ok: false, reason: 'failed', message: moved.message };
      reverts.push(moved.revert);
    }
    const fresh = findItem('todo', item.id) || item;
    const marks: Item = {
      skipped_in_sweep_at: null,
      resurface_at: null,
      sweep_reschedule_count: (item.sweep_reschedule_count ?? 0) + 1,
    };
    if (decision.reminderDateStr) {
      void maybeAsk('bell');
      marks.reminders = [
        reminderFor(item.id, decision.reminderDateStr, decision.reminderTime || '09:00'),
      ];
    }
    const w = await patchWithUndo('todo', fresh, marks);
    reverts.push(w.revert);
    return {
      ok: true,
      record: {
        ...base,
        op: 'change',
        fields: {
          day,
          ...(decision.reminderDateStr ? { reminder_day: decision.reminderDateStr } : {}),
        },
        before: { day: beforeDay },
        out: 'kept',
        label: sweepDayWords(day),
      },
      // newest first: the marks, then the day
      revert: async () => {
        for (const r of [...reverts].reverse()) await r();
      },
    };
  }

  // Kept as it is
  const w = await patchWithUndo('todo', item, { skipped_in_sweep_at: null });
  return {
    ok: true,
    record: { ...base, op: 'keep', fields: {}, before: {}, out: 'kept', label: 'Kept' },
    revert: w.revert,
  };
}

async function keepNote(decision: SweepDecision, item: Item, base: Base): Promise<SweepOutcome> {
  const now = getDateService().nowTimestamp();
  const space = decision.spaceId ? { space_id: decision.spaceId } : {};

  // Resurface later: no notification, Sweep brings it back on the day
  if (decision.noteAction === 'resurface' && decision.resurfaceDateStr) {
    const day = decision.resurfaceDateStr;
    const w = await patchWithUndo('note', item, {
      resurface_at: day,
      swept_at: now,
      skipped_in_sweep_at: null,
      resurface_count: (item.resurface_count ?? 0) + 1,
      ...space,
    });
    return {
      ok: true,
      record: {
        ...base,
        op: 'later',
        fields: { later: day },
        before: { later: w.before.resurface_at ?? null },
        out: 'kept',
        label: backWords(day),
      },
      revert: w.revert,
    };
  }

  // An event: a reminder before it, and a todo to get ready for it when asked
  const eventKeep =
    decision.noteAction !== 'fine' && (!!decision.reminderDateStr || !!decision.prepTodoText);
  if (eventKeep) {
    const reverts: Array<() => Promise<void>> = [];
    if (decision.prepTodoText) {
      const undoPrep = await addPrepTodo(decision.prepTodoText, item);
      if (undoPrep) reverts.push(undoPrep);
    }
    const patch: Item = { swept_at: now, skipped_in_sweep_at: null, ...space };
    if (decision.reminderDateStr) {
      void maybeAsk('bell');
      patch.reminders = [reminderFor(item.id, decision.reminderDateStr, '09:00')];
    }
    const w = await patchWithUndo('note', item, patch);
    reverts.push(w.revert);
    return {
      ok: true,
      record: {
        ...base,
        op: 'keep',
        fields: decision.reminderDateStr ? { reminder_day: decision.reminderDateStr } : {},
        before: {},
        out: 'kept',
        label: decision.reminderDateStr ? `Reminder ${onWords(decision.reminderDateStr)}` : 'Kept',
      },
      revert: async () => {
        for (const r of [...reverts].reverse()) await r();
      },
    };
  }

  // Fine as it is
  const w = await patchWithUndo('note', item, {
    swept_at: now,
    skipped_in_sweep_at: null,
    resurface_at: null,
    ...space,
  });
  return {
    ok: true,
    record: { ...base, op: 'keep', fields: {}, before: {}, out: 'kept', label: 'Kept as it is' },
    revert: w.revert,
  };
}

/** The todo to get ready for an event. Its Undo takes it away again. */
async function addPrepTodo(text: string, event: Item): Promise<(() => Promise<void>) | null> {
  const userId = store().userId;
  if (!userId) return null;
  const { data: newTodo } = await supabase
    .from('todos')
    .insert({
      owner_id: userId,
      name: text,
      title: text,
      body: `Prep for: ${event.title || ''}`,
      status: 'active',
      origin: 'sweep',
      target_date: event.target_date || null,
      due_day: event.target_date || null,
      date_confidence: event.target_date ? 'user_set' : null,
      linked_event_id: event.id,
      energy_type: 'administrative',
      updated_at: getDateService().nowTimestamp(),
    } as any)
    .select()
    .single();
  if (!newTodo) return null;
  useGremlyStore.setState((state: any) => ({
    todos: [...state.todos, { ...(newTodo as any), type: 'todo' as const, reminders: [] }],
  }));
  const id = (newTodo as any).id as string;
  return async () => {
    await store().deleteTodo(id);
  };
}

/** Counts for the receipt: what is kept and let go now, with what was put back left out. */
export function sweepCounts(records: SweepRecord[]): {
  kept: number;
  letGo: number;
  left: number;
  back: number;
  decided: number;
} {
  const live = records.filter((r) => !r.undone_at);
  const kept = live.filter((r) => r.out === 'kept').length;
  const letGo = live.filter((r) => r.out === 'let_go').length;
  const left = live.filter((r) => r.out === 'left').length;
  return {
    kept,
    letGo,
    left,
    back: records.length - live.length,
    decided: kept + letGo,
  };
}
