/**
 * dropSync.ts: writes a Mind Drop to Supabase as a todo, habit or note.
 *
 * From the Mind Drop rethink (stage 4, 9 Oct 2026) a drop is saved the moment
 * it is sorted, as its kind (or as its pieces for a clear split), and the rest
 * lands on the saved row as it arrives: the details (Phase 2), the title and
 * reaction when the title call is slower than the sort, the writer's words for
 * a question, and the already have it answer. Every update to one row waits for
 * the one before it and merges into the row as the store has it then, so no
 * update writes over another.
 *
 * Used by: dropPhases.ts.
 */

import type { MultiSegment, QueuedDrop } from './dropQueue';
import type { HeldRelation } from './dropRelation';
import type { LogSubtype, MindDropBucket } from './types';
import type { HabitSubtype } from '../types';
import { useGremlyStore } from '../store/useGremlyStore';
import { supabase } from '../supabase/client';
import { dateService, nowTimestamp } from '../date/DateService';
import { parseFrequencyString } from '../habits/frequencyUtils';
import { calculateBuffers } from '../planning';
import { eventBus } from '../events/EventBus';
import { wordsAsTitle } from '../../workers/shared/titles';

/** Phase 2 enrichment result (metadata fields only) */
export interface Phase2MetadataResult {
  tags: string[];
  time_estimate_minutes: number | null;
  time_window: 'morning' | 'day' | 'evening' | null;
  extracted_date: string | null;
  extracted_start_date: string | null;
  extracted_frequency: string | null;
  extracted_days: number[] | null;
  people: string[];
  mood: string[] | null;
  energy_type: 'deep_focus' | 'administrative' | 'physical' | 'social' | 'quick' | null;
  priority_kind: 'action' | 'blocker' | 'waiting' | 'decision' | 'momentum' | null;
  target_date: string | null;
  scheduled_date: string | null;
  event_time: string | null;
  date_type_ambiguous: boolean;
  end_date: string | null;
  smart_title: string | null;
  dateConfidence: 'verified' | 'llm_only' | 'chrono_override' | null;
}

export type DropEntityType = 'todo' | 'habit' | 'note';

export interface SyncResult {
  success: boolean;
  supabaseId?: string;
  entityType?: DropEntityType;
  error?: Error;
  /** The row as the database holds it after the save */
  row?: Record<string, any>;
  /** An earlier try had saved it already: this is that row, not this try's */
  duplicate?: boolean;
}

/** Where a drop was saved. */
export interface SavedDropRow {
  entityType: DropEntityType;
  id: string;
}

/** What a drop is saved as. */
export interface DropKind {
  bucket: MindDropBucket;
  subtype: LogSubtype | null;
  habitSubtype: HabitSubtype | null;
}

/** The card's stage, kept in views.minddrop_stage. */
export type DropRowStage = 'saved' | 'settled';

/** A question on the saved item, as the clarify strip reads it. */
export interface DropRowQuestion {
  needsClarification: boolean;
  ambiguityType: string | null;
  question: string | null;
  options: unknown[] | null;
}

export interface BuildDropRowOptions {
  /** saved: the details are still to come. settled: the card is done. */
  stage: DropRowStage;
  /** The title to save; the title call's, or the drop's own words while it is out. */
  title?: string;
  /** What to save the drop as, when it is not the drop's own kind (an unsure split). */
  kind?: DropKind;
  /** The question to save, when it is not the drop's own (a piece of a split). */
  question?: DropRowQuestion;
  /** The drop id to save under; a piece of a split has its own. */
  dropId?: string;
  /** The words to save; a piece of a split has its own. */
  text?: string;
  /** More in views: the already have it answer, the split, the piece's group. */
  extraViews?: Record<string, unknown>;
}

