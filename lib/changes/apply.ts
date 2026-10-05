/**
 * Applying checked changes: the only place a change Gremly proposed becomes a
 * write, and only after the person tapped. Every write goes through the
 * store's own actions, so the usual sync, optimistic update and rollback
 * apply. Each change that goes through hands back its Undo, built from the
 * item as it was at that moment, and a card's changes can be undone together.
 *
 * Rules (Gremly agent: one change model):
 * - nothing the person did since is overwritten: a field whose value is no
 *   longer the one the card showed as "before" stops the whole change
 * - field changes go into the item's history; done and check ins don't
 * - archive, never delete; Undo of something just added takes it away again
 * - a change that fails is reported, never claimed
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { patchDailyThreadMeta } from '../repo/dailyThreadRepo';
import { useTodayThread } from '../brief/todayThread';
import type { DailyThreadMeta } from '../brief/types';
import type { ThreadBlock } from '../brief/dayRecord';
import { generateDropId } from '../minddrop/ids';
import { changeLogOf, recordEntry, type ChangeSource } from '../chat/changeHistory';
import { beforeValue, fieldDef, scheduleOf, type Change, type ItemType } from './model';
import { findItem, snapshotOf } from './snapshot';
import { createColumns, writeFor } from './patch';
import { historyLines } from './history';
import { applyLinks, copyLinks, hasLinks } from './links';
import { doneWords, type NameLookup } from './words';
import { applyWeekChange } from './week';

export interface ApplyOptions {
  source: ChangeSource;
  /** Today's thread, for skipping a habit today and for set times */
  threadId?: string | null;
  /** Mind Drop's two step card: a time that follows the day just moved joins that history line */
  joinHistory?: boolean;
}

export type Outcome =
  | { cid: string; ok: true; summary: string; revert: () => Promise<void>; createdId?: string }
  | { cid: string; ok: false; reason: 'stale' | 'gone' | 'failed'; message: string };

type Item = Record<string, any>;

const KIND: Record<ItemType, string> = { todo: 'todo', habit: 'habit', note: 'note' };
const CADENCE = { day: 'daily', week: 'weekly', month: 'monthly' } as const;
const ARCHIVE_REASON: Record<ItemType, string> = {
  todo: 'cancelled in chat',
  habit: 'stopped in chat',
  note: 'archived in chat',
};

function store(): any {
  return useGremlyStore.getState();
}

function actions(type: ItemType) {
  const s = store();
  if (type === 'todo') {
    return {
      create: s.createTodo,
      update: s.updateTodo,
      archive: s.archiveTodo,
      restore: s.restoreTodo,
      remove: s.deleteTodo,
    };
  }
  if (type === 'habit') {
    return {
      create: s.createHabit,
      update: s.updateHabit,
      archive: s.archiveHabit,
      restore: s.restoreHabit,
      remove: s.deleteHabit,
    };
  }
  return {
    create: s.createNote,
    update: s.updateNote,
    archive: s.archiveNote,
    restore: s.restoreNote,
    remove: s.deleteNote,
  };
}

