/**
 * splitActions.ts: a drop with several things in it (Mind Drop rethink stage 7).
 *
 * - fillPieces: each piece of a split, saved as its own item, gets its own
 *   details and title call with its kind (and, when the whole drop's already
 *   have it check found something, its own check), is filed (stage 9), and
 *   settles on its own within the same five seconds as any drop.
 * - splitDropNow: Split on an unsure split's card: its pieces are saved as
 *   their own items, filled as above, and the one item is archived ('split').
 * - keepSplitAsOne: Keep as one on an unsure split: the one item stays.
 * - keepPiecesAsOne: Keep as one under a clear split's pieces: one item of
 *   the kind the classifier gave the drop as one (as_one), with the drop's
 *   words, its details, filing and reminder, and the pieces archived
 *   ('kept_as_one').
 * - logSplitAnswer: the split telemetry James asked for on 9 October: what the
 *   classifier said (clear or unsure) and what the person tapped (split, keep
 *   as one, not now), in app_events, with no words.
 *
 * The classifier decides every split; code here only saves what it said and
 * what the person tapped.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService, nowTimestamp } from '../date/DateService';
import { logAppEvent } from '../appEvents';
import { wordsAsTitle } from '../../workers/shared/titles';
import type { MultiSegment, QueuedDrop, SavedPieceRow } from './dropQueue';
import {
  attachDropRelation,
  detailBaseOf,
  insertSplitPieces,
  kindWordOf,
  settleDropRow,
  syncDropToSupabase,
  updateDropDetails,
  updateDropRow,
  updateDropWords,
  type DropEntityType,
  type DropKind,
  type SavedDropRow,
} from './dropSync';
import { startDropDetails, startDropReminder } from './dropDetails';
import { scheduleDropReminder } from './dropReminder';
import { DIDNT_GO, PlainError } from './plainError';
import { dropWordsFor } from './dropWords';
import {
  dropRelationFor,
  heldRelationFor,
  shouldRelate,
  startedDropRelation,
} from './relationActions';
import { within } from './dropCalls';
import { startDropFiling } from './fileDrop';
import type { MindDropBucket, LogSubtype } from './types';
import type { HabitSubtype } from '../types';

/** From a tap on Split to the pieces settling, at most (as DROP_WAITS.settleMs). */
export const SPLIT_SETTLE_MS = 5000;

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

/** "two", "three": the number of pieces in words, for One job or two? and Split into two. */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

export type SplitSaid = 'clear' | 'unsure';
export type SplitTapped = 'split' | 'keep_as_one' | 'not_now';

/**
 * One row per split answered, with no words: what the classifier itself said
 * (`said`: clear, unsure, or null when it gave none), what the card showed
 * (`shown`: the pieces for clear, the question for unsure, which
 * CLASSIFY_SPLIT_AUTO decides), what was tapped and the number of pieces
 * (final check item 7: the model's call whatever the switch says).
 */
export function logSplitAnswer(
  shown: SplitSaid,
  tapped: SplitTapped,
  pieces: number,
  target: { type: DropEntityType; id: string },
  said: SplitSaid | null = null,
): void {
  void logAppEvent('split_answer', target, { said, shown, tapped, pieces });
}

/** The classifier's own call kept on a split, or null. */
export function classifierSaidOf(kept: unknown): SplitSaid | null {
  return kept === 'clear' || kept === 'unsure' ? kept : null;
}

const now = () => getDateService().now().getTime();

type Kind = DropEntityType;
type Item = Record<string, any> & { id: string };

function findItem(id: string): { kind: Kind; item: Item } | null {
  const s = useGremlyStore.getState() as unknown as Record<string, Item[]>;
  const match = (x: Item) => x.id === id || x.drop_id === id;
  for (const [kind, list] of [
    ['todo', s.todos],
    ['habit', s.habits],
    ['note', s.notes],
  ] as Array<[Kind, Item[]]>) {
    const item = (list || []).find(match);
    if (item) return { kind, item };
  }
  return null;
}

async function archive(kind: Kind, id: string, reason: string): Promise<void> {
  const s = useGremlyStore.getState();
  if (kind === 'todo') await s.archiveTodo(id, reason);
  else if (kind === 'habit') await s.archiveHabit(id, reason);
  else await s.archiveNote(id, reason);
}

