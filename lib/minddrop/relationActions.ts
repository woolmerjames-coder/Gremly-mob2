/**
 * relationActions.ts: asking, and acting on, "is this drop about something
 * you already have?" (types and words in dropRelation.ts).
 *
 * - fetchDropRelation: the Worker's answer, or null (off, slow, unsure, failed).
 * - holdDropForRelation: the drop is filed as a note that carries the question,
 *   so no new todo or habit appears before the user decides.
 * - applyDropRelation: the user said yes. The change goes through the chat
 *   card's own applyEntityChange (lib/chat/entityCards.ts), so sync, rollback
 *   and Undo behave the same in both places.
 * - keepDropAsNew: the user said no, or skipped. The drop is filed exactly as
 *   it was classified, through the same step a clarification answer uses.
 *
 * Nothing here runs without a tap except the fetch and the hold.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { applyEntityChange } from '../chat/entityCards';
import { getSessionToken } from '../cortex/getSessionToken';
import { dateService } from '../date/DateService';
import { env, getEnv } from '../env';
import type { QueuedDrop } from './dropQueue';
import { hasUsableClarification } from './clarification';
import {
  changeForEntity,
  keepsDropAfterYes,
  parseRelation,
  rawChangeOf,
  relationOf,
  type DropRelation,
  type HeldRelation,
  type RelationChange,
  type RelationClassified,
  type RelationEntity,
} from './dropRelation';

/** The Worker gives the model 6s; this covers that plus reading the list. */
export const RELATE_TIMEOUT_MS = 7000;
/** Hidden answer used to file a held drop as it was classified. */
export const RELATION_KEEP_OPTION = 'relation_keep';

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

/**
 * Hold the drop while it waits: it syncs as a note carrying the question and
 * how it was classified. A note drop keeps its kind (an event stays an event);
 * a todo or habit waits as a plain note, so nothing new appears in their lists
 * before they answer.
 */
export function holdDropForRelation(drop: QueuedDrop, relation: DropRelation): QueuedDrop {
  const classified: RelationClassified = {
    bucket: (drop.bucket as RelationClassified['bucket']) || 'log',
    subtype: drop.subtype ?? null,
    habitSubtype: drop.habitSubtype ?? null,
    needsClarification: !!drop.needsClarification,
    ambiguityType: drop.ambiguityType ?? null,
    clarificationQuestion: drop.clarificationQuestion ?? null,
    clarificationOptions: (drop.clarificationOptions as unknown[] | null | undefined) ?? null,
  };
  return {
    ...drop,
    bucket: 'log',
    subtype: drop.bucket === 'log' ? (drop.subtype ?? 'general') : 'general',
    habitSubtype: null,
    needsClarification: false,
    ambiguityType: null,
    clarificationQuestion: null,
    clarificationOptions: null,
    relation: { ...relation, status: 'pending', classified } as HeldRelation,
  };
}

function heldNote(noteId: string) {
  const note = useGremlyStore
    .getState()
    .notes.find((n) => n.id === noteId || (n as { drop_id?: string }).drop_id === noteId);
  const rel = note ? relationOf(note.views) : null;
  return note && rel ? { note, rel } : null;
}

async function setRelation(noteId: string, patch: Partial<HeldRelation>): Promise<void> {
  const store = useGremlyStore.getState();
  const note = store.notes.find((n) => n.id === noteId);
  const rel = note ? relationOf(note.views) : null;
  if (!note || !rel) return;
  const views = { ...((note.views as Record<string, unknown>) || {}) };
  await store.updateNote(note.id, {
    views: { ...views, relation: { ...rel, ...patch } },
  } as Parameters<typeof store.updateNote>[1]);
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

export interface RelationOutcome {
  /** plain words for the closing line */
  summary: string;
  /** the item that was changed (Sweep drops any earlier decision on it) */
  targetId: string;
  /** put everything back, and the question back on the drop */
  undo: () => Promise<void>;
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
  noteId: string,
  picked?: RelationEntity,
): Promise<RelationOutcome> {
  if (inFlight.has(noteId)) throw new Error('Already on it.');
  inFlight.add(noteId);
  try {
    return await applyOnce(noteId, picked);
  } finally {
    inFlight.delete(noteId);
  }
}

async function applyOnce(noteId: string, picked?: RelationEntity): Promise<RelationOutcome> {
  const held = heldNote(noteId);
  if (!held || held.rel.status !== 'pending') throw new Error('This one has already been sorted.');
  const { note, rel } = held;
  const target = picked ?? (rel.kind === 'choose' ? null : rel.entity);
  if (!target) throw new Error('Pick the one you meant.');
  const now = currentEntity(target);
  if (!now.entity) throw new Error(now.gone || 'That one is no longer on your list.');
  const entity = now.entity;

  let summary: string;
  let revert: () => Promise<void>;

  if (rel.intent === 'same') {
    const extra = rel.kind === 'same' ? rel.extra : rel.kind === 'choose' ? rel.value : null;
    if (extra && entity.type !== 'habit') {
      const applied = await applyEntityChange(entity, { field: 'body_add', from: null, to: extra });
      summary = `Kept ${entity.title}, with the new detail added.`;
      revert = applied.revert;
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
      throw new Error(
        rel.intent === 'logged'
          ? 'That day is already logged.'
          : 'There is nothing to change on that one.',
      );
    }
    const applied = await applyEntityChange(entity, change);
    summary = applied.summary;
    revert = applied.revert;
    // a new day that came with a new time: the time moves too
    if (change.field === 'due_day' && change.time_to) {
      try {
        const timed = await applyEntityChange(applied.entity, {
          field: 'due_time',
          from: change.time_from ?? null,
          to: change.time_to,
        });
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
    await setRelation(note.id, { status: 'applied', summary });
    if (!keepDrop) await useGremlyStore.getState().archiveNote(note.id, 'minddrop_relation');
  } catch (err) {
    console.warn('[DropRelation] could not clear the drop, putting the change back', {
      error: String(err),
    });
    await revert().catch(() => {});
    await setRelation(note.id, { status: 'pending', summary: null }).catch(() => {});
    throw new Error('That did not go through. Try again in a moment.');
  }

  return {
    summary,
    targetId: entity.id,
    undo: async () => {
      await revert();
      if (!keepDrop) await useGremlyStore.getState().restoreNote(note.id);
      await setRelation(note.id, { status: 'pending', summary: null });
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
 * Not the same, not that one, or skipped: file the drop exactly as it was
 * classified and leave their items alone. A drop that was unclear gets its
 * question back instead. Returns what happened, for Sweep.
 */
export async function keepDropAsNew(noteId: string): Promise<'kept' | 'clarify'> {
  const held = heldNote(noteId);
  if (!held || held.rel.status !== 'pending') return 'kept';
  const { note, rel } = held;
  const c = rel.classified;
  const store = useGremlyStore.getState();
  const views = {
    ...((note.views as Record<string, unknown>) || {}),
    relation: { ...rel, status: 'kept' },
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