/** The kind of a drop as the card names it (Mind Drop rethink stage 5). */
export function kindWordOf(
  bucket: string | null | undefined,
  subtype: string | null | undefined,
): 'todo' | 'habit' | 'event' | 'journal' | 'idea' | 'note' {
  if (bucket === 'todo') return 'todo';
  if (bucket === 'habit') return 'habit';
  if (subtype === 'event' || subtype === 'journal' || subtype === 'idea') return subtype;
  return 'note';
}

/** The drop id of a piece of a split; never reused, as drop_id is unique per owner. */
export function pieceDropId(localId: string, index: number): string {
  return `split-${localId}-${index}`;
}

function entityTypeOf(bucket: MindDropBucket): { table: string; entityType: DropEntityType } {
  if (bucket === 'todo') return { table: 'todos', entityType: 'todo' };
  if (bucket === 'habit') return { table: 'habits', entityType: 'habit' };
  return { table: 'notes', entityType: 'note' };
}

function noteSubtypeOf(subtype: string | null | undefined): string {
  return subtype === 'event' || subtype === 'journal' || subtype === 'idea' ? subtype : 'catchall';
}

/**
 * A drop saved with a question (unclear, an unsure split, or an already have
 * it answer that came before the save) records the day it asked and that the
 * card asks it (Mind Drop rethink stage 6, lib/minddrop/asks.ts).
 */
function withAskDay(views: Record<string, unknown>): Record<string, unknown> {
  const relation = views.relation as { status?: string } | null | undefined;
  const split = views.split as { status?: string } | null | undefined;
  const asks =
    views.needs_clarification === true ||
    split?.status === 'pending' ||
    relation?.status === 'pending';
  if (!asks || views.ask_since) return views;
  return { ...views, ask_since: dateService.today(), ask_on_card: true };
}

/**
 * The row for a drop, as the insert writes it. With `enrichment` null the
 * detail columns hold what they hold before the details come; the same
 * function with the details gives the values `updateDropDetails` writes.
 */