/** A piece, as a drop of its own for the calls that take a drop. */
function pieceDrop(parent: QueuedDrop, piece: SavedPieceRow): QueuedDrop {
  return {
    ...parent,
    localId: piece.dropId,
    text: piece.text,
    bucket: piece.bucket,
    subtype: piece.subtype,
    habitSubtype: (piece.habitSubtype ?? null) as HabitSubtype | null,
    isMulti: false,
    split: undefined,
    asOne: undefined,
    multiSegments: undefined,
    pieceRows: undefined,
    needsClarification: !!piece.asks,
    smartTitle: undefined,
    confirmationMessage: null,
    supabaseId: piece.id,
    entityType: piece.entityType,
  };
}

/**
 * Each piece's own details and title, and its already have it check when the
 * whole drop's found something (`related`: true, false, or a promise of it),
 * each settling on its own by `deadline` (ms). A piece that asks was saved
 * settled with its question. Anything later is written when it lands; never
 * rejects. Resolves to whether every piece's details were in by the deadline
 * (`not_asked` when every piece asks a question), for the drop's timing row.
 */
export async function fillPieces(
  parent: QueuedDrop,
  pieces: SavedPieceRow[],
  opts: { deadline: number; related: Promise<boolean> | boolean },
): Promise<'in_time' | 'after_settle' | 'not_asked'> {
  let asked = 0;
  let late = 0;
  const timeLeft = () => Math.max(0, opts.deadline - now());
  const related = Promise.resolve(opts.related).then(
    (r) => r === true,
    () => false,
  );
  // the whole drop's answer, if it is in by the deadline (undefined when it is not)
  const relatedInTime = Promise.race<boolean | undefined>([
    related,
    new Promise<undefined>((r) => setTimeout(() => r(undefined), timeLeft())),
  ]);

  await Promise.all(
    pieces.map(async (piece) => {
      const saved: SavedDropRow = { entityType: piece.entityType, id: piece.id };
      const drop = pieceDrop(parent, piece);
      const kind: DropKind = {
        bucket: piece.bucket as MindDropBucket,
        subtype: piece.subtype as LogSubtype | null,
        habitSubtype: (piece.habitSubtype ?? null) as HabitSubtype | null,
      };
      // its own already have it check, attached whenever it lands
      const relatePiece = () => {
        if (!shouldRelate(drop)) return null;
        const call = dropRelationFor(drop);
        void call.promise.then(async (relation) => {
          if (!relation) return;
          try {
            await attachDropRelation(saved, heldRelationFor(drop, relation, kind));
          } catch (err) {
            console.warn('[Split] a piece’s already have it answer could not be saved', {
              piece: piece.dropId,
              error: String(err),
            });
          }
        });
        return call;
      };
      // where it lives, filed as soon as the piece is saved (stage 9); a piece that asks too
      const filing = startDropFiling(drop);
      // the reminder a remind me asked for, decided for each piece on its own
      // words, saved whenever it lands (final check item 5); a piece that asks
      // has none until it is answered
      if (!piece.asks) whenPieceReminderLands(drop, saved, kind);
      try {
        const details = piece.asks ? null : startDropDetails(drop, kind);
        const words = piece.asks ? null : dropWordsFor(drop);
        // the piece's check waits for the whole drop's answer; a late one still checks it
        const relation = relatedInTime.then(async (hit) => {
          if (hit === undefined) {
            void related.then((late) => late && relatePiece());
            return;
          }
          if (!hit) return;
          const call = relatePiece();
          if (call) await within(call, timeLeft());
        });
        if (!details || !words) {
          await relation;
          return;
        }
        asked += 1;
        const [enrichment, title] = await Promise.all([
          within(details, timeLeft()),
          within(words, timeLeft()),
          relation,
          within(filing, timeLeft()),
        ]);
        if (enrichment === undefined) late += 1;

        // the title call only rewrites a long or messy piece; its reaction is not shown
        const putTitle = (w: { smartTitle: string | null } | null | undefined) =>
          w?.smartTitle
            ? updateDropWords(
                saved,
                { smartTitle: w.smartTitle, reaction: null },
                wordsAsTitle(piece.text),
              )
            : Promise.resolve(false);
        if (title === undefined) void words.promise.then(putTitle);
        else await putTitle(title);

        if (enrichment === undefined) {
          await settleDropRow(saved);
          void details.promise.then((late) =>
            late
              ? updateDropDetails(saved, drop, late, {
                  settle: false,
                  kind,
                  base: piece.base ?? null,
                })
              : false,
          );
        } else {
          await updateDropDetails(saved, drop, enrichment, {
            settle: true,
            kind,
            base: piece.base ?? null,
          });
        }
      } catch (err) {
        console.warn('[Split] a piece could not be filled; it settles as it is', {
          piece: piece.dropId,
          error: String(err),
        });
        await settleDropRow(saved).catch(() => false);
      }
    }),
  );
  if (!asked) return 'not_asked';
  return late ? 'after_settle' : 'in_time';
}

