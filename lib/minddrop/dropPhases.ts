/**
 * dropPhases.ts: the phase handlers for the drop pipeline.
 *
 * The order (Mind Drop rethink stage 4, 9 Oct 2026): every call starts the
 * moment it can, and the drop is saved as its kind as soon as it is sorted.
 *
 *   queued   The tap. The title and reaction call (dropWords.ts), the already
 *            have it check (relationActions.ts) and the classifier start
 *            together. The classifier no longer waits for the question writer.
 *   sorted   About 2.0s. The kind is known. The details (and any reminder)
 *            start with it, or the question writer for an unclear drop; the
 *            title call gets at most a second more; then the drop is saved as
 *            its kind, as one item that asks for an unsure split, or as its
 *            pieces for a clear split. The reaction goes to the bubble as the
 *            card sorts, once the kind and the words are both in, a split's
 *            too (stage 10); one that comes later shows up to the settle and
 *            is let go after it.
 *   saved    About 2.3s. The card waits for the details (for an unclear drop,
 *            the writer's words) until five seconds after the sort, writes them
 *            in one update and settles. Details that come later are written when
 *            they land.
 *   complete Settled; dequeued by the runner (dropPipeline.ts handleComplete).
 *
 * The already have it answer attaches to the saved item whenever it lands,
 * for the card when it arrives before the settle and for Sweep after. A title
 * that arrives after the save replaces the drop's own words on the item.
 *
 * Each handler takes a drop at one phase and returns it at the next, or throws
 * so the runner tries the same phase again. Every call is kept in memory by
 * the drop's id (dropCalls.ts), so a retry never asks twice; after an app
 * restart a drop asks again, and its saved row is found by its drop id.
 */

import type { QueuedDrop, DropPhase, MultiSegment } from './dropQueue';
import { LEGACY_PHASES } from './dropQueue';
import { runClassifyV3 } from './phase1';
import type { HeldRelation } from './dropRelation';
import type { DropKind, Phase2MetadataResult, SavedDropRow } from './dropSync';
import {
  attachDropRelation,
  detailBaseOf,
  insertSplitPieces,
  settleDropRow,
  splitPiecesView,
  syncDropToSupabase,
  updateDropDetails,
  updateDropQuestion,
  updateDropRow,
  updateDropWords,
} from './dropSync';
import { eventBus } from '../events/EventBus';
import { getDateService } from '../date/DateService';
import {
  buildFallbackClarification,
  forgetDropClarification,
  hasUsableClarification,
  normalizeAmbiguityType,
  startDropClarification,
} from './clarification';
import {
  dropRelationFor,
  forgetDropRelation,
  heldRelationFor,
  shouldRelate,
  startDropRelation,
} from './relationActions';
import { dropWordsFor, forgetDropWords, startDropWords, type DropWords } from './dropWords';
import {
  forgetDropDetails,
  startDropDetails,
  startDropReminder,
  type ReminderDetails,
} from './dropDetails';
import { within, type StartedCall } from './dropCalls';
import { scheduleDropReminder } from './dropReminder';
import { fillPieces } from './splitActions';
import { startDropFiling } from './fileDrop';
import { fallbackTitle, wordsAsTitle } from '../../workers/shared/titles';

// ──────────────────────────────────────────────────────────────────────────────
// withTimeout helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a promise with a timeout. If the timeout fires first, returns the fallback value.
 * Does NOT throw on timeout; returns the fallback for soft degradation.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timer]);
}

// ──────────────────────────────────────────────────────────────────────────────
// Timings
// ──────────────────────────────────────────────────────────────────────────────

// App side budget for classify-v3 (worker worst case is 5s primary + 4s fallback).
export const CLASSIFY_V3_TIMEOUT_MS = 10000;

/**
 * How long the pipeline waits (a plain object so a test can shorten them).
 * wordsAfterSortMs: the title call's extra time once the drop is sorted.
 * settleMs: from the sort to the settle, at most.
 */
export const DROP_WAITS = { wordsAfterSortMs: 1000, settleMs: 5000 };

const now = () => getDateService().now().getTime();

// ──────────────────────────────────────────────────────────────────────────────
// In memory, by the drop's local id
// ──────────────────────────────────────────────────────────────────────────────

/** Drops this run of the app has taken from the tap; any other was picked up after a restart. */
const queuedThisRun = new Set<string>();
/**
 * When this run of the app saved each drop, from the sort: the settle is five
 * seconds after it. A drop picked up at 'saved' after a restart is not here.
 */