export function buildDropRow(
  drop: QueuedDrop,
  enrichment: Phase2MetadataResult | null,
  opts: BuildDropRowOptions,
): { table: string; entityType: DropEntityType; payload: Record<string, unknown> } | null {
  const userId = useGremlyStore.getState().userId;
  const kind: DropKind | null = opts.kind
    ? opts.kind
    : drop.bucket
      ? {
          bucket: drop.bucket,
          subtype: drop.subtype ?? null,
          habitSubtype: drop.habitSubtype ?? null,
        }
      : null;
  if (!userId || !kind) return null;

  const { source, spaceId } = drop;
  const text = opts.text ?? drop.text;
  const title = opts.title ?? drop.smartTitle ?? wordsAsTitle(text);
  const dropId = opts.dropId ?? drop.localId;
  const question: DropRowQuestion = opts.question ?? {
    needsClarification: !!drop.needsClarification,
    ambiguityType: drop.ambiguityType ?? null,
    question: drop.clarificationQuestion ?? null,
    options: (drop.clarificationOptions as unknown[] | null | undefined) ?? null,
  };
  const now = nowTimestamp();
  // When the caller gives a day (e.g. "Plan tomorrow"), quick adds from Today go there
  const effectiveDueDay = drop.dueDayOverride || dateService.today();
  const origin = source === 'space' ? 'space_chat' : 'catchall';

  const hasAIDates = !!(
    enrichment?.target_date ||
    enrichment?.scheduled_date ||
    enrichment?.extracted_date ||
    enrichment?.extracted_start_date ||
    enrichment?.end_date
  );

  const questionColumns = {
    needs_clarification: question.needsClarification,
    clarification_type: drop.clarificationType || null,
    clarification_question: question.needsClarification ? question.question : null,
    clarification_options: question.needsClarification ? question.options : null,
    clarification_resolved: false,
  };
  const commonViews = {
    minddrop_stage: opts.stage,
    ai_pending: false,
    confirmation_message: drop.confirmationMessage ?? null,
    people: enrichment?.people?.length ? enrichment.people : undefined,
    ...questionColumns,
    ambiguity_type: question.needsClarification ? question.ambiguityType : null,
    classify_engine: drop.classifyEngine || null,
    ai_degraded: drop.classificationDegraded || false,
    classification_source: drop.classificationSource || 'unknown',
    // the classifier heard a remind me: the reminder call runs for this item
    // after a question is answered, and for each piece of a split (final check item 5)
    ...(drop.reminderIntent === true ? { reminder_intent: true } : {}),
  };
  const dateViews = {
    target_date: enrichment?.target_date || null,
    scheduled_date: enrichment?.scheduled_date || null,
    event_time: enrichment?.event_time || null,
    date_type_ambiguous: enrichment?.date_type_ambiguous || false,
  };
  const dateCheck = {
    captured_at: hasAIDates ? now : null,
    date_confidence: hasAIDates ? enrichment?.dateConfidence || null : null,
  };
  const { table, entityType } = entityTypeOf(kind.bucket);

  if (entityType === 'todo') {
    // The day to do it comes only from a day they said they would do it (or the
    // day they dropped it into). A deadline is saved as target_date and leaves
    // the day for them to pick: the card reads Due, and the morning quick sweep
    // asks when (James, 9 Oct 2026).
    const dueDay =
      enrichment?.scheduled_date ||
      enrichment?.extracted_date?.split('T')[0] ||
      (source === 'today' ? effectiveDueDay : null);
    const buffers = calculateBuffers(
      enrichment?.energy_type ?? null,
      title,
      enrichment?.time_estimate_minutes ?? 30,
    );
    return {
      table,
      entityType,
      payload: {
        owner_id: userId,
        // the moment of the tap, so the card keeps its place once saved
        created_at: drop.createdAt,
        name: title,
        body: text,
        space_id: spaceId,
        drop_id: dropId,
        origin,
        tags: enrichment?.tags || [],
        time_estimate_minutes: enrichment?.time_estimate_minutes || null,
        time_window: enrichment?.time_window || null,
        energy_type: enrichment?.energy_type || 'administrative',
        priority_kind: enrichment?.priority_kind ?? null,
        priority_kind_source: enrichment?.priority_kind ? 'classifier' : null,
        priority_kind_updated_at: enrichment?.priority_kind ? now : null,
        prep_buffer_minutes: buffers.prep_buffer_minutes,
        cooldown_buffer_minutes: buffers.cooldown_buffer_minutes,
        due_day: dueDay,
        due_date: dueDay,
        due_time: enrichment?.event_time || null,
        target_date: enrichment?.target_date || null,
        scheduled_date: enrichment?.scheduled_date || null,
        ...dateCheck,
        ...questionColumns,
        views: withAskDay({ ...commonViews, ...dateViews, ...(opts.extraViews || {}) }),
        updated_at: now,
      },
    };
  }

  if (entityType === 'habit') {
    const freq = enrichment?.extracted_frequency
      ? parseFrequencyString(enrichment.extracted_frequency)
      : { cadence: 'daily' as const, target_per_period: 1 };
    const buffers = calculateBuffers(
      enrichment?.energy_type ?? null,
      title,
      enrichment?.time_estimate_minutes ?? 30,
    );
    return {
      table,
      entityType,
      payload: {
        owner_id: userId,
        // the moment of the tap, so the card keeps its place once saved
        created_at: drop.createdAt,
        name: title,
        title,
        notes: text,
        space_id: spaceId,
        drop_id: dropId,
        origin,
        subtype: kind.habitSubtype || 'start_habit',
        frequency: enrichment?.extracted_frequency || 'daily',
        cadence: freq.cadence,
        target_per_period: freq.target_per_period,
        days_active: enrichment?.extracted_days || null,
        start_date:
          enrichment?.extracted_start_date || (source === 'today' ? effectiveDueDay : null),
        time_window: enrichment?.time_window || 'day', // NOT NULL in the table
        time_estimate_minutes: enrichment?.time_estimate_minutes || null,
        energy_type: enrichment?.energy_type || 'administrative',
        prep_buffer_minutes: buffers.prep_buffer_minutes,
        cooldown_buffer_minutes: buffers.cooldown_buffer_minutes,
        tags: enrichment?.tags || [],
        ...dateCheck,
        ...questionColumns,
        views: withAskDay({ ...commonViews, ...(opts.extraViews || {}) }),
        updated_at: now,
      },
    };
  }

  // A note: every kind keeps the title call's title, events included (James, 9 Oct 2026)
  return {
    table,
    entityType,
    payload: {
      owner_id: userId,
      // the moment of the tap, so the card keeps its place once saved
      created_at: drop.createdAt,
      title,
      body: text,
      subtype: noteSubtypeOf(kind.subtype),
      space_id: spaceId,
      drop_id: dropId,
      origin,
      tags: enrichment?.tags || [],
      mood: enrichment?.mood || null,
      target_date: enrichment?.target_date || null,
      end_date: enrichment?.end_date || null,
      event_time: enrichment?.event_time || null,
      is_goal: false,
      ...dateCheck,
      ...questionColumns,
      views: withAskDay({ ...commonViews, ...dateViews, ...(opts.extraViews || {}) }),
      updated_at: now,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Insert
// ──────────────────────────────────────────────────────────────────────────────

function storeKeyOf(entityType: DropEntityType): 'todos' | 'habits' | 'notes' {
  return entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
}

function putInStore(entityType: DropEntityType, row: Record<string, any>): void {
  const key = storeKeyOf(entityType);
  const item = { ...row, type: entityType, reminders: row.reminders_json ?? [] };
  useGremlyStore.setState((state: any) => {
    const list = (state[key] as any[]) || [];
    return list.some((x) => x.id === row.id)
      ? { [key]: list.map((x) => (x.id === row.id ? { ...x, ...item } : x)) }
      : { [key]: [...list, item] };
  });
}

async function insertRow(
  table: string,
  entityType: DropEntityType,
  payload: Record<string, unknown>,
  spaceId: string | null,
): Promise<SyncResult> {
  const dropId = payload.drop_id as string;
  const { data, error } = await supabase.from(table).insert(payload).select().single();

  if (error) {
    // The row is there already: an earlier try was saved but the app stopped
    // before the queue moved on. The same drop id returns that row.
    if (error.code === '23505') {
      console.warn('[DropSync] Duplicate drop detected, fetching existing row', { dropId });
      const { data: existing } = await supabase
        .from(table)
        .select('*')
        .eq('owner_id', payload.owner_id as string)
        .eq('drop_id', dropId)
        .single();
      if (existing) {
        const known = (useGremlyStore.getState() as any)[storeKeyOf(entityType)]?.some(
          (x: { id: string }) => x.id === existing.id,
        );
        if (!known && existing.owner_id) {
          putInStore(entityType, existing);
          eventBus.emit('entity:created', {
            entity: { ...existing, type: entityType, drop_id: dropId },
            type: entityType,
            spaceId,
          });
        }
        return {
          success: true,
          supabaseId: existing.id,
          entityType,
          row: existing,
          duplicate: true,
        };
      }
    }
    console.error('[DropSync] Supabase insert failed:', error);
    return { success: false, error };
  }

  console.log('[DropSync] Saved', { dropId, table, supabaseId: data.id });
  putInStore(entityType, data);
  eventBus.emit('entity:created', {
    entity: { ...data, type: entityType, drop_id: dropId },
    type: entityType,
    spaceId,
  });
  return { success: true, supabaseId: data.id, entityType, row: data };
}

/**
 * Save a drop as its kind. `enrichment` is null at the sort (the details come
 * later, through updateDropDetails); a drop an older build had already given
 * its details is saved with them.
 */
export async function syncDropToSupabase(
  drop: QueuedDrop,
  enrichment: Phase2MetadataResult | null,
  opts: BuildDropRowOptions = { stage: 'settled' },
): Promise<SyncResult> {
  if (!useGremlyStore.getState().userId) {
    return { success: false, error: new Error('Not authenticated') };
  }
  if (!opts.kind && !drop.bucket) {
    return { success: false, error: new Error('No bucket classification') };
  }
  try {
    const row = buildDropRow(drop, enrichment, opts);
    if (!row) return { success: false, error: new Error('No bucket classification') };
    if (drop.classificationDegraded) {
      console.warn('[DropSync] Syncing degraded classification', {
        localId: drop.localId,
        bucket: drop.bucket,
        source: drop.classificationSource,
      });
    }
    return await insertRow(row.table, row.entityType, row.payload, drop.spaceId);
  } catch (error) {
    console.error('[DropSync] Sync exception:', error);
    return { success: false, error: error as Error };
  }
}

/** A piece of a clear split, saved as its own item. */
export interface SavedPiece extends SavedDropRow {
  dropId: string;
  index: number;
  text: string;
  title: string;
  bucket: MindDropBucket;
  subtype: LogSubtype | null;
  habitSubtype?: HabitSubtype | null;
  /** the piece asks its own question (saved as a note carrying it, settled as it is) */
  asks?: boolean;
  /** the row as saved, to tell a person's edit apart from the details (stage 7) */
  base?: DropDetailBase;
}

/** A piece's kind; a piece the classifier could not settle is a general note carrying its question. */
export function pieceKindOf(piece: MultiSegment): DropKind {
  if (piece.needsClarification) return { bucket: 'log', subtype: 'general', habitSubtype: null };
  const bucket: MindDropBucket =
    piece.bucket === 'todo' || piece.bucket === 'habit' ? piece.bucket : 'log';
  return {
    bucket,
    subtype: bucket === 'log' ? ((piece.subtype ?? 'general') as LogSubtype) : null,
    habitSubtype:
      bucket === 'habit' ? ((piece.habitSubtype ?? 'start_habit') as HabitSubtype) : null,
  };
}

/** The pieces of a split as views.split keeps them (stage 7 reads them back). */
export function splitPiecesView(pieces: MultiSegment[]): Array<Record<string, unknown>> {
  return pieces.map((p) => {
    const kind = pieceKindOf(p);
    return {
      text: p.text,
      kind: p.needsClarification ? 'question' : kindWordOf(kind.bucket, kind.subtype),
      bucket: kind.bucket,
      subtype: kind.subtype,
      habit_subtype: kind.habitSubtype,
      needs_clarification: !!p.needsClarification,
      ambiguity_type: p.ambiguityType ?? null,
      clarification_question: p.clarificationQuestion ?? null,
      clarification_options: p.clarificationOptions ?? null,
    };
  });
}

/**
 * A split: each piece saved as its own item, in its own words as the title
 * (sentence case), under `split-<localId>-<index>` with views.split_group
 * (the drop's words and what the classifier said, for Keep as one; and, for a Split tapped on a card, when that card was made, so the
 * pieces take its place on the list). A piece is saved sorted, and settles when its own details land
 * (splitActions.fillPieces); a piece that asks is saved settled with its
 * question. Safe to repeat: a piece already saved is found by its drop id.
 * Throws when a piece cannot be saved, so the runner tries again.
 */
export async function insertSplitPieces(
  drop: QueuedDrop,
  opts: { said: 'clear' | 'unsure'; at?: string | null } = { said: 'clear' },
): Promise<SavedPiece[]> {
  const pieces = drop.multiSegments || [];
  const saved: SavedPiece[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const kind = pieceKindOf(piece);
    const dropId = pieceDropId(drop.localId, index);
    const title = wordsAsTitle(piece.text);
    const result = await syncDropToSupabase({ ...drop, confirmationMessage: null }, null, {
      stage: piece.needsClarification ? 'settled' : 'saved',
      title,
      kind,
      dropId,
      text: piece.text,
      question: {
        needsClarification: !!piece.needsClarification,
        ambiguityType: piece.ambiguityType ?? null,
        question: piece.clarificationQuestion ?? null,
        options: (piece.clarificationOptions as unknown[] | null | undefined) ?? null,
      },
      extraViews: {
        split_group: {
          id: drop.localId,
          index,
          count: pieces.length,
          text: drop.text,
          said: opts.said,
          // the classifier's own call, whatever the switch made of it (telemetry)
          classifier_said: drop.splitSaid ?? null,
          // the drop's kind as one item, for Keep as one (null when the classifier gave none)
          as_one: drop.asOne ?? null,
          // a Split on a card later: where the card was, so the pieces take its place
          ...(opts.at ? { at: opts.at } : {}),
        },
      },
    });
    if (!result.success || !result.supabaseId || !result.entityType) {
      throw new Error(result.error?.message || 'A piece of the split could not be saved');
    }
    saved.push({
      entityType: result.entityType,
      id: result.supabaseId,
      dropId,
      index,
      text: piece.text,
      title,
      bucket: kind.bucket,
      subtype: kind.subtype,
      habitSubtype: kind.habitSubtype,
      asks: !!piece.needsClarification,
      base: detailBaseOf(result.entityType, result.row) ?? undefined,
    });
  }
  return saved;
}

// ──────────────────────────────────────────────────────────────────────────────
// Updates to a saved row, one after another
// ──────────────────────────────────────────────────────────────────────────────

const rowChains = new Map<string, Promise<unknown>>();

/** Run `fn` once every earlier update to this row has finished. */
function onRow<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const before = rowChains.get(id) ?? Promise.resolve();
  const run = before.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  rowChains.set(id, tail);
  void tail.then(() => {
    if (rowChains.get(id) === tail) rowChains.delete(id);
  });
  return run;
}

/**
 * The row as the database holds it now. Each update builds on this rather than
 * the store's copy, which a refresh from the server can swap for an older one.
 * Throws when it cannot be read, so the caller sees it (the runner tries again).
 */
async function rowOf(saved: SavedDropRow): Promise<Record<string, any> | null> {
  const table = storeKeyOf(saved.entityType);
  const { data, error } = await supabase.from(table).select('*').eq('id', saved.id).single();
  if (error) {
    if (error.code === 'PGRST116') return null; // no such row: deleted since the save
    throw new Error(`[DropSync] could not read the saved row: ${error.message || error.code}`);
  }
  return data ?? null;
}

async function writeRow(saved: SavedDropRow, patch: Record<string, unknown>): Promise<void> {
  const store = useGremlyStore.getState() as any;
  if (saved.entityType === 'todo') await store.updateTodo(saved.id, patch);
  else if (saved.entityType === 'habit') await store.updateHabit(saved.id, patch);
  else await store.updateNote(saved.id, patch);
}

/**
 * Update a saved row: `build` gets the row as the database holds it now and
 * gives the change, or null for none. Written through the store, so the store
 * and the screens see it too. Resolves to whether anything was written; a row
 * deleted since the save is logged and left.
 */
function updateRow(
  saved: SavedDropRow,
  what: string,
  build: (item: Record<string, any>) => Record<string, unknown> | null,
): Promise<boolean> {
  return onRow(saved.id, async () => {
    const item = await rowOf(saved);
    if (!item) {
      console.warn('[DropSync] the saved item is gone, nothing written', { what, id: saved.id });
      return false;
    }
    const patch = build(item);
    if (!patch) return false;
    await writeRow(saved, patch);
    return true;
  });
}

/**
 * Change a drop's item by a rule, on the row as the database holds it now and
 * in turn with every other update to that row (the settle, late details, late
 * words, the already have it answer), so an answer on the card is never put
 * back by a pipeline write that read the row a moment before (Mind Drop
 * rethink stage 6: Not now, a relation answer, a lapse). Resolves to whether
 * anything was written.
 */
export function updateDropRow(
  entityType: DropEntityType,
  id: string,
  what: string,
  build: (item: Record<string, any>) => Record<string, unknown> | null,
): Promise<boolean> {
  return updateRow({ entityType, id }, what, build);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The columns the details fill, by kind (as the insert writes them). */
const DETAIL_COLUMNS: Record<DropEntityType, string[]> = {
  todo: [
    'tags',
    'time_estimate_minutes',
    'time_window',
    'energy_type',
    'priority_kind',
    'priority_kind_source',
    'priority_kind_updated_at',
    'prep_buffer_minutes',
    'cooldown_buffer_minutes',
    'due_day',
    'due_date',
    'due_time',
    'target_date',
    'scheduled_date',
    'captured_at',
    'date_confidence',
  ],
  habit: [
    'frequency',
    'cadence',
    'target_per_period',
    'days_active',
    'start_date',
    'time_window',
    'time_estimate_minutes',
    'energy_type',
    'prep_buffer_minutes',
    'cooldown_buffer_minutes',
    'tags',
    'captured_at',
    'date_confidence',
  ],
  note: ['tags', 'mood', 'target_date', 'end_date', 'event_time', 'captured_at', 'date_confidence'],
};
const DETAIL_VIEWS: Record<DropEntityType, string[]> = {
  todo: ['people', 'target_date', 'scheduled_date', 'event_time', 'date_type_ambiguous'],
  habit: ['people'],
  note: ['people', 'target_date', 'scheduled_date', 'event_time', 'date_type_ambiguous'],
};

/** What the details fill on a row as it was saved, kept with the drop to tell a person's edit apart. */
export type DropDetailBase = Record<string, unknown> & { views: Record<string, unknown> };

export function detailBaseOf(
  entityType: DropEntityType,
  row: Record<string, any> | null | undefined,
): DropDetailBase | null {
  if (!row) return null;
  const base: DropDetailBase = { views: {} };
  for (const key of DETAIL_COLUMNS[entityType]) base[key] = row[key] ?? null;
  const views = (row.views as Record<string, unknown>) || {};
  for (const key of DETAIL_VIEWS[entityType]) base.views[key] = views[key] ?? null;
  return base;
}

/**
 * The details, written to the saved row in one update, with the card settled
 * when `settle` is set. A field the person changed since the save (it no
 * longer matches `base`, the row as saved) is left as they set it, logged.
 * Without a base every detail is written. Resolves to whether anything was written.
 */
export function updateDropDetails(
  saved: SavedDropRow,
  drop: QueuedDrop,
  enrichment: Phase2MetadataResult | null,
  opts: { settle: boolean; kind: DropKind; base?: DropDetailBase | null },
): Promise<boolean> {
  return updateRow(saved, 'details', (item) => {
    const views = { ...((item.views as Record<string, unknown>) || {}) };
    const patch: Record<string, unknown> = {};
    if (enrichment) {
      const built = buildDropRow(drop, enrichment, {
        stage: 'settled',
        kind: opts.kind,
        title: (item.name ?? item.title) as string,
      });
      const before = opts.base ?? null;
      const beforeViews = before?.views ?? null;
      if (built) {
        const kept: string[] = [];
        for (const key of DETAIL_COLUMNS[saved.entityType]) {
          if (before && !same(item[key], before[key])) {
            kept.push(key);
            continue;
          }
          patch[key] = built.payload[key];
        }
        const builtViews = (built.payload.views as Record<string, unknown>) || {};
        for (const key of DETAIL_VIEWS[saved.entityType]) {
          if (beforeViews && !same(views[key], beforeViews[key])) {
            kept.push(`views.${key}`);
            continue;
          }
          views[key] = builtViews[key];
        }
        if (kept.length) {
          console.warn('[DropSync] details: kept what the person changed since the save', {
            id: saved.id,
            kept,
          });
        }
      }
    }
    if (opts.settle) views.minddrop_stage = 'settled';
    if (!enrichment && !opts.settle) return null;
    return { ...patch, views };
  });
}

/** The card settles without its details (they are written when they come). */
export function settleDropRow(saved: SavedDropRow): Promise<boolean> {
  return updateRow(saved, 'settle', (item) => {
    const views = (item.views as Record<string, unknown>) || {};
    if (views.minddrop_stage === 'settled') return null;
    return { views: { ...views, minddrop_stage: 'settled' } };
  });
}

/**
 * The title and reaction, when the title call answered after the save. The
 * title replaces the drop's own words only while the item still has them.
 */
export function updateDropWords(
  saved: SavedDropRow,
  words: { smartTitle: string | null; reaction: string | null } | null,
  wordsTitle: string,
): Promise<boolean> {
  return updateRow(saved, 'words', (item) => {
    const patch: Record<string, unknown> = {};
    const current = (saved.entityType === 'note' ? item.title : item.name) as string | undefined;
    if (words?.smartTitle && words.smartTitle !== current) {
      if (current === wordsTitle) {
        if (saved.entityType === 'note') patch.title = words.smartTitle;
        else if (saved.entityType === 'habit') {
          patch.name = words.smartTitle;
          patch.title = words.smartTitle;
        } else patch.name = words.smartTitle;
      } else {
        console.log('[DropSync] title changed since the save; kept', { id: saved.id });
      }
    }
    const views = (item.views as Record<string, unknown>) || {};
    if (words?.reaction && !views.confirmation_message) {
      patch.views = { ...views, confirmation_message: words.reaction };
    }
    return Object.keys(patch).length ? patch : null;
  });
}

/**
 * The writer's words for an unclear drop's question, put in place of the
 * classifier's, settling the card when `settle` is set. Only while the
 * question is still open.
 */
export function updateDropQuestion(
  saved: SavedDropRow,
  words: { question: string; options: unknown[] } | null,
  opts: { settle: boolean },
): Promise<boolean> {
  return updateRow(saved, 'question', (item) => {
    const views = { ...((item.views as Record<string, unknown>) || {}) };
    const open =
      (item.needs_clarification === true || views.needs_clarification === true) &&
      item.clarification_resolved !== true &&
      views.clarification_resolved !== true;
    const patch: Record<string, unknown> = {};
    if (words && open) {
      patch.clarification_question = words.question;
      patch.clarification_options = words.options;
      views.clarification_question = words.question;
      views.clarification_options = words.options;
    }
    if (opts.settle) views.minddrop_stage = 'settled';
    if (!Object.keys(patch).length && !opts.settle) return null;
    return { ...patch, views };
  });
}

/**
 * The already have it answer, attached to the saved item of any kind. Before
 * the card settles it is for the card (surface 'card'); after, Sweep asks
 * (surface 'sweep'). The day it asked is recorded, and that the card asks it
 * unless the person already sent the card's question off with Not now.
 * Resolves to the surface, or null when nothing was written.
 */
export async function attachDropRelation(
  saved: SavedDropRow,
  relation: Omit<HeldRelation, 'surface'>,
): Promise<'card' | 'sweep' | null> {
  let surface: 'card' | 'sweep' | null = null;
  await updateRow(saved, 'relation', (item) => {
    const views = (item.views as Record<string, unknown>) || {};
    if (views.relation) return null;
    const on: 'card' | 'sweep' = views.minddrop_stage === 'settled' ? 'sweep' : 'card';
    surface = on;
    const next: Record<string, unknown> = { ...views, relation: { ...relation, surface: on } };
    if (!next.ask_since) next.ask_since = dateService.today();
    if (on === 'card' && next.ask_on_card !== false) next.ask_on_card = true;
    return { views: next };
  });
  return surface;
}

/** For tests. */
export function __resetDropSync(): void {
  rowChains.clear();
}