/** A piece's (or a kept item's) reminder, when the drop asked for one: saved when it lands. */
function whenPieceReminderLands(drop: QueuedDrop, saved: SavedDropRow, kind: DropKind): void {
  const call = startDropReminder(drop, kind);
  if (!call) return;
  void call.promise.then(
    (reminder) => scheduleDropReminder(saved, reminder),
    (err) =>
      console.warn('[Split] a reminder call did not answer', {
        piece: drop.localId,
        error: String(err),
      }),
  );
}

/** The pieces an unsure split keeps in views.split, as the queue keeps them. */
function segmentsOf(pieces: Array<Record<string, any>>): MultiSegment[] {
  return pieces.map((p) => ({
    text: String(p.text || ''),
    bucket: (p.bucket === 'todo' || p.bucket === 'habit' ? p.bucket : 'log') as MindDropBucket,
    subtype: (p.subtype ?? null) as LogSubtype | null,
    habitSubtype: (p.habit_subtype ?? null) as HabitSubtype | null,
    needsClarification: p.needs_clarification === true,
    ambiguityType: p.ambiguity_type ?? null,
    clarificationQuestion: p.clarification_question ?? null,
    clarificationOptions: (p.clarification_options as unknown[] | null) ?? null,
  }));
}

/** An item's own kind, as the classifier's kinds are written. */
function kindOfItem(kind: Kind, item: Item): DropKind {
  if (kind === 'todo') return { bucket: 'todo', subtype: null, habitSubtype: null };
  if (kind === 'habit') {
    return {
      bucket: 'habit',
      subtype: null,
      habitSubtype: (item.subtype ?? 'start_habit') as HabitSubtype,
    };
  }
  const sub = item.subtype === 'catchall' || !item.subtype ? 'general' : item.subtype;
  return { bucket: 'log', subtype: sub as LogSubtype, habitSubtype: null };
}

/** The item as a drop, for the save of its pieces. */
function parentOf(kind: Kind, item: Item, segments: MultiSegment[]): QueuedDrop {
  const views = (item.views || {}) as Record<string, any>;
  const text = String(item.body || item.text || item.notes || item.title || item.name || '');
  return {
    localId: String(item.drop_id || item.id),
    text,
    source: 'minddrop',
    spaceId: item.space_id ?? null,
    createdAt: item.created_at ?? nowTimestamp(),
    status: 'queued',
    phase: 'saved',
    retryCount: 0,
    classifyEngine: views.classify_engine === 'v2' ? 'v2' : 'v3',
    smartTitle: String(item.title || item.name || wordsAsTitle(text)),
    multiSegments: segmentsOf(segments as unknown as Array<Record<string, any>>),
    isMulti: true,
    split: 'unsure',
    splitSaid: classifierSaidOf(views.split?.classifier_said),
    // the one item's kind is the drop's kind as one; a remind me carries over to the pieces
    asOne: kindOfItem(kind, item),
    reminderIntent: views.reminder_intent === true,
    entityType: kind,
    supabaseId: item.id,
  } as QueuedDrop;
}

/**
 * Split, on an unsure split's card: its pieces are saved as their own items
 * where the card was, the one item is archived ('split'), and each piece is
 * filled and filed. Marked first, so a second tap cannot split twice. If the
 * pieces or the archive cannot be saved, it is put back as it was: the pieces
 * saved so far are removed (they were made a moment ago by this tap) and the
 * question is asked again.
 */
