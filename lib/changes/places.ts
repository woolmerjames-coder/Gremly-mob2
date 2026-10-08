/**
 * Changes to Worlds and Chapters themselves (Worlds rebuild, stage 2): their
 * words on the card, and applying one once the person taps. Each is made with
 * the same store actions the Worlds screens use (lib/worlds/actions.ts), so
 * it is written, synced and undone the same way, and Gremly is told of it.
 *
 * Rules, as for every change: nothing the person changed since is written
 * over (a field no longer as the card showed it stops the change), a change
 * that fails is reported and never claimed, and nothing is deleted: a Chapter
 * started from a card is taken away again by its Undo, and a World is only
 * ever hidden.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { DEFAULT_MASCOT_SLUG } from '../store/mascotRegistry';
import { placeBefore, type Change } from './model';
import type { Undo } from '../worlds/actions';
import { dateWords } from '../worlds/model';

export type PlaceType = 'world' | 'chapter';

/** A change to a World or a Chapter rather than to an item. */
export const isPlaceChange = (c: Pick<Change, 'type'>): boolean =>
  c.type === 'world' || c.type === 'chapter';

type Row = Record<string, any>;
type Fields = Record<string, any>;

function store(): any {
  return useGremlyStore.getState();
}

function rowOf(type: PlaceType, id: string | null | undefined): Row | null {
  if (!id) return null;
  const list = type === 'world' ? store().worlds : store().chapters;
  return (list ?? []).find((r: Row) => r.id === id) ?? null;
}

function worldNameOf(id: string | null | undefined): string {
  const w = rowOf('world', id);
  return String(w?.display_name || w?.name || '').trim() || 'a World';
}

// ── Words ───────────────────────────────────────────────────────────────────

/** The dates a Chapter will have once the change is made, in words. */
function datesAfter(change: Change, row: Row | null): string {
  const f: Fields = change.fields ?? {};
  const start = 'start_day' in f ? f.start_day : (row?.start_date ?? null);
  const end = 'end_day' in f ? f.end_day : (row?.end_date ?? null);
  return dateWords({ start_date: start, end_date: end }) || 'no date';
}

const things = (n: number) => (n === 1 ? 'one of your things' : `${n} of your things`);

function chapterPhrases(change: Change, row: Row | null): string[] {
  const f: Fields = change.fields ?? {};
  const out: string[] = [];
  if ('name' in f && change.op !== 'add') out.push(`renamed “${f.name}”`);
  if ('world' in f) out.push(`${change.op === 'add' ? 'in' : 'into'} ${worldNameOf(f.world)}`);
  if ('start_day' in f || 'end_day' in f) out.push(datesAfter(change, row));
  if ('words' in f) out.push(f.words ? `in your words: “${f.words}”` : 'its words cleared');
  if ('gremly' in f)
    out.push(f.gremly ? 'a Gremly outfit of its own' : 'wearing its World’s Gremly');
  if (Array.isArray(f.items) && f.items.length) out.push(`with ${things(f.items.length)}`);
  return out;
}

function worldPhrases(change: Change): string[] {
  const f: Fields = change.fields ?? {};
  const out: string[] = [];
  if ('name' in f && change.op !== 'add') out.push(`renamed “${f.name}”`);
  if ('words' in f) out.push(f.words ? `in your words: “${f.words}”` : 'its words cleared');
  if ('gremly' in f && change.op !== 'add') out.push('a new Gremly outfit');
  return out;
}

const onlyField = (change: Change, field: string) => {
  const keys = Object.keys(change.fields ?? {});
  return keys.length === 1 && keys[0] === field;
};

/** One line for a World's or a Chapter's row on a card. */
export function placeRowWords(change: Change): string {
  const t = change.title;
  const row = change.type === 'chapter' ? rowOf('chapter', change.id) : null;
  if (change.type === 'chapter') {
    switch (change.op) {
      case 'add':
        return [`Start a Chapter “${t}”`, ...chapterPhrases(change, null)].join(', ');
      case 'change':
        if (onlyField(change, 'name')) return `Rename ${t} to “${change.fields?.name}”`;
        if (onlyField(change, 'world'))
          return `Move ${t} into ${worldNameOf(change.fields?.world)}`;
        return `${t}: ${chapterPhrases(change, row).join(', ')}`;
      case 'close':
        return `Close ${t}, so it becomes part of your story`;
      case 'reopen':
        return `Open ${t} again`;
      default:
        return t;
    }
  }
  switch (change.op) {
    case 'add':
      return `Start a World “${t}”`;
    case 'change':
      if (onlyField(change, 'name')) return `Rename ${t} to “${change.fields?.name}”`;
      return `${t}: ${worldPhrases(change).join(', ')}`;
    case 'merge':
      return `Merge ${t} into ${change.into_title || worldNameOf(change.into)}, with everything in it`;
    case 'archive':
      return `Hide ${t}. Nothing in it is deleted`;
    case 'restore':
      return `Bring back ${t}`;
    default:
      return t;
  }
}

/** The button on a card with this one change. */
export function placeButtonWords(change: Change): string {
  switch (change.op) {
    case 'add':
      return change.type === 'chapter' ? 'Yes, start it' : 'Yes, make it';
    case 'change':
      if (onlyField(change, 'name')) return 'Yes, rename it';
      if (onlyField(change, 'world')) return 'Yes, move it';
      if (change.fields && ('start_day' in change.fields || 'end_day' in change.fields))
        return 'Yes, change the dates';
      return 'Yes, change it';
    case 'close':
      return 'Yes, close it';
    case 'reopen':
      return 'Yes, open it again';
    case 'merge':
      return 'Yes, merge them';
    case 'archive':
      return 'Yes, hide it';
    case 'restore':
      return 'Yes, bring it back';
    default:
      return 'Yes, do it';
  }
}