/** Names of Worlds and Chapters, for the words. */
export function nameLookup(): NameLookup {
  const s = store();
  return (kind, id) =>
    kind === 'worlds'
      ? (s.worlds ?? []).find((w: any) => w.id === id)?.display_name ||
        (s.worlds ?? []).find((w: any) => w.id === id)?.name ||
        'a World'
      : (s.chapters ?? []).find((c: any) => c.id === id)?.title || 'a Chapter';
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** A field the card showed as "before" that has changed since. */
export function staleField(type: ItemType, change: Change, snapshot: Item): string | null {
  for (const [field, value] of Object.entries(change.fields ?? {})) {
    const def = fieldDef(type, field);
    if (!def || !change.before || !(field in change.before)) continue;
    if (['tags', 'links', 'list', 'reminder'].includes(def.kind)) continue;
    if (def.kind === 'text' && value && typeof value === 'object') continue;
    const now = beforeValue(type, snapshot, field);
    if (JSON.stringify(now) !== JSON.stringify(change.before[field])) return field;
  }
  return null;
}

const nothing = async () => {};

// ── One change ──────────────────────────────────────────────────────────────

async function applyFields(change: Change, opts: ApplyOptions): Promise<Outcome> {
  const type = change.type as ItemType;
  const id = change.id as string;
  const item = findItem(type, id);
  if (!item) return gone(change);
  if (staleField(type, change, snapshotOf(type, id) ?? item)) {
    return {
      cid: change.cid,
      ok: false,
      reason: 'stale',
      message: `${change.title} changed since, so it was left as it is.`,
    };
  }
  const fields = change.fields ?? {};
  const w = writeFor(type, item, fields);
  const lines = historyLines(type, item, fields, nameLookup());
  const bodyBefore = type === 'habit' ? item.notes : item.body;

  let views: unknown = item.views;
  const undos: Array<(current: unknown) => Record<string, unknown>> = [];
  lines.forEach((line, i) => {
    const last = changeLogOf(views).slice(-1)[0];
    const join =
      !!opts.joinHistory && i === 0 && line.field === 'due_time' && last?.field === 'due_day';
    const r = recordEntry(views, line, opts.source, bodyBefore, join);
    views = r.views;
    undos.push(r.undo);
  });
  const touchesViews = lines.length > 0 || Object.keys(w.viewsCopy).length > 0;

  const a = actions(type);
  const s = store();
  const scheduleFrom = w.schedule ? scheduleOf(item) : null;
  const targetMoves =
    !!w.schedule &&
    (w.schedule.to.per !== scheduleFrom!.per || w.schedule.to.times !== scheduleFrom!.times);
  if (w.schedule && targetMoves) {
    // the tracking target and its history, from this week
    await s.setHabitTarget(id, CADENCE[w.schedule.to.per], w.schedule.to.times);
  }
  if (Object.keys(w.patch).length || touchesViews) {
    await a.update(id, {
      ...w.patch,
      ...(touchesViews ? { views: { ...asObject(views), ...w.viewsCopy } } : {}),
    });
  }
  const undoLinks = hasLinks(w.links) ? await applyLinks(type, id, w.links) : null;

  return {
    cid: change.cid,
    ok: true,
    summary: doneWords(change, { names: nameLookup() }),
    revert: async () => {
      if (undoLinks) await undoLinks();
      if (w.schedule && targetMoves) {
        await store().setHabitTarget(id, CADENCE[scheduleFrom!.per], scheduleFrom!.times);
      }
      if (Object.keys(w.undo).length || touchesViews) {
        let current: unknown = findItem(type, id)?.views ?? views;
        for (const undo of [...undos].reverse()) current = undo(current);
        await actions(type).update(id, {
          ...w.undo,
          ...(touchesViews ? { views: { ...asObject(current), ...w.viewsCopyBack } } : {}),
        });
      }
    },
  };
}

function gone(change: Change): Outcome {
  return {
    cid: change.cid,
    ok: false,
    reason: 'gone',
    message: `That ${KIND[change.type as ItemType] ?? 'item'} is no longer here.`,
  };
}

/** What an item carries into the kind it becomes. */
function carried(from: ItemType, to: ItemType, item: Item): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const name = from === 'note' ? item.title || item.name : item.name || item.title;
  if (name) out.name = String(name).trim();
  const text = from === 'habit' ? item.notes : item.body;
  if (typeof text === 'string' && text.trim()) out.text = text.trim();
  if (
    (from === 'todo' || from === 'habit') &&
    (to === 'todo' || to === 'habit') &&
    item.time_estimate_minutes
  ) {
    out.length = item.time_estimate_minutes;
  }
  if (from === 'note' && to === 'todo') {
    if (item.target_date) out.day = String(item.target_date).slice(0, 10);
    if (item.event_time) out.time = String(item.event_time).slice(0, 5);
  }
  return out;
}

