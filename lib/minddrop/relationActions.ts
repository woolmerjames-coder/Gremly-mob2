/**
 * relationActions.ts: asking, and acting on, "is this drop about something
 * you already have?" (types and words in dropRelation.ts).
 *
 * - fetchDropRelation: the Worker's answer, or null (off, slow, unsure, failed).
 * - heldRelationFor: the answer as the saved item carries it (from stage 4 the
 *   drop is saved as its own kind and the answer attaches to it whenever it
 *   lands). An older build filed the drop as a note carrying the question;
 *   such notes are still answered and lapsed here (keepsHeldNote).
 * - applyDropRelation: the user said yes. The change goes through the chat
 *   card's own applyEntityChange (lib/chat/entityCards.ts), so sync, rollback
 *   and Undo behave the same in both places. The drop is found among todos,
 *   habits and notes (Mind Drop rethink stage 6), and archived as its kind.
 * - keepDropAsNew: the user said no. A drop saved by the rethink is already
 *   its own kind, so only the answer is marked. A drop an older build held as
 *   a note is filed exactly as it was classified, through the same step a
 *   clarification answer uses.
 *
 * Nothing here runs without a tap except the fetch, and a lapse
 * (lib/minddrop/askActions.ts).
 */
import { useGremlyStore } from '../store/useGremlyStore';
import {
  applyEntityChange,
  formatDay,
  formatTime,
  type ApplyChangeOptions,
} from '../chat/entityCards';
import { getSessionToken } from '../cortex/getSessionToken';
import { dateService } from '../date/DateService';
import { env, getEnv } from '../env';
import type { QueuedDrop } from './dropQueue';
import { hasUsableClarification } from './clarification';
import { keyedCalls, type StartedCall } from './dropCalls';
import { kindWordOf, updateDropRow } from './dropSync';
import { DIDNT_GO, PlainError } from './plainError';
import {
  changeForEntity,
  keepsDropAfterYes,
  keepsHeldNote,
  parseRelation,
  rawChangeOf,
  relationOf,
  type DropRelation,
  type HeldRelation,
  type RelationChange,
  type RelationClassified,
  type RelationEntity,
  type RelationStatus,
} from './dropRelation';

/** The Worker gives the model 6s; this covers that plus reading the list. */
export const RELATE_TIMEOUT_MS = 7000;
/** Hidden answer used to file a held drop as it was classified. */
export const RELATION_KEEP_OPTION = 'relation_keep';

/** A yes here goes into the item's history as coming from Mind Drop. */
const FROM_MINDDROP: ApplyChangeOptions = { source: 'minddrop' };