export async function splitDropNow(id: string): Promise<SavedPieceRow[]> {
  const found = findItem(id);
  if (!found) throw new PlainError('That one is no longer on your list.');
  const { kind, item } = found;
  const split = ((item.views || {}) as Record<string, any>).split as
    | {
        status?: string;
        pieces?: Array<Record<string, any>>;
        related?: boolean;
        classifier_said?: string | null;
      }
    | undefined;
  const pieces = Array.isArray(split?.pieces) ? split!.pieces : [];
  if (pieces.length < 2) throw new PlainError('There is nothing to split here.');

  const marked = await updateDropRow(kind, item.id, 'split_now', (row) => {
    const views = (row.views as Record<string, any>) || {};
    if (views.split?.status !== 'pending') return null;
    return { views: { ...views, split: { ...views.split, status: 'split' } } };
  });
  if (!marked) throw new PlainError('This one has already been sorted.');

  const parent = parentOf(kind, item, pieces as unknown as MultiSegment[]);
  let saved: SavedPieceRow[];
  try {
    saved = await insertSplitPieces(parent, { said: 'unsure', at: item.created_at ?? null });
    await archive(kind, item.id, 'split');
  } catch (err) {
    console.warn('[Split] the split did not go through; putting it back', {
      id: item.id,
      error: String(err),
    });
    for (const p of piecesOf(parent.localId)) {
      await removeItem(p.kind, p.item.id).catch((e) =>
        console.warn('[Split] a piece saved before the failure could not be removed', {
          piece: p.item.id,
          error: String(e),
        }),
      );
    }
    await updateDropRow(kind, item.id, 'split_failed', (row) => {
      const views = (row.views as Record<string, any>) || {};
      return { views: { ...views, split: { ...views.split, status: 'pending' } } };
    }).catch(() => false);
    throw err;
  }
  logSplitAnswer(
    'unsure',
    'split',
    saved.length,
    { type: kind, id: item.id },
    classifierSaidOf(split?.classifier_said),
  );
  // each piece is filled and filed as it would be from a drop
  void fillPieces(parent, saved, {
    deadline: now() + SPLIT_SETTLE_MS,
    related: relatedOf(parent.localId, split?.related),
  });
  return saved;
}

/**
 * Whether the whole drop's already have it check found something: kept on
 * views.split once it landed, else the check still in memory (a Split tapped
 * before it landed), else false (after a restart, as for any drop).
 */
function relatedOf(localId: string, kept: boolean | undefined): Promise<boolean> | boolean {
  if (typeof kept === 'boolean') return kept;
  const call = startedDropRelation(localId);
  return call
    ? call.promise.then(
        (r) => !!r,
        () => false,
      )
    : false;
}

async function removeItem(kind: Kind, id: string): Promise<void> {
  const s = useGremlyStore.getState();
  if (kind === 'todo') await s.deleteTodo(id);
  else if (kind === 'habit') await s.deleteHabit(id);
  else await s.deleteNote(id);
}

/** Keep as one, on an unsure split's card: the one item stays as it is. */
export async function keepSplitAsOne(id: string): Promise<boolean> {
  const found = findItem(id);
  if (!found) return false;
  let count = 0;
  let said: SplitSaid | null = null;
  const wrote = await updateDropRow(found.kind, found.item.id, 'keep_as_one', (row) => {
    const views = (row.views as Record<string, any>) || {};
    if (views.split?.status !== 'pending') return null;
    count = Array.isArray(views.split.pieces) ? views.split.pieces.length : 0;
    said = classifierSaidOf(views.split.classifier_said);
    return { views: { ...views, split: { ...views.split, status: 'kept' } } };
  });
  if (wrote)
    logSplitAnswer('unsure', 'keep_as_one', count, { type: found.kind, id: found.item.id }, said);
  return wrote;
}

/** Splits kept as one in this session: their note comes in where the pieces were (RecentDrops). */
export const keptGroupsNow = new Set<string>();

/** The pieces of a split still on the list, in their order. */
export function piecesOf(groupId: string): Array<{ kind: Kind; item: Item }> {
  const s = useGremlyStore.getState() as unknown as Record<string, Item[]>;
  const out: Array<{ kind: Kind; item: Item }> = [];
  for (const [kind, list] of [
    ['todo', s.todos],
    ['habit', s.habits],
    ['note', s.notes],
  ] as Array<[Kind, Item[]]>) {
    for (const item of list || []) {
      const group = (item.views || {}).split_group;
      if (group?.id === groupId && item.archived !== true) out.push({ kind, item });
    }
  }
  return out.sort(
    (a, b) => (a.item.views.split_group.index ?? 0) - (b.item.views.split_group.index ?? 0),
  );
}

/**
 * Keep as one, under a clear split's pieces: one item of the kind the
 * classifier gave the drop as one (split_group.as_one), with the drop's words
 * as its title in sentence case (as the prototype's), settled with Kept as one
 * where the pieces were, and the pieces archived ('kept_as_one'). Its details,
 * filing and reminder run as a piece's do (fillPieces), and land on it when
 * they come. A split saved before as_one was kept, or one the classifier gave
 * no kind as one, is kept as a note, logged. Throws when the item cannot be
 * saved (the pieces stay). Resolves to the item, its kind word, and the pieces
 * archived; a piece that could not be archived is in `stayed` and stays on the list.
 */