async function applyOne(change: Change, opts: ApplyOptions): Promise<Outcome> {
  const type = change.type as ItemType;
  const s = store();
  const ok = (revert: () => Promise<void>, createdId?: string): Outcome => ({
    cid: change.cid,
    ok: true,
    summary: doneWords(change, { names: nameLookup() }),
    revert,
    ...(createdId ? { createdId } : {}),
  });

  switch (change.op) {
    case 'add': {
      const fields = change.fields ?? {};
      const { worlds, chapters, ...rest } = fields;
      const created = await actions(type).create(createColumns(type, rest));
      const id = created?.id as string | undefined;
      if (!id) throw new Error('It was not saved.');
      const undoLinks =
        worlds || chapters ? await applyLinks(type, id, { worlds, chapters }) : null;
      return ok(async () => {
        if (undoLinks) await undoLinks();
        await actions(type).remove(id);
      }, id);
    }
    case 'change':
      return applyFields(change, opts);
    case 'done':
      if (!findItem(type, change.id)) return gone(change);
      await s.completeTodo(change.id);
      return ok(() => store().uncompleteTodo(change.id));
    case 'reopen':
      if (!findItem(type, change.id)) return gone(change);
      await s.uncompleteTodo(change.id);
      return ok(() => store().completeTodo(change.id));
    case 'log':
    case 'unlog': {
      if (!findItem(type, change.id)) return gone(change);
      const days = change.days ?? [];
      const add = change.op === 'log';
      for (const d of days) {
        if (add) await s.logHabitCompletionForDate(change.id, d);
        else await s.removeHabitCompletionForDate(change.id, d);
      }
      return ok(async () => {
        const now = store();
        for (const d of days) {
          if (add) await now.removeHabitCompletionForDate(change.id, d);
          else await now.logHabitCompletionForDate(change.id, d);
        }
      });
    }
    case 'archive': {
      if (!findItem(type, change.id)) return gone(change);
      await actions(type).archive(change.id, ARCHIVE_REASON[type]);
      return ok(() => actions(type).restore(change.id as string));
    }
    case 'restore': {
      const item = findItem(type, change.id);
      if (!item) return gone(change);
      const reason = item.archived_reason ?? ARCHIVE_REASON[type];
      await actions(type).restore(change.id);
      return ok(() => actions(type).archive(change.id as string, reason));
    }
    case 'convert': {
      const item = findItem(type, change.id);
      if (!item) return gone(change);
      const to = change.to as ItemType;
      const fields = { ...carried(type, to, item), ...(change.fields ?? {}) };
      const created = await actions(to).create(createColumns(to, fields));
      const newId = created?.id as string | undefined;
      if (!newId) throw new Error('It was not saved.');
      await copyLinks(to, change.id as string, newId);
      const views = asObject(item.views);
      await actions(type).update(change.id, {
        views: { ...views, converted_to_type: to, converted_to_id: newId },
      });
      await actions(type).archive(change.id, 'converted');
      return ok(async () => {
        await actions(to).remove(newId);
        await actions(type).restore(change.id as string);
        await actions(type).update(change.id, { views });
      }, newId);
    }
    case 'plan':
      // today's plan is re-fitted by the thread from what was applied
      return ok(nothing);
    // the week's own changes (the weekly review), each with its own writer
    case 'later':
    case 'habit_days':
    case 'week_shape':
    case 'intention':
    case 'milestone':
    case 'weekly_day': {
      const r = await applyWeekChange(change);
      if (!r.ok) return { cid: change.cid, ...r };
      return ok(r.revert, r.createdId);
    }
    default:
      throw new Error(`No way to apply ${change.op}`);
  }
}

// ── Today's thread ──────────────────────────────────────────────────────────

const THREAD_PLAN = new Set(['add_block', 'remove_block']);