const sortStarted = new Map<string, number>();
/** Late parts already waited on (words, relation, details, reminder), so a retry never waits twice. */
const waiting = new Set<string>();
/** The reaction goes to the bubble once per drop, and never after its card settles. */
const reactionSent = new Set<string>();
const settledIds = new Set<string>();

function remember(set: Set<string>, key: string): void {
  if (set.size >= 200) set.clear();
  set.add(key);
}

/** Let go of everything kept for a drop (called once it is complete). Late parts still land. */
export function forgetDropCalls(localId: string): void {
  forgetDropWords(localId);
  forgetDropDetails(localId);
  forgetDropClarification(localId);
  forgetDropRelation(localId);
  queuedThisRun.delete(localId);
  sortStarted.delete(localId);
  for (const part of ['words', 'relation', 'details', 'reminder']) {
    waiting.delete(`${localId}:${part}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const BUCKETS = ['todo', 'habit', 'log'];

function isClearSplit(drop: QueuedDrop): boolean {
  return !!drop.isMulti && drop.split === 'clear' && (drop.multiSegments?.length ?? 0) > 1;
}

function isUnclear(drop: QueuedDrop): boolean {
  return !drop.isMulti && !!drop.needsClarification;
}

/**
 * What the drop is saved as: its kind; for an unsure split the classifier's
 * kind for the drop as one, or a note when it gave none.
 */
export function saveKindOf(drop: QueuedDrop): DropKind {
  if (drop.isMulti && drop.split !== 'clear') {
    return drop.asOne ?? { bucket: 'log', subtype: 'general', habitSubtype: null };
  }
  const known = !!drop.bucket && BUCKETS.includes(drop.bucket);
  if (!known) {
    console.warn('[DropPhases] drop with no kind it can be saved as; saved as a note', {
      localId: drop.localId,
      bucket: drop.bucket ?? null,
    });
  }
  const bucket = known ? drop.bucket! : 'log';
  return {
    bucket,
    subtype: bucket === 'log' ? (drop.subtype ?? 'general') : null,
    habitSubtype: bucket === 'habit' ? (drop.habitSubtype ?? 'start_habit') : null,
  };
}

/** A piece as the queue keeps it; a piece that asks always has a question to show. */
function toSegment(seg: any): MultiSegment {
  const raw = BUCKETS.includes(seg?.bucket)
    ? seg.bucket
    : BUCKETS.includes(seg?.likely_bucket)
      ? seg.likely_bucket
      : 'log';
  const asks = seg?.is_ambiguous === true;
  const type = asks ? normalizeAmbiguityType(seg.ambiguity_type) : null;
  const usable =
    asks && hasUsableClarification(seg.clarification_question, seg.clarification_options);
  const fixed = asks && !usable ? buildFallbackClarification(type) : null;
  if (fixed) {
    console.warn('[DropPhases] a piece that asks had no usable question; the fixed one is used', {
      ambiguityType: type,
    });
  }
  return {
    text: String(seg?.text || ''),
    bucket: raw,
    subtype: raw === 'log' ? (seg.subtype ?? seg.likely_subtype ?? 'general') : null,
    habitSubtype: raw === 'habit' ? (seg.habitSubtype ?? 'start_habit') : null,
    needsClarification: asks,
    ambiguityType: type,
    clarificationQuestion: asks ? (usable ? seg.clarification_question : fixed!.question) : null,
    clarificationOptions: asks ? (usable ? seg.clarification_options : fixed!.options) : null,
  };
}

/** The question an unclear drop is saved with: the classifier's, or the fixed copy for its type. */
function questionToSave(drop: QueuedDrop): Partial<QueuedDrop> {
  if (hasUsableClarification(drop.clarificationQuestion, drop.clarificationOptions)) return {};
  const fixed = buildFallbackClarification(drop.ambiguityType);
  console.warn('[DropPhases] unclear drop with no usable question; the fixed one is saved', {
    localId: drop.localId,
    ambiguityType: fixed.ambiguityType,
  });
  return {
    ambiguityType: fixed.ambiguityType,
    clarificationQuestion: fixed.question,
    clarificationOptions: fixed.options as QueuedDrop['clarificationOptions'],
  };
}

/** The title call's answer as the drop keeps it; a call that failed leaves the drop's own words (logged). */
function wordsOf(
  drop: QueuedDrop,
  words: DropWords | null,
): { smartTitle: string; reaction: string | null } {
  return {
    smartTitle: words?.smartTitle || fallbackTitle(drop.text, 'enrich-phase1-5a'),
    reaction: words?.reaction ?? null,
  };
}

/**
 * Gremly's reaction for the bubble, once per drop, when the kind and the words
 * are both in (stage 10). It is the only comment on a drop, a split's included,
 * and never comes with a follow up line: the question or the split is already
 * on the card. A reaction of null (the title call failed) lets the bubble use
 * its own line, as before.
 */
function sendReaction(drop: QueuedDrop, reaction: string | null): void {
  if (reactionSent.has(drop.localId)) return;
  remember(reactionSent, drop.localId);
  eventBus.emit('drop:reaction_ready', {
    localId: drop.localId,
    message: reaction,
    rawReaction: reaction,
    // no follow up line since stage 10; the field itself goes in stage 11
    followUp: null,
  });
}

/** A reaction that comes after the sort: shown up to the settle; after it, Gremly lets the drop go. */
function sendLateReaction(drop: QueuedDrop, reaction: string | null): void {
  if (!settledIds.has(drop.localId)) {
    sendReaction(drop, reaction);
    return;
  }
  console.log('[DropPhases] reaction came after the settle; not shown', {
    localId: drop.localId,
  });
}

/** The details as the drop keeps them (filing reads the tags, people and date). */
function detailsOntoDrop(
  enrichment: Phase2MetadataResult | null,
  reminder: ReminderDetails | null,
): Partial<QueuedDrop> {
  const out: Partial<QueuedDrop> = {};
  if (enrichment) {
    Object.assign(out, {
      tags: enrichment.tags || [],
      timeEstimateMinutes: enrichment.time_estimate_minutes || null,
      timeWindow: enrichment.time_window || null,
      energyType: enrichment.energy_type || null,
      priorityKind: enrichment.priority_kind ?? null,
      extractedDate: enrichment.extracted_date || null,
      extractedStartDate: enrichment.extracted_start_date || null,
      extractedFrequency: enrichment.extracted_frequency || null,
      extractedDays: enrichment.extracted_days || null,
      people: enrichment.people || [],
      mood: enrichment.mood || null,
      targetDate: enrichment.target_date || null,
      scheduledDate: enrichment.scheduled_date || null,
      eventTime: enrichment.event_time || null,
      dateTypeAmbiguous: enrichment.date_type_ambiguous || false,
      endDate: enrichment.end_date || null,
    });
  }
  if (reminder) {
    Object.assign(out, {
      autoReminder: reminder.auto_reminder || false,
      reminderDate: reminder.reminder_date || null,
      reminderTime: reminder.reminder_time || null,
      reminderFrequency: reminder.reminder_frequency || null,
    });
  }
  return out;
}

/** An older build's details, as it kept them on the drop. */
function enrichmentFromDrop(drop: QueuedDrop): Phase2MetadataResult | null {
  if (!drop.tags) return null;
  return {
    tags: drop.tags || [],
    time_estimate_minutes: drop.timeEstimateMinutes || null,
    time_window: drop.timeWindow || null,
    extracted_date: drop.extractedDate || null,
    extracted_start_date: drop.extractedStartDate || null,
    extracted_frequency: drop.extractedFrequency || null,
    extracted_days: drop.extractedDays || null,
    people: drop.people || [],
    mood: drop.mood || null,
    energy_type: (drop.energyType || null) as Phase2MetadataResult['energy_type'],
    priority_kind: drop.priorityKind ?? null,
    target_date: drop.targetDate || null,
    scheduled_date: drop.scheduledDate || null,
    event_time: drop.eventTime || null,
    date_type_ambiguous: drop.dateTypeAmbiguous || false,
    end_date: drop.endDate || null,
    smart_title: null,
    dateConfidence: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Parts that land after the save
// ──────────────────────────────────────────────────────────────────────────────

/** The title and reaction, when the title call answers after the save. */
function whenWordsLand(drop: QueuedDrop, saved: SavedDropRow, wordsTitle: string): void {
  const key = `${drop.localId}:words`;
  if (waiting.has(key)) return;
  remember(waiting, key);
  void dropWordsFor(drop).promise.then(async (words) => {
    try {
      if (!words?.smartTitle) fallbackTitle(drop.text, 'enrich-phase1-5a');
      sendLateReaction(drop, words?.reaction ?? null);
      await updateDropWords(saved, words, wordsTitle);
    } catch (err) {
      console.warn('[DropPhases] the late title could not be saved', {
        localId: drop.localId,
        error: String(err),
      });
    }
  });
}

/**
 * A clear split's reaction, when the title call answers after its pieces are
 * saved. The whole drop's words are only for the bubble: each piece has its
 * own title.
 */
function whenSplitWordsLand(drop: QueuedDrop): void {
  const key = `${drop.localId}:words`;
  if (waiting.has(key)) return;
  remember(waiting, key);
  void dropWordsFor(drop).promise.then((words) => sendLateReaction(drop, words?.reaction ?? null));
}

/** The already have it answer, whenever it lands (for the card before the settle, Sweep after). */
function whenRelationLands(drop: QueuedDrop, saved: SavedDropRow, kind: DropKind): void {
  const key = `${drop.localId}:relation`;
  if (waiting.has(key)) return;
  remember(waiting, key);
  void dropRelationFor(drop).promise.then(async (relation) => {
    if (!relation) return;
    try {
      const surface = await attachDropRelation(saved, heldRelationFor(drop, relation, kind));
      console.log('[DropPhases] Drop relates to an existing item', {
        localId: drop.localId,
        kind: relation.kind,
        intent: relation.intent,
        surface,
      });
    } catch (err) {
      console.warn('[DropPhases] the already have it answer could not be saved', {
        localId: drop.localId,
        error: String(err),
      });
    }
  });
}

/**
 * An unsure split saved as one: whether the whole drop's already have it check
 * found something, kept on views.split, so a Split later checks each piece
 * only then (stage 7).
 */
function whenSplitRelationLands(drop: QueuedDrop, saved: SavedDropRow): void {
  const key = `${drop.localId}:split_relation`;
  if (waiting.has(key)) return;
  remember(waiting, key);
  void dropRelationFor(drop).promise.then(async (relation) => {
    try {
      await updateDropRow(saved.entityType, saved.id, 'split_related', (row) => {
        const views = (row.views as Record<string, any>) || {};
        if (!views.split || typeof views.split !== 'object') return null;
        return { views: { ...views, split: { ...views.split, related: !!relation } } };
      });
    } catch (err) {
      console.warn('[DropPhases] the split’s already have it answer could not be kept', {
        localId: drop.localId,
        error: String(err),
      });
    }
  });
}

/** Details that come after the settle are written when they land. */
function whenDetailsLand(
  drop: QueuedDrop,
  saved: SavedDropRow,
  kind: DropKind,
  call: StartedCall<Phase2MetadataResult>,
): void {
  const key = `${drop.localId}:details`;
  if (waiting.has(key)) return;
  remember(waiting, key);
  void call.promise.then(async (enrichment) => {
    if (!enrichment) return;
    console.log('[DropPhases] details came after the settle', { localId: drop.localId });
    try {
      await updateDropDetails(saved, drop, enrichment, {
        settle: false,
        kind,
        base: drop.savedBase ?? null,
      });
    } catch (err) {
      console.warn('[DropPhases] the late details could not be saved', {
        localId: drop.localId,
        error: String(err),
      });
    }
  });
}

/** The reminder a drop asked for, saved whenever its call lands. */
function whenReminderLands(drop: QueuedDrop, saved: SavedDropRow, kind: DropKind): void {
  const call = startDropReminder(drop, kind);
  if (!call) return;
  const key = `${drop.localId}:reminder`;
  if (waiting.has(key)) return;
  remember(waiting, key);
  void call.promise.then((reminder) => scheduleDropReminder(saved, reminder));
}

// ──────────────────────────────────────────────────────────────────────────────
// queued: the tap
// ──────────────────────────────────────────────────────────────────────────────

export async function handleQueued(drop: QueuedDrop): Promise<QueuedDrop> {
  remember(queuedThisRun, drop.localId);
  // When this run first took it up (an offline drop waits in the queue first)
  const startedAt = drop.startedAt ?? now();

  // The title and reaction call, and the already have it check, only need the
  // words: both start now, beside the classifier
  const words = startDropWords(drop);
  startDropRelation(drop);

  // One call for the kind, the split and any question (classify-v3, which falls
  // back to its backup model inside the Worker). A failure throws, so the
  // runner tries the drop again and, after its tries, shows it as failed:
  // there is no weaker path to run instead (stage 11 removed the v2 one).
  const v3 = await withTimeout(
    runClassifyV3(
      drop.text,
      { hasAttachments: false, hasUserSelectedDate: !!drop.prefillDate },
      CLASSIFY_V3_TIMEOUT_MS,
    ),
    CLASSIFY_V3_TIMEOUT_MS + 250,
    null,
  );
  if (!v3?.phase1) {
    throw new Error('Classification failed');
  }
  const multiResult: any = v3.multi ?? { is_multi: false };
  const phase1Result: any = v3.phase1;
  const engine = 'v3' as const;

  console.log('[DropPhases] sorted', {
    localId: drop.localId,
    engine,
    isMulti: multiResult.is_multi,
    split: multiResult.split ?? null,
    bucket: phase1Result.bucket,
    source: phase1Result.source,
  });

  const base: QueuedDrop = {
    ...drop,
    phase: 'sorted',
    startedAt,
    sortedAt: now(),
    classifyEngine: engine,
    // the classifier heard a remind me: the reminder call runs with the details
    reminderIntent: phase1Result.reminder_intent === true,
    retryCount: 0,
    lastError: null,
  };

  // Several things in one drop: a clear split is saved as its pieces, an
  // unsure one as one item that asks
  if (multiResult.is_multi && multiResult.segments?.length > 1) {
    // the whole drop's already have it answer is kept as a filter: when it found
    // something, each piece is checked on its own (stage 7)
    const split: 'clear' | 'unsure' = multiResult.split === 'clear' ? 'clear' : 'unsure';
    const asOne = multiResult.as_one ?? null;
    if (split === 'unsure' && !asOne) {
      console.warn('[DropPhases] unsure split with no kind for the drop as one; saved as a note', {
        localId: drop.localId,
        engine,
      });
    }
    const sorted: QueuedDrop = {
      ...base,
      isMulti: true,
      split,
      asOne,
      multiSegments: multiResult.segments.map(toSegment),
      multiSummary: multiResult.summary || drop.text.substring(0, 60),
      dominantBucket: multiResult.dominant_bucket || 'log',
      dominantSubtype: multiResult.dominant_subtype || null,
      bucket: phase1Result.bucket,
      subtype: phase1Result.subtype,
    };
    // The title call at the tap saw the whole drop, so a split gets its
    // reaction like any other drop (stage 10); the pieces' own are not shown
    if (words.done) {
      const { smartTitle, reaction } = wordsOf(drop, words.value);
      sorted.smartTitle = smartTitle;
      sorted.confirmationMessage = reaction;
      sendReaction(sorted, reaction);
    }
    return sorted;
  }

  const sorted: QueuedDrop = {
    ...base,
    bucket: phase1Result.bucket,
    subtype: phase1Result.subtype,
    habitSubtype: phase1Result.habitSubtype,
    confidence: phase1Result.confidence,
    classificationSource: phase1Result.classificationSource || phase1Result.source,
    classificationDegraded: phase1Result.classificationDegraded || false,
    needsClarification: phase1Result.is_ambiguous || false,
    ambiguityReason: phase1Result.ambiguity_reason || null,
    plausibleInterpretations: phase1Result.plausible_interpretations || null,
  };

  // A drop flagged unclear without a type gets the generic question type
  // ('bucket'), so it is never left without a question.
  if (sorted.needsClarification) {
    sorted.ambiguityType = normalizeAmbiguityType(phase1Result.ambiguity_type);
  }

  // classify-v3 gives the classifier's own question in the same reply; the
  // writer's words follow from the sort (clarify-ambiguity)
  const inlineQuestion = phase1Result.clarification_question;
  const inlineOptions = phase1Result.clarification_options;
  if (sorted.needsClarification && hasUsableClarification(inlineQuestion, inlineOptions)) {
    sorted.clarificationQuestion = inlineQuestion;
    sorted.clarificationOptions = inlineOptions;
  }

  // The title call is often back by now: the card sorts with its title
  if (words.done) {
    const { smartTitle, reaction } = wordsOf(drop, words.value);
    sorted.smartTitle = smartTitle;
    sorted.confirmationMessage = reaction;
    sendReaction(sorted, reaction);
  }

  return sorted;
}

// ──────────────────────────────────────────────────────────────────────────────
// sorted: start the details, and save the drop as its kind
// ──────────────────────────────────────────────────────────────────────────────

export async function handleSorted(drop: QueuedDrop): Promise<QueuedDrop> {
  if (!sortStarted.has(drop.localId)) {
    if (sortStarted.size >= 200) sortStarted.clear();
    sortStarted.set(drop.localId, now());
  }
  const sortedAt = drop.sortedAt ?? now();
  // sorted before a restart (or by an older build): its timings are not like for like
  const resumed = !queuedThisRun.has(drop.localId) || undefined;

  // A clear split is saved as its pieces, each settled as it is (stage 7 gives
  // each piece its own title and details)
  if (isClearSplit(drop)) {
    // The whole drop's reaction goes with the pieces: the title call gets the
    // same second more while they are saved. A split sorted before a restart
    // gets none, and no title call just for the bubble.
    const reactionDue = queuedThisRun.has(drop.localId) && !reactionSent.has(drop.localId);
    const [pieceRows, words] = await Promise.all([
      insertSplitPieces(drop),
      reactionDue ? within(dropWordsFor(drop), DROP_WAITS.wordsAfterSortMs) : Promise.resolve(null),
    ]);
    if (reactionDue) {
      if (words === undefined) whenSplitWordsLand(drop);
      else sendReaction(drop, words?.reaction ?? null);
    }
    console.log('[DropPhases] saved as its pieces', {
      localId: drop.localId,
      pieces: pieceRows.length,
    });
    return {
      ...drop,
      phase: 'saved',
      sortedAt,
      savedAt: now(),
      pieceRows,
      resumed: drop.resumed || resumed,
      retryCount: 0,
      lastError: null,
    };
  }

  const kind = saveKindOf(drop);
  const unclear = isUnclear(drop);

  // The details (and any reminder) start with the kind; an unclear drop has
  // none until it is answered, and asks the writer for its question's words
  if (unclear) startDropClarification({ ...drop, bucket: kind.bucket });
  else {
    startDropDetails(drop, kind);
    startDropReminder(drop, kind);
  }

  // The title call gets at most a second more
  let smartTitle = drop.smartTitle ?? null;
  let reaction = drop.confirmationMessage ?? null;
  let wordsPending = false;
  if (!smartTitle) {
    const words = await within(dropWordsFor(drop), DROP_WAITS.wordsAfterSortMs);
    if (words === undefined) wordsPending = true;
    else ({ smartTitle, reaction } = wordsOf(drop, words));
  }
  const title = smartTitle ?? wordsAsTitle(drop.text);
  if (!wordsPending) sendReaction(drop, reaction);

  // The already have it answer, if it is in by now; otherwise it attaches when it lands.
  // A drop an older build held as a note keeps the answer it had.
  let relation: Omit<HeldRelation, 'surface'> | null = null;
  let relationPending = false;
  if (drop.relation) {
    forgetDropRelation(drop.localId);
  } else if (shouldRelate(drop)) {
    const call = dropRelationFor(drop);
    if (call.done) relation = call.value ? heldRelationFor(drop, call.value, kind) : null;
    else relationPending = true;
  } else if (!drop.isMulti) {
    // (an unsure split keeps the whole drop's check as a filter for a Split later)
    forgetDropRelation(drop.localId);
  }

  const toSave: QueuedDrop = {
    ...drop,
    ...(unclear ? questionToSave(drop) : {}),
    smartTitle: title,
    confirmationMessage: reaction,
  };
  const extraViews: Record<string, unknown> = {};
  if (drop.relation) extraViews.relation = drop.relation;
  else if (relation) extraViews.relation = { ...relation, surface: 'card' };
  // An unsure split is one item that asks whether to split (stage 7 draws the strip)
  if (drop.isMulti) {
    extraViews.split = { status: 'pending', pieces: splitPiecesView(drop.multiSegments || []) };
  }

  const result = await syncDropToSupabase(toSave, null, {
    stage: 'saved',
    title,
    kind,
    extraViews,
  });
  if (!result.success || !result.supabaseId || !result.entityType) {
    // the runner tries again; the insert is safe to repeat by drop id
    throw new Error(result.error?.message || 'Supabase sync failed');
  }
  const saved: SavedDropRow = { entityType: result.entityType, id: result.supabaseId };

  // Where it lives: filing starts as soon as it is saved, so the card can settle
  // with its place (stage 9); it has the drop's words, title and kind
  startDropFiling({
    ...toSave,
    supabaseId: saved.id,
    entityType: saved.entityType,
    bucket: kind.bucket,
    subtype: kind.subtype,
  });

  // An earlier try had saved it, before this one had the title or the answer:
  // they go on the row as late parts would
  if (result.duplicate) {
    console.warn('[DropPhases] the drop was already saved by an earlier try', {
      localId: drop.localId,
    });
    if (!wordsPending && smartTitle) {
      await updateDropWords(saved, { smartTitle, reaction }, wordsAsTitle(drop.text));
    }
    if (relation) await attachDropRelation(saved, relation);
  }

  if (wordsPending) whenWordsLand(drop, saved, title);
  if (relationPending) whenRelationLands(drop, saved, kind);
  if (drop.isMulti) whenSplitRelationLands(drop, saved);
  if (!unclear) whenReminderLands(drop, saved, kind);

  console.log('[DropPhases] saved', {
    localId: drop.localId,
    supabaseId: saved.id,
    entityType: saved.entityType,
    wordsPending,
    relationPending,
    relation: !!relation,
  });

  return {
    ...toSave,
    phase: 'saved',
    bucket: kind.bucket,
    subtype: kind.subtype,
    habitSubtype: kind.habitSubtype,
    sortedAt,
    savedAt: now(),
    supabaseId: saved.id,
    entityType: saved.entityType,
    savedBase: detailBaseOf(saved.entityType, result.row),
    wordsPending,
    relationPending,
    resumed: drop.resumed || resumed,
    retryCount: 0,
    lastError: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// saved: wait for the details, write them, and settle
// ──────────────────────────────────────────────────────────────────────────────

function settled(drop: QueuedDrop, extra: Partial<QueuedDrop>): QueuedDrop {
  remember(settledIds, drop.localId);
  return {
    ...drop,
    ...extra,
    phase: 'complete',
    settledAt: now(),
    retryCount: 0,
    lastError: null,
  };
}

/**
 * A drop with no row yet at 'saved': an older build's drop (from 'enriched',
 * with its details already on it), or one whose save never landed. Saved as
 * its kind, settled, safe to repeat by drop id.
 */
async function saveOlderDrop(drop: QueuedDrop): Promise<QueuedDrop> {
  const kind = saveKindOf(drop);
  const enrichment = enrichmentFromDrop(drop);
  const extraViews: Record<string, unknown> = {};
  // a drop an older build held as a note while it asked "already have it"
  if (drop.relation) extraViews.relation = drop.relation;
  if (drop.isMulti && !isClearSplit(drop)) {
    extraViews.split = { status: 'pending', pieces: splitPiecesView(drop.multiSegments || []) };
  }
  const result = await syncDropToSupabase(
    { ...drop, ...(isUnclear(drop) ? questionToSave(drop) : {}) },
    enrichment,
    { stage: 'settled', kind, extraViews },
  );
  if (!result.success || !result.supabaseId || !result.entityType) {
    throw new Error(result.error?.message || 'Supabase sync failed');
  }
  const saved: SavedDropRow = { entityType: result.entityType, id: result.supabaseId };
  if (drop.autoReminder) {
    void scheduleDropReminder(saved, {
      auto_reminder: true,
      reminder_date: drop.reminderDate ?? null,
      reminder_time: drop.reminderTime ?? null,
      reminder_frequency: drop.reminderFrequency ?? null,
    });
  }
  console.log('[DropPhases] saved a drop left by an older build', {
    localId: drop.localId,
    supabaseId: saved.id,
  });
  return settled(
    {
      ...drop,
      bucket: kind.bucket,
      subtype: kind.subtype,
      habitSubtype: kind.habitSubtype,
      supabaseId: saved.id,
      entityType: saved.entityType,
      savedAt: now(),
    },
    { detailsIn: enrichment ? 'in_time' : 'none', resumed: true },
  );
}

export async function handleSaved(drop: QueuedDrop): Promise<QueuedDrop> {
  // A clear split's pieces: each gets its own details and title (and its own
  // already have it check when the whole drop's found something), and settles
  // on its own within the same five seconds (stage 7)
  if (drop.pieceRows?.length) {
    const started = sortStarted.get(drop.localId);
    const deadline = (started ?? now()) + DROP_WAITS.settleMs;
    const related = dropRelationFor(drop).promise.then(
      (relation) => !!relation,
      () => false,
    );
    const detailsIn = await fillPieces(drop, drop.pieceRows, { deadline, related });
    return settled(drop, {
      detailsIn,
      resumed: drop.resumed || started === undefined || undefined,
    });
  }

  if (!drop.supabaseId || !drop.entityType) return saveOlderDrop(drop);

  const saved: SavedDropRow = { entityType: drop.entityType, id: drop.supabaseId };
  const kind = saveKindOf(drop);

  // Picked up after an app restart: the late parts are asked for again, and
  // Gremly says nothing about a drop from before
  const started = sortStarted.get(drop.localId);
  const resumed = started === undefined;
  if (resumed) {
    remember(reactionSent, drop.localId);
    if (drop.wordsPending) whenWordsLand(drop, saved, drop.smartTitle || wordsAsTitle(drop.text));
    if (drop.relationPending && shouldRelate(drop)) whenRelationLands(drop, saved, kind);
    if (!isUnclear(drop)) whenReminderLands(drop, saved, kind);
  }

  // Five seconds from when this run sorted it (a fresh five after a restart)
  const deadline = (started ?? now()) + DROP_WAITS.settleMs;
  const timeLeft = () => Math.max(0, deadline - now());

  // The already have it answer belongs to a settled card, so the settle waits
  // for it as it waits for the details, within the same five seconds: a
  // duplicate known in time shows its line on the card rather than going to
  // Sweep (the stage 6 simulator check: a slow check landed a second after
  // the settle). whenRelationLands, which listened first, puts it on the row
  // ahead of the settle's own write.
  const relationCall = drop.relationPending && shouldRelate(drop) ? dropRelationFor(drop) : null;
  const relationWait = relationCall ? within(relationCall, timeLeft()) : Promise.resolve(null);
  const relationIn = async (): Promise<QueuedDrop['relationIn']> => {
    if (!relationCall) return shouldRelate(drop) || drop.relation ? 'in_time' : 'not_asked';
    return (await relationWait) === undefined ? 'after_settle' : 'in_time';
  };

  // Where it lives: started at the save (or now, after a restart); the card
  // settles once the details and filing have both answered, within the same
  // five seconds, and a place that comes later fades in alone (stage 9)
  const filingCall = startDropFiling({ ...drop, bucket: kind.bucket, subtype: kind.subtype });
  const filingWait = within(filingCall, timeLeft());
  const filingIn = async (): Promise<QueuedDrop['filingIn']> =>
    (await filingWait) === undefined ? 'after_settle' : 'in_time';

  // An unclear drop settles with the writer's words when they are in time;
  // otherwise the classifier's question stays (a question never arrives later)
  if (isUnclear(drop)) {
    const call = startDropClarification({ ...drop, bucket: kind.bucket });
    const [words] = await Promise.all([within(call, timeLeft()), relationWait]);
    if (words === undefined) {
      await settleDropRow(saved);
      void call.promise.then(() =>
        console.log("[DropPhases] question words came after the settle; the classifier's stay", {
          localId: drop.localId,
        }),
      );
    } else {
      await updateDropQuestion(
        saved,
        words?.writerWords ? { question: words.question, options: words.options } : null,
        { settle: true },
      );
    }
    return settled(drop, {
      detailsIn: 'not_asked',
      relationIn: await relationIn(),
      // an unclear drop is filed as well, but its card asks rather than waits for it
      filingIn: 'not_asked',
      resumed: drop.resumed || resumed || undefined,
    });
  }

  const call = startDropDetails(drop, kind);
  const [enrichment] = await Promise.all([within(call, timeLeft()), relationWait, filingWait]);
  if (enrichment === undefined) {
    // settles without its details; they are written when they land
    await settleDropRow(saved);
    whenDetailsLand(drop, saved, kind, call);
    return settled(drop, {
      detailsIn: 'after_settle',
      relationIn: await relationIn(),
      filingIn: await filingIn(),
      resumed: drop.resumed || resumed || undefined,
    });
  }

  await updateDropDetails(saved, drop, enrichment, {
    settle: true,
    kind,
    base: drop.savedBase ?? null,
  });
  return settled(drop, {
    ...detailsOntoDrop(enrichment, null),
    detailsIn: enrichment ? 'in_time' : 'none',
    relationIn: await relationIn(),
    filingIn: await filingIn(),
    resumed: drop.resumed || resumed || undefined,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase Router
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The handler for a phase, or null for the terminal ones (complete, failed).
 * An older build's phase runs the handler it moves to (migrateDropPhases moves
 * them all at start; this covers one that slips past).
 */
export function getPhaseHandler(
  phase: DropPhase,
): ((drop: QueuedDrop) => Promise<QueuedDrop>) | null {
  switch (LEGACY_PHASES[phase] ?? phase) {
    case 'queued':
      return handleQueued;
    case 'sorted':
      return handleSorted;
    case 'saved':
      return handleSaved;
    default:
      return null;
  }
}