const readCortexUrl = (): string => {
  const fromGetEnv = typeof getEnv === 'function' ? getEnv('EXPO_PUBLIC_CORTEX_URL') : undefined;
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

/**
 * Only single drops typed into the Mind Drop box and classified by the one
 * call classifier are checked. A quick add from Today, a Space or a photo is
 * something the user placed on purpose (often with its day), so it files as
 * before. Drops addressed to Gremly, or asking a question, are not about
 * their items.
 */
export function shouldRelate(drop: QueuedDrop): boolean {
  if (drop.classifyEngine !== 'v3' || drop.isMulti) return false;
  if (drop.source !== 'minddrop' || drop.dueDayOverride || drop.prefillDate) return false;
  if (!drop.text?.trim()) return false;
  const type = drop.ambiguityType;
  if (drop.needsClarification && (type === 'conversation' || type === 'open_question')) {
    return false;
  }
  return true;
}

/**
 * The check only needs the drop's words, so it starts at the tap, beside the
 * classifier and the title call, and attaches to the saved item whenever it
 * lands (Mind Drop rethink stage 4). Kept in memory by the drop's local id
 * (dropCalls.ts); after an app restart the drop simply asks again.
 */
const early = keyedCalls<DropRelation>('already have it');

/** Start the check as soon as a Mind Drop box drop is queued. */
export function startDropRelation(drop: QueuedDrop): void {
  if (drop.source !== 'minddrop' || drop.dueDayOverride || drop.prefillDate) return;
  if (!drop.text?.trim()) return;
  early.start(drop.localId, () => fetchDropRelation(drop.text));
}

/** The check started at the tap, or one started now (after an app restart). */
export function dropRelationFor(drop: QueuedDrop): StartedCall<DropRelation> {
  return early.get(drop.localId) ?? early.start(drop.localId, () => fetchDropRelation(drop.text));
}

/** The check started for this drop, if it is still in memory (none after an app restart). */
export function startedDropRelation(localId: string): StartedCall<DropRelation> | null {
  return early.get(localId);
}

/** The answer started early, or a fresh ask when there is none. */
export function takeDropRelation(drop: QueuedDrop): Promise<DropRelation | null> {
  const started = early.get(drop.localId);
  early.forget(drop.localId);
  return started ? started.promise : fetchDropRelation(drop.text);
}

/** The drop turned out not to need the check (several items, or addressed to Gremly). */
export function forgetDropRelation(localId: string): void {
  early.forget(localId);
}

/**
 * The answer as the saved item carries it in views.relation: pending, with how
 * the drop was saved (its kind and any question), so the answers in stage 6
 * and an older build's keep both work. The surface is added at the attach.
 */
export function heldRelationFor(
  drop: QueuedDrop,
  relation: DropRelation,
  kind: {
    bucket: RelationClassified['bucket'];
    subtype: string | null;
    habitSubtype: string | null;
  },
): Omit<HeldRelation, 'surface'> {
  const classified: RelationClassified = {
    bucket: kind.bucket,
    subtype: kind.subtype ?? null,
    habitSubtype: kind.habitSubtype ?? null,
    needsClarification: !!drop.needsClarification,
    ambiguityType: drop.ambiguityType ?? null,
    clarificationQuestion: drop.clarificationQuestion ?? null,
    clarificationOptions: (drop.clarificationOptions as unknown[] | null | undefined) ?? null,
  };
  return { ...relation, status: 'pending', classified } as Omit<HeldRelation, 'surface'>;
}

function deviceTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Never rejects: null means file the drop as usual. */
export async function fetchDropRelation(
  text: string,
  timeoutMs: number = RELATE_TIMEOUT_MS,
): Promise<DropRelation | null> {
  const cortexUrl = readCortexUrl();
  if (!cortexUrl || !text?.trim()) return null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const request = (async (): Promise<DropRelation | null> => {
    try {
      const sessionToken = await getSessionToken();
      if (!sessionToken) return null;
      const res = await fetch(cortexUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({
          type: 'minddrop-relate',
          text,
          currentDate: dateService.today(),
          timezone: deviceTimezone(),
        }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json?.enabled ? parseRelation(json.relation) : null;
    } catch (err) {
      console.log('[DropRelation] request failed, filing as usual', { error: String(err) });
      return null;
    }
  })();

  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, timeoutMs);
  });
  const result = await Promise.race([request, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

/** The kind of item a drop was saved as. */
export type DropItemKind = 'todo' | 'habit' | 'note';

type HeldItem = {
  kind: DropItemKind;
  item: { id: string; views?: unknown; archived?: boolean | null } & Record<string, unknown>;
  rel: HeldRelation;
};

/** The drop carrying the relation, among todos, habits and notes (by id or drop id). */
export function heldItem(id: string): HeldItem | null {
  const s = useGremlyStore.getState();
  const match = (x: { id: string; drop_id?: string | null }) => x.id === id || x.drop_id === id;
  const lists: Array<[DropItemKind, ReadonlyArray<any>]> = [
    ['todo', s.todos || []],
    ['habit', s.habits || []],
    ['note', s.notes || []],
  ];
  for (const [kind, list] of lists) {
    const item = list.find(match);
    if (!item) continue;
    const rel = relationOf(item.views);
    return rel ? { kind, item, rel } : null;
  }
  return null;
}

/**
 * Change the drop's answer, on its row as the database holds it and in turn
 * with the pipeline's own updates to it (dropSync.updateDropRow), so a settle
 * that read the row a moment before cannot put the question back. Resolves to
 * whether it was written.
 */
async function setRelation(id: string, patch: Partial<HeldRelation>): Promise<boolean> {
  const held = heldItem(id);
  if (!held) return false;
  return updateDropRow(held.kind, held.item.id, 'relation_answer', (row) => {
    const views = (row.views as Record<string, unknown>) || {};
    const rel = relationOf(views);
    if (!rel) return null;
    return { views: { ...views, relation: { ...rel, ...patch } } };
  });
}

async function archiveDrop(kind: DropItemKind, id: string): Promise<void> {
  const s = useGremlyStore.getState();
  if (kind === 'todo') await s.archiveTodo(id, 'minddrop_relation');
  else if (kind === 'habit') await s.archiveHabit(id, 'minddrop_relation');
  else await s.archiveNote(id, 'minddrop_relation');
}

async function restoreDrop(kind: DropItemKind, id: string): Promise<void> {
  const s = useGremlyStore.getState();
  if (kind === 'todo') await s.restoreTodo(id);
  else if (kind === 'habit') await s.restoreHabit(id);
  else await s.restoreNote(id);
}

/**
 * The item as it is now, or why it can no longer take the change (ticked off,
 * cleared or deleted since the drop).
 */
export function currentEntity(e: RelationEntity): {
  entity: RelationEntity | null;
  gone: string | null;
} {
  const s = useGremlyStore.getState();
  if (e.type === 'todo') {
    const t = s.todos.find((x) => x.id === e.id) as any;
    if (!t || t.archived) return { entity: null, gone: 'That one is no longer on your list.' };
    if (t.completed_at) return { entity: null, gone: 'That one is already done.' };
    return {
      entity: {
        ...e,
        title: t.name || t.title || e.title,
        due_day: t.due_day ?? null,
        due_time: t.due_time ? String(t.due_time).slice(0, 5) : null,
        space_id: t.space_id ?? e.space_id ?? null,
      },
      gone: null,
    };
  }
  if (e.type === 'habit') {
    const h = s.habits.find((x) => x.id === e.id) as any;
    if (!h || h.archived || h.archived_at) {
      return { entity: null, gone: 'That habit is no longer on your list.' };
    }
    // the days logged as the store has them now, so a day they logged by
    // hand since the drop is not logged again (or removed by an Undo)
    const logged = (s.habitProgress || [])
      .filter((p: { habit_id: string }) => p.habit_id === e.id)
      .map((p: { occurred_day: string }) => p.occurred_day);
    return {
      entity: {
        ...e,
        title: h.name || h.title || e.title,
        frequency: h.frequency ?? e.frequency ?? null,
        space_id: h.space_id ?? e.space_id ?? null,
        habit_kind: h.subtype === 'break_habit' ? 'break' : (e.habit_kind ?? 'build'),
        logged_days: [...new Set([...(e.logged_days || []), ...logged])],
      },
      gone: null,
    };
  }
  const n = s.notes.find((x) => x.id === e.id) as any;
  if (!n || n.archived) return { entity: null, gone: 'That one is no longer on your list.' };
  const day = n.target_date ?? n.views?.target_date ?? null;
  const time = n.event_time ?? n.views?.event_time ?? null;
  return {
    entity: {
      ...e,
      title: n.title || e.title,
      due_day: day,
      target_date: day,
      due_time: time ? String(time).slice(0, 5) : null,
      space_id: n.space_id ?? e.space_id ?? null,
    },
    gone: null,
  };
}

/** Which icon the toast shows, by what happened. */
export type RelationToastIcon =
  | 'moved'
  | 'renamed'
  | 'repeat'
  | 'added'
  | 'done'
  | 'logged'
  | 'kept'
  | 'removed';

/** The toast after a yes: what happened to the item, and to the drop. */
export interface RelationToastWords {
  icon: RelationToastIcon;
  title: string;
  detail: string | null;
}

export interface RelationOutcome {
  /** plain words for the closing line */
  summary: string;
  /** one or two words for the moment of confirmation in the popup */
  confirm: string;
  /** the toast shown once the popup has closed */
  toast: RelationToastWords;
  /** the item that was changed (Sweep drops any earlier decision on it) */
  targetId: string;
  /** what kind of item it is, so the toast can open it */
  targetType: RelationEntity['type'];
  /** put everything back, and the question back on the drop */
  undo: () => Promise<void>;
}

const named = (title: string, n = 34) =>
  `“${title.length > n ? `${title.slice(0, n - 1).trimEnd()}…` : title}”`;

/** "today" and "tomorrow" read as words in a sentence; other days stay as they are. */
const dayWords = (day: string) => {
  const d = formatDay(day);
  return d === 'Today' || d === 'Tomorrow' ? d.toLowerCase() : d;
};

/** What the confirmation and the toast say, by what happened. */
export function outcomeWords(
  rel: HeldRelation,
  entity: RelationEntity,
  change: RelationChange | null,
  extraAdded: boolean,
  keptDrop: boolean,
  dropKind: DropItemKind = 'note',
): { confirm: string; toast: RelationToastWords } {
  const t = named(entity.title);
  // the kind the drop was saved as, as its card names it (final check item 19)
  const keptAs = dropKind === 'note' ? kindWordOf('log', rel.classified.subtype) : dropKind;
  const detail = !keptDrop
    ? 'Drop archived'
    : keptAs === 'journal'
      ? 'Your journal entry stays'
      : `Your drop stays as ${keptAs === 'event' || keptAs === 'idea' ? 'an' : 'a'} ${keptAs}`;
  if (rel.intent === 'same') {
    // the prototype's toast: Kept one · Drop archived
    return {
      confirm: 'Kept one',
      toast: {
        icon: 'kept',
        title: extraAdded ? 'Kept one, with the new detail' : 'Kept one',
        detail,
      },
    };
  }
  if (rel.intent === 'remove') {
    return { confirm: 'Removed', toast: { icon: 'removed', title: `Removed ${t}`, detail } };
  }
  switch (change?.field) {
    case 'due_day': {
      const time = change.time_to ?? entity.due_time ?? null;
      const when = [dayWords(change.to), time ? formatTime(time) : ''].filter(Boolean).join(', ');
      return { confirm: 'Moved', toast: { icon: 'moved', title: `Moved ${t} to ${when}`, detail } };
    }
    case 'due_time':
      return {
        confirm: 'Moved',
        toast: { icon: 'moved', title: `Moved ${t} to ${formatTime(change.to)}`, detail },
      };
    case 'name':
      return {
        confirm: 'Renamed',
        toast: { icon: 'renamed', title: `Renamed to ${named(change.to)}`, detail },
      };
    case 'frequency':
      return {
        confirm: 'Updated',
        toast: { icon: 'repeat', title: `${t} is now ${change.to}`, detail },
      };
    case 'body_add':
      return { confirm: 'Added', toast: { icon: 'added', title: `Added to ${t}`, detail } };
    case 'completed':
      return { confirm: 'Done', toast: { icon: 'done', title: `Marked ${t} done`, detail } };
    case 'logged':
      return {
        confirm: 'Logged',
        toast: { icon: 'logged', title: `Logged ${t} for ${dayWords(change.to)}`, detail },
      };
    default:
      return { confirm: 'Done', toast: { icon: 'done', title: `Updated ${t}`, detail } };
  }
}

/**
 * The cards that leave the list after a yes, known before it is applied so
 * the list can let them slide away rather than vanish: the drop (unless it is
 * a journal entry that stays), and the item when it was ticked off or removed.
 */
export function leavingCardIds(dropId: string, picked?: RelationEntity): string[] {
  const held = heldItem(dropId);
  if (!held) return [];
  const { item, rel } = held;
  const ids = keepsDropAfterYes(rel) ? [] : [item.id];
  const target = picked ?? (rel.kind === 'choose' ? null : rel.entity);
  if (target && (rel.intent === 'remove' || rel.intent === 'complete')) ids.push(target.id);
  return ids;
}

async function removeItem(e: RelationEntity): Promise<() => Promise<void>> {
  const s = useGremlyStore.getState();
  if (e.type === 'todo') {
    await s.archiveTodo(e.id, 'minddrop_relation');
    return () => useGremlyStore.getState().restoreTodo(e.id);
  }
  if (e.type === 'habit') {
    await s.archiveHabit(e.id, 'minddrop_relation');
    return () => useGremlyStore.getState().restoreHabit(e.id);
  }
  await s.archiveNote(e.id, 'minddrop_relation');
  return () => useGremlyStore.getState().restoreNote(e.id);
}

/** Drops being applied right now, so a double tap cannot apply twice. */
const inFlight = new Set<string>();

/**
 * The change this relation makes to `entity` as it is now: checked again at
 * the tap, so a value it already has, or a day already logged, asks nothing.
 */
export function changeNow(rel: HeldRelation, entity: RelationEntity): RelationChange | null {
  if (rel.intent === 'same' || rel.intent === 'remove') return null;
  return changeForEntity(rel.intent, entity, rawChangeOf(rel), dateService.today());
}

/**
 * The user said yes. `picked` is the item they chose when it was not the one
 * first shown (a which-one list, or "Not that one"). Throws with words for the
 * popup when the item has gone or there is nothing to change on it; nothing is
 * left half done.
 */
export async function applyDropRelation(
  dropId: string,
  picked?: RelationEntity,
): Promise<RelationOutcome> {
  if (inFlight.has(dropId)) throw new PlainError('Already on it.');
  inFlight.add(dropId);
  try {
    return await applyOnce(dropId, picked);
  } finally {
    inFlight.delete(dropId);
  }
}

async function applyOnce(dropId: string, picked?: RelationEntity): Promise<RelationOutcome> {
  const held = heldItem(dropId);
  if (!held || held.rel.status !== 'pending')
    throw new PlainError('This one has already been sorted.');
  const { item: drop, rel, kind: dropKind } = held;
  const target = picked ?? (rel.kind === 'choose' ? null : rel.entity);
  if (!target) throw new PlainError('Pick the one you meant.');
  const now = currentEntity(target);
  if (!now.entity) throw new PlainError(now.gone || 'That one is no longer on your list.');
  const entity = now.entity;

  let summary: string;
  let revert: () => Promise<void>;
  let madeChange: RelationChange | null = null;
  let extraAdded = false;

  if (rel.intent === 'same') {
    const extra = rel.kind === 'same' ? rel.extra : rel.kind === 'choose' ? rel.value : null;
    if (extra && entity.type !== 'habit') {
      const applied = await applyEntityChange(
        entity,
        { field: 'body_add', from: null, to: extra },
        FROM_MINDDROP,
      );
      summary = `Kept ${entity.title}, with the new detail added.`;
      revert = applied.revert;
      extraAdded = true;
    } else {
      summary = `Kept ${entity.title}.`;
      revert = async () => {};
    }
  } else if (rel.intent === 'remove') {
    revert = await removeItem(entity);
    summary = `Removed ${entity.title}.`;
  } else {
    const change = changeNow(rel, entity);
    if (!change) {
      throw new PlainError(
        rel.intent === 'logged'
          ? 'That day is already logged.'
          : 'There is nothing to change on that one.',
      );
    }
    const applied = await applyEntityChange(entity, change, FROM_MINDDROP);
    summary = applied.summary;
    revert = applied.revert;
    madeChange = change;
    // a new day that came with a new time: the time moves too
    if (change.field === 'due_day' && change.time_to) {
      try {
        const timed = await applyEntityChange(
          applied.entity,
          { field: 'due_time', from: change.time_from ?? null, to: change.time_to },
          { ...FROM_MINDDROP, sameChange: true },
        );
        summary = timed.summary;
        const revertDay = applied.revert;
        revert = async () => {
          await timed.revert();
          await revertDay();
        };
      } catch (err) {
        await applied.revert();
        throw err;
      }
    }
  }

  // The drop itself: a journal entry stays as their entry; otherwise it was
  // only the ask, and goes. If that cannot be saved, the change is put back,
  // so a second yes cannot apply it twice.
  const keepDrop = keepsDropAfterYes(rel);
  try {
    const appliedTo = { id: entity.id, type: entity.type, title: entity.title };
    if (!(await setRelation(drop.id, { status: 'applied', summary, applied_to: appliedTo }))) {
      throw new Error('the drop is no longer there');
    }
    if (!keepDrop) await archiveDrop(dropKind, drop.id);
  } catch (err) {
    console.warn('[DropRelation] could not clear the drop, putting the change back', {
      error: String(err),
    });
    await revert().catch(() => {});
    await setRelation(drop.id, { status: 'pending', summary: null, applied_to: null }).catch(
      () => {},
    );
    throw new PlainError(DIDNT_GO);
  }

  return {
    summary,
    ...outcomeWords(rel, entity, madeChange, extraAdded, keepDrop, dropKind),
    targetId: entity.id,
    targetType: entity.type,
    undo: async () => {
      await revert();
      if (!keepDrop) await restoreDrop(dropKind, drop.id);
      await setRelation(drop.id, { status: 'pending', summary: null, applied_to: null });
    },
  };
}

function keepLabel(c: RelationClassified): string {
  if (c.bucket === 'habit') {
    return c.habitSubtype === 'break_habit'
      ? 'It is a habit I want to cut back'
      : 'It is a habit I want to build';
  }
  return 'It is something I need to do';
}

/**
 * Not the same, not that one, or let go: leave their items alone. A drop saved
 * by the rethink is already its own kind, so only the answer is marked
 * (`status`: kept, or lapsed when it was never answered). A drop an older
 * build held as a note is filed exactly as it was classified, and one that was
 * unclear gets its question back instead. Returns what happened, for Sweep:
 * 'clarify' when the drop now has a question of its own to ask.
 */
export async function keepDropAsNew(
  dropId: string,
  status: Extract<RelationStatus, 'kept' | 'lapsed'> = 'kept',
): Promise<'kept' | 'clarify'> {
  const held = heldItem(dropId);
  if (!held || held.rel.status !== 'pending') return 'kept';
  if (!keepsHeldNote(held.rel) || held.kind !== 'note') {
    // already its own kind: only the answer is marked, on the row as it is now
    let asks = false;
    await updateDropRow(held.kind, held.item.id, `relation_${status}`, (row) => {
      const views = (row.views as Record<string, unknown>) || {};
      const rel = relationOf(views);
      asks =
        (row.needs_clarification === true || views.needs_clarification === true) &&
        row.clarification_resolved !== true &&
        views.clarification_resolved !== true;
      if (!rel || rel.status !== 'pending') return null;
      return { views: { ...views, relation: { ...rel, status } } };
    });
    return asks ? 'clarify' : 'kept';
  }
  const { item: note, rel } = held;
  const c = rel.classified;
  const store = useGremlyStore.getState();
  const views = {
    ...((note.views as Record<string, unknown>) || {}),
    relation: { ...rel, status },
  };
  type NoteUpdate = Parameters<typeof store.updateNote>[1];

  if (
    c.needsClarification &&
    hasUsableClarification(c.clarificationQuestion, c.clarificationOptions)
  ) {
    const clarification = {
      needs_clarification: true,
      clarification_question: c.clarificationQuestion,
      clarification_options: c.clarificationOptions,
      clarification_resolved: false,
    };
    await store.updateNote(note.id, {
      ...clarification,
      views: { ...views, ...clarification, ambiguity_type: c.ambiguityType },
    } as unknown as NoteUpdate);
    return 'clarify';
  }

  if (c.bucket === 'log') {
    await store.updateNote(note.id, { views } as unknown as NoteUpdate);
    return 'kept';
  }

  // A todo or a habit: the note becomes that item through the step a
  // clarification answer uses, which also gives it its title and dates.
  const keep = {
    id: RELATION_KEEP_OPTION,
    label: keepLabel(c),
    action: { bucket: c.bucket, subtype: c.subtype, habitSubtype: c.habitSubtype },
  };
  await store.updateNote(note.id, {
    clarification_options: [keep],
    views: { ...views, clarification_options: [keep] },
  } as unknown as NoteUpdate);
  // The card shows its working state while this runs; the popup does not
  // wait. If the note is still there as a note afterwards, the question goes
  // back on it so nothing is lost.
  const putBack = () => {
    const after = useGremlyStore.getState().notes.find((n) => n.id === note.id);
    if (after && !after.archived) setRelation(note.id, { status: 'pending' }).catch(() => {});
  };
  useGremlyStore
    .getState()
    .resolveEntityClarification(note.id, RELATION_KEEP_OPTION, false, null)
    .then(putBack, putBack);
  return 'kept';
}