function isThreadChange(c: Change): boolean {
  return c.op === 'skip_today' || (c.op === 'plan' && THREAD_PLAN.has(c.plan?.kind ?? ''));
}

function threadLists(threadId: string) {
  const t = useTodayThread.getState().thread;
  const meta = (t && t.id === threadId ? t.metadata_json : null) as Partial<DailyThreadMeta> | null;
  return {
    fixed_blocks: [...(meta?.fixed_blocks ?? [])] as ThreadBlock[],
    fixed_removed: [...(meta?.fixed_removed ?? [])],
    skipped_habits: [...(meta?.skipped_habits ?? [])],
  };
}

async function saveThread(threadId: string, patch: ReturnType<typeof threadLists>) {
  await patchDailyThreadMeta(threadId, patch);
  useTodayThread.getState().patchMeta(threadId, patch);
}

/** Skips and set times all go into the thread's lists in one write. */
async function applyThread(
  changes: Change[],
  threadId: string | null | undefined,
): Promise<Outcome[]> {
  if (!threadId) {
    return changes.map((c) => ({
      cid: c.cid,
      ok: false,
      reason: 'failed',
      message: "Today's thread isn't open.",
    }));
  }
  const before = threadLists(threadId);
  const lists = threadLists(threadId);
  for (const c of changes) {
    if (c.op === 'skip_today') {
      if (!lists.skipped_habits.includes(c.id as string)) lists.skipped_habits.push(c.id as string);
    } else if (c.plan?.kind === 'add_block') {
      lists.fixed_blocks.push({
        id: `chat:${generateDropId()}`,
        title: c.plan.title ?? c.title,
        start: c.plan.start as number,
        end: c.plan.end ?? null,
        travel: c.plan.travel === true,
      });
    } else if (c.plan?.kind === 'remove_block') {
      const id = c.plan.id as string;
      lists.fixed_blocks = lists.fixed_blocks.filter((b) => b.id !== id);
      if (!lists.fixed_removed.includes(id)) lists.fixed_removed.push(id);
    }
  }
  try {
    await saveThread(threadId, lists);
  } catch (err) {
    console.warn('[changes] could not save the thread', err);
    return changes.map((c) => ({
      cid: c.cid,
      ok: false,
      reason: 'failed',
      message: 'That could not be saved.',
    }));
  }
  return changes.map((c, i) => ({
    cid: c.cid,
    ok: true,
    summary: doneWords(c),
    // one write for all of them, so one Undo puts the lists back
    revert: i === 0 ? () => saveThread(threadId, before) : nothing,
  }));
}

// ── A card ──────────────────────────────────────────────────────────────────

/**
 * Apply a card's checked changes, in order. Resolves with each change's
 * outcome and one Undo for everything that went through.
 */
export async function applyChanges(
  changes: Change[],
  opts: ApplyOptions,
): Promise<{ outcomes: Outcome[]; revertAll: () => Promise<void> }> {
  const byCid = new Map<string, Outcome>();
  for (const c of changes) {
    if (isThreadChange(c)) continue;
    try {
      byCid.set(c.cid, await applyOne(c, opts));
    } catch (err) {
      console.warn('[changes] could not apply', c.op, err);
      byCid.set(c.cid, {
        cid: c.cid,
        ok: false,
        reason: 'failed',
        message: err instanceof Error && err.message ? err.message : 'That could not be saved.',
      });
    }
  }
  const thread = changes.filter(isThreadChange);
  if (thread.length) {
    for (const o of await applyThread(thread, opts.threadId)) byCid.set(o.cid, o);
  }
  const outcomes = changes.map((c) => byCid.get(c.cid) as Outcome);
  return {
    outcomes,
    revertAll: async () => {
      for (const o of [...outcomes].reverse()) {
        if (o.ok) await o.revert();
      }
    },
  };
}

/** Apply one change. */
export async function applyChange(change: Change, opts: ApplyOptions): Promise<Outcome> {
  const { outcomes } = await applyChanges([change], opts);
  return outcomes[0];
}