export async function keepPiecesAsOne(groupId: string): Promise<{
  itemId: string;
  kindWord: ReturnType<typeof kindWordOf>;
  pieceIds: string[];
  stayed: string[];
} | null> {
  const pieces = piecesOf(groupId);
  if (!pieces.length) return null;
  const group = pieces[0].item.views.split_group as {
    text?: string;
    count?: number;
    said?: SplitSaid;
    classifier_said?: string | null;
    at?: string;
    as_one?: DropKind | null;
  };
  const text = String(group.text || '');
  const dropId = `kept-${groupId}`;
  const asOne = readAsOne(group.as_one);
  if (!asOne) {
    console.warn('[Split] Keep as one: no kind as one was kept for this split; kept as a note', {
      groupId,
    });
  }
  const kind: DropKind = asOne ?? { bucket: 'log', subtype: 'general', habitSubtype: null };
  // the item takes the pieces' place on the list
  const at = group.at ?? pieces[0].item.created_at ?? null;
  const parent = {
    localId: dropId,
    text,
    source: 'minddrop',
    spaceId: pieces[0].item.space_id ?? null,
    createdAt: at ?? nowTimestamp(),
    status: 'queued',
    phase: 'saved',
    retryCount: 0,
    classifyEngine: 'v3',
    bucket: kind.bucket,
    subtype: kind.subtype,
    habitSubtype: kind.habitSubtype,
    // a remind me heard on the drop carries over to the item it is kept as
    reminderIntent: pieces.some((p) => p.item.views?.reminder_intent === true),
  } as QueuedDrop;
  keptGroupsNow.add(groupId);
  const result = await syncDropToSupabase(parent, null, {
    stage: 'settled',
    title: wordsAsTitle(text),
    kind,
    dropId,
    text,
    extraViews: {
      kept_as_one: { group: groupId, count: group.count ?? pieces.length, ...(at ? { at } : {}) },
    },
  });
  if (!result.success || !result.supabaseId || !result.entityType) {
    console.warn('[Split] Keep as one: the item could not be saved; the pieces stay', {
      groupId,
      error: String(result.error?.message ?? result.error ?? ''),
    });
    throw new PlainError(DIDNT_GO);
  }
  const saved: SavedDropRow = { entityType: result.entityType, id: result.supabaseId };
  fillKept(
    { ...parent, supabaseId: saved.id, entityType: saved.entityType },
    saved,
    kind,
    detailBaseOf(saved.entityType, result.row),
  );
  const archived: string[] = [];
  const stayed: string[] = [];
  for (const p of pieces) {
    try {
      await archive(p.kind, p.item.id, 'kept_as_one');
      archived.push(p.item.id);
    } catch (err) {
      console.warn('[Split] a piece kept as one could not be archived; it stays', {
        piece: p.item.id,
        error: String(err),
      });
      stayed.push(p.item.id);
    }
  }
  logSplitAnswer(
    group.said ?? 'clear',
    'keep_as_one',
    pieces.length,
    { type: saved.entityType, id: saved.id },
    classifierSaidOf(group.classifier_said),
  );
  return {
    itemId: saved.id,
    kindWord: kindWordOf(kind.bucket, kind.subtype),
    pieceIds: archived,
    stayed,
  };
}

/** split_group.as_one, as saved; null when it is missing or not a kind. */
function readAsOne(raw: unknown): DropKind | null {
  const k = raw as Record<string, any> | null | undefined;
  if (!k || typeof k !== 'object') return null;
  if (k.bucket === 'todo') return { bucket: 'todo', subtype: null, habitSubtype: null };
  if (k.bucket === 'habit') {
    return {
      bucket: 'habit',
      subtype: null,
      habitSubtype: (k.habitSubtype ?? 'start_habit') as HabitSubtype,
    };
  }
  if (k.bucket === 'log') {
    return { bucket: 'log', subtype: (k.subtype ?? 'general') as LogSubtype, habitSubtype: null };
  }
  return null;
}

/**
 * The kept item's details, filing and reminder, as a piece's (fillPieces): it
 * is on the list settled already, so each lands on it when it comes. Never rejects.
 */
function fillKept(
  drop: QueuedDrop,
  saved: SavedDropRow,
  kind: DropKind,
  base: ReturnType<typeof detailBaseOf>,
): void {
  try {
    void startDropFiling(drop);
    whenPieceReminderLands(drop, saved, kind);
    const details = startDropDetails(drop, kind);
    void details.promise.then(
      (enrichment) =>
        enrichment
          ? updateDropDetails(saved, drop, enrichment, { settle: false, kind, base: base ?? null })
          : false,
      (err) =>
        console.warn('[Split] the kept item’s details did not come', {
          id: saved.id,
          error: String(err),
        }),
    );
  } catch (err) {
    console.warn('[Split] the kept item could not be filled; it stays as it is', {
      id: saved.id,
      error: String(err),
    });
  }
}
