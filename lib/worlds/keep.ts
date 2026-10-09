/**
 * Save from chat (Worlds rebuild, stage 2, decision 3). Under a reply worth
 * keeping, Gremly puts a Save button naming the Chapter or World it belongs
 * in (cortex context/keep.js decides, after every reply). One tap keeps it
 * there as a note, or as a list with tick boxes that stays on the Chapter and
 * never floods Today; a small arrow picks somewhere else. Undo takes it away
 * again while the chat is open.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import type { Note } from '../types';
import type { Chapter, World } from '../supabase/types';
import { isOpenChapter, isShownWorld, worldName } from './model';
import type { Undo } from './actions';
import { markWorldsNew } from './dot';

export interface KeepPlace {
  type: 'world' | 'chapter';
  id: string;
  name: string;
}

/** What a reply holds that is worth keeping, and where it belongs. */
export interface KeepOffer {
  kind: 'note' | 'list';
  title: string;
  lines: string[];
  place: KeepPlace | null;
  version?: string;
}

/** The page a World's or a Chapter's own chat is on, as a place to keep things. */
export function pagePlace(
  anchor: { type?: string; id?: string; title?: string } | null | undefined,
): KeepPlace | null {
  if (!anchor?.id || (anchor.type !== 'world' && anchor.type !== 'chapter')) return null;
  return { type: anchor.type, id: anchor.id, name: String(anchor.title || '').trim() };
}

/**
 * The offer as cortex sent it, made safe to keep on the message: only lines
 * of words, and the page it was said on when Gremly named no place.
 */
export function keepOfferFrom(raw: unknown, page: KeepPlace | null): KeepOffer | null {
  const r = raw as Partial<KeepOffer> | null | undefined;
  const title = typeof r?.title === 'string' ? r.title.trim() : '';
  const lines = (Array.isArray(r?.lines) ? r.lines : [])
    .filter((l): l is string => typeof l === 'string' && !!l.trim())
    .map((l) => l.trim());
  if (!title || !lines.length) return null;
  const p = r?.place;
  const place =
    p && (p.type === 'world' || p.type === 'chapter') && typeof p.id === 'string'
      ? { type: p.type, id: p.id, name: String(p.name || '').trim() }
      : page;
  return {
    kind: r?.kind === 'list' ? 'list' : 'note',
    title,
    lines,
    place,
    ...(typeof r?.version === 'string' ? { version: r.version } : {}),
  };
}

function store(): any {
  return useGremlyStore.getState();
}

/**
 * The place as it is now: an open Chapter or a World they see, with its name
 * as it reads now; null when it has closed, been hidden or gone.
 */
export function placeNow(place: KeepPlace | null | undefined): KeepPlace | null {
  if (!place) return null;
  const s = store();
  if (place.type === 'chapter') {
    const c = (s.chapters ?? []).find((x: Chapter) => x.id === place.id);
    return c && isOpenChapter(c) ? { ...place, name: String(c.title || place.name) } : null;
  }
  const w = (s.worlds ?? []).find((x: World) => x.id === place.id);
  return w && isShownWorld(w) ? { ...place, name: worldName(w) } : null;
}

/** The note a keep makes: a list keeps its tick boxes, a note its lines. */
export function keptNote(offer: KeepOffer, rand: () => string = randomBit): Partial<Note> {
  const base = {
    title: offer.title,
    subtype: 'general' as Note['subtype'],
    ai_placed: true,
    origin: 'chat_save' as const,
  };
  if (offer.kind === 'list') {
    return {
      ...base,
      body: '',
      has_list: true,
      list_items: offer.lines.map((text, i) => ({
        id: `item-${i}-${rand()}`,
        text,
        checked: false,
      })),
    };
  }
  return { ...base, body: offer.lines.join('\n') };
}

const randomBit = () => Math.random().toString(36).slice(2, 8);

// what each saved message can take away again, while the app is open
const undos = new Map<string, Undo>();

/** Keep it in that place. Throws when it could not be kept, with nothing left half made. */
export async function saveKept(
  messageId: string,
  offer: KeepOffer,
  place: KeepPlace,
): Promise<Note> {
  const s = store();
  const note: Note = await s.createNote(keptNote(offer));
  try {
    const placed: Undo = await s.placeItem(
      { id: note.id, type: 'note' },
      place.type === 'chapter' ? { chapterId: place.id } : { worldId: place.id },
    );
    undos.set(messageId, async () => {
      await placed();
      await store().deleteNote(note.id);
    });
    markWorldsNew();
    return note;
  } catch (err) {
    await s.deleteNote(note.id).catch(() => undefined);
    throw err;
  }
}

/** Whether what this message saved can still be taken away. */
export const canUndoKept = (messageId: string) => undos.has(messageId);

/** Take away what this message saved. Throws when it could not be. */
export async function undoKept(messageId: string): Promise<void> {
  const undo = undos.get(messageId);
  if (!undo) return;
  await undo();
  undos.delete(messageId);
}
