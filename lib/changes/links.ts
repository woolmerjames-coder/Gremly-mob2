/**
 * Linking an item to Worlds and Chapters, the way the item screen's picker
 * does (components/overlay/WorldsChapterPicker): rows in drop_world_links and
 * drop_chapter_links marked as the person's own choice, and the store updated
 * straight away.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { nowTimestamp } from '../date/DateService';
import {
  deleteDropChapterLink,
  deleteDropWorldLink,
  upsertDropChapterLinks,
  upsertDropWorldLinks,
} from '../repo/linkingRepo';
import type { ItemType } from './model';
import { noteTakenOut } from '../worlds/removals';
import type { FiledItem } from '../worlds/actions';
import type { LinkOps } from './patch';

type Links = { worlds?: LinkOps; chapters?: LinkOps };

function row(
  kind: 'worlds' | 'chapters',
  dropId: string,
  dropType: ItemType,
  target: string,
  ownerId: string,
) {
  const base = {
    drop_id: dropId,
    drop_type: dropType,
    owner_id: ownerId,
    relevance_score: 1.0,
    assigned_by: 'user' as const,
    reason: null,
  };
  return kind === 'worlds' ? { ...base, world_id: target } : { ...base, chapter_id: target };
}

/** Link and unlink; resolves with the Undo that puts the links back. */
export async function applyLinks(
  type: ItemType,
  id: string,
  links: Links,
): Promise<() => Promise<void>> {
  const ownerId = (useGremlyStore.getState() as any).userId as string | undefined;
  if (!ownerId) throw new Error('Not signed in.');
  const w = links.worlds ?? { add: [], remove: [] };
  const c = links.chapters ?? { add: [], remove: [] };

  if (w.add.length)
    await upsertDropWorldLinks(w.add.map((t) => row('worlds', id, type, t, ownerId) as any));
  for (const t of w.remove) await deleteDropWorldLink(id, t);
  if (c.add.length)
    await upsertDropChapterLinks(c.add.map((t) => row('chapters', id, type, t, ownerId) as any));
  for (const t of c.remove) await deleteDropChapterLink(id, t);
  // what they took out is remembered, so Gremly's filing never puts it back (lib/worlds/removals.ts)
  await noteTakenOut(ownerId, { id, type } as FiledItem, {
    out: [
      ...w.remove.map((t) => ({ type: 'world' as const, id: t })),
      ...c.remove.map((t) => ({ type: 'chapter' as const, id: t })),
    ],
    in: [
      ...w.add.map((t) => ({ type: 'world' as const, id: t })),
      ...c.add.map((t) => ({ type: 'chapter' as const, id: t })),
    ],
  });

  useGremlyStore.setState((state: any) => ({
    dropWorldLinks: [
      ...state.dropWorldLinks.filter(
        (l: any) => !(l.drop_id === id && w.remove.includes(l.world_id)),
      ),
      ...w.add.map((t) => ({
        ...row('worlds', id, type, t, ownerId),
        created_at: nowTimestamp(),
        last_confirmed_at: null,
      })),
    ],
    dropChapterLinks: [
      ...state.dropChapterLinks.filter(
        (l: any) => !(l.drop_id === id && c.remove.includes(l.chapter_id)),
      ),
      ...c.add.map((t) => ({
        ...row('chapters', id, type, t, ownerId),
        created_at: nowTimestamp(),
        last_confirmed_at: null,
      })),
    ],
  }));

  return async () => {
    await applyLinks(type, id, {
      worlds: { add: w.remove, remove: w.add },
      chapters: { add: c.remove, remove: c.add },
    });
  };
}

/** Whether a change has any links to make. */
export function hasLinks(links: Links): boolean {
  return !!(
    links.worlds?.add.length ||
    links.worlds?.remove.length ||
    links.chapters?.add.length ||
    links.chapters?.remove.length
  );
}

/** Copy an item's links to the item it became. */
export async function copyLinks(type: ItemType, fromId: string, toId: string): Promise<void> {
  const s = useGremlyStore.getState() as any;
  const worlds = (s.dropWorldLinks ?? [])
    .filter((l: any) => l.drop_id === fromId)
    .map((l: any) => l.world_id);
  const chapters = (s.dropChapterLinks ?? [])
    .filter((l: any) => l.drop_id === fromId)
    .map((l: any) => l.chapter_id);
  if (!worlds.length && !chapters.length) return;
  await applyLinks(type, toId, {
    worlds: { add: worlds, remove: [] },
    chapters: { add: chapters, remove: [] },
  });
}