/** The closing line once it is done. */
export function placeDoneWords(change: Change): string {
  const t = change.title;
  switch (change.op) {
    case 'add':
      return change.type === 'chapter' ? `Started ${t}.` : `Made ${t}.`;
    case 'change':
      if (onlyField(change, 'name')) return `Renamed to ${change.fields?.name}.`;
      if (onlyField(change, 'world')) return `${t} is in ${worldNameOf(change.fields?.world)} now.`;
      return `${t} is changed.`;
    case 'close':
      return `${t} is closed and part of your story.`;
    case 'reopen':
      return `${t} is open again.`;
    case 'merge':
      return `${t} is merged into ${change.into_title || worldNameOf(change.into)}.`;
    case 'archive':
      return `${t} is hidden.`;
    case 'restore':
      return `${t} is back.`;
    default:
      return 'Done.';
  }
}

// ── Applying ────────────────────────────────────────────────────────────────

export type PlaceOutcome =
  | { ok: true; revert: Undo; createdId?: string }
  | { ok: false; reason: 'stale' | 'gone'; message: string };

/** Undo several steps of one change, the last made first. */
function together(undos: Undo[]): Undo {
  return async () => {
    for (const u of [...undos].reverse()) await u();
  };
}

/** A field the card showed as "before" that has changed since. */
export function stalePlaceField(change: Change, row: Row): string | null {
  for (const field of Object.keys(change.before ?? {})) {
    const now = placeBefore(change.type as string, row, field);
    if ((now ?? null) !== (change.before?.[field] ?? null)) return field;
  }
  return null;
}

/** Run each step in order; when one fails, put back the ones made and throw. */
async function inOrder(steps: Array<() => Promise<Undo>>): Promise<Undo> {
  const made: Undo[] = [];
  try {
    for (const step of steps) made.push(await step());
  } catch (err) {
    await together(made)().catch(() => undefined);
    throw err;
  }
  return together(made);
}

/**
 * Apply one change to a World or a Chapter. Throws when a write fails, with
 * the screen already put back by the action.
 */
export async function applyPlace(change: Change): Promise<PlaceOutcome> {
  const s = store();
  const type = change.type as PlaceType;
  const f: Fields = change.fields ?? {};
  const word = type === 'chapter' ? 'Chapter' : 'World';

  if (change.op === 'add') {
    if (type === 'chapter') {
      const { chapter, undo } = await s.makeChapter({
        title: f.name,
        worldId: f.world ?? null,
        startDate: f.start_day ?? null,
        endDate: f.end_day ?? null,
        gremly: f.gremly ?? null,
        items: Array.isArray(f.items) ? f.items : [],
      });
      return { ok: true, revert: undo, createdId: chapter.id };
    }
    const { world, undo } = await s.makeWorld({
      name: f.name,
      gremly: f.gremly || DEFAULT_MASCOT_SLUG,
    });
    return { ok: true, revert: undo, createdId: world.id };
  }

  const id = change.id as string;
  const row = rowOf(type, id);
  if (!row) return { ok: false, reason: 'gone', message: `That ${word} is no longer here.` };
  if (change.op === 'change' && stalePlaceField(change, row)) {
    return {
      ok: false,
      reason: 'stale',
      message: `${change.title} changed since, so it was left as it is.`,
    };
  }

  if (type === 'chapter') {
    switch (change.op) {
      case 'change': {
        const steps: Array<() => Promise<Undo>> = [];
        if ('name' in f) steps.push(() => s.renameChapter(id, f.name));
        if ('start_day' in f || 'end_day' in f) {
          const start = 'start_day' in f ? f.start_day : (row.start_date ?? null);
          const end = 'end_day' in f ? f.end_day : (row.end_date ?? null);
          steps.push(() => s.setChapterDates(id, start, end));
        }
        if ('world' in f) steps.push(() => s.moveChapter(id, f.world));
        if ('words' in f) steps.push(() => s.setChapterWords(id, f.words ?? ''));
        if ('gremly' in f) steps.push(() => s.setChapterGremly(id, f.gremly ?? null));
        return { ok: true, revert: await inOrder(steps) };
      }
      case 'close': {
        const undo = await s.closeChapter(id);
        // the memory is written once it has closed; the Chapter shows it when it comes
        s.askForMemory(id).catch((err: unknown) =>
          console.warn('[changes] the memory could not be written:', err),
        );
        return { ok: true, revert: undo };
      }
      case 'reopen':
        return { ok: true, revert: await s.reopenChapter(id) };
      default:
        throw new Error('That is not something a Chapter can do.');
    }
  }

  switch (change.op) {
    case 'change': {
      const steps: Array<() => Promise<Undo>> = [];
      if ('name' in f) steps.push(() => s.renameWorld(id, f.name));
      if ('words' in f) steps.push(() => s.setWorldWords(id, f.words ?? ''));
      if ('gremly' in f && f.gremly) steps.push(() => s.setWorldGremly(id, f.gremly));
      return { ok: true, revert: await inOrder(steps) };
    }
    case 'merge':
      if (!rowOf('world', change.into))
        return {
          ok: false,
          reason: 'gone',
          message: 'The World it was going into is no longer here.',
        };
      return { ok: true, revert: await s.mergeWorlds(change.into, id) };
    case 'archive':
      return { ok: true, revert: await s.hideWorld(id) };
    case 'restore':
      return { ok: true, revert: await s.unhideWorld(id) };
    default:
      throw new Error('That is not something a World can do.');
  }
}
