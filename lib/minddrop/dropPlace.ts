/**
 * dropPlace.ts: where a drop lives, in a word, for the last part of its card's
 * meta line (Mind Drop rethink stage 9, the Worlds handoff's filing chip): the
 * Chapter's title when it is in one, otherwise the World's name, otherwise
 * nothing. Nothing filed means no place and no question.
 *
 * Read from the drop's links as the store has them: Gremly's filing of a new
 * drop is put there as it replies (fileDrop.ts), and the person's own choice
 * (WorldsChapterPicker, assigned_by 'user') comes first. A closed Chapter or an
 * archived World is not shown. Pure, so the Worlds build can reuse it.
 */
import type { Chapter, DropChapterLink, DropWorldLink, World } from '../supabase/types';

export interface DropPlace {
  kind: 'chapter' | 'world';
  id: string;
  name: string;
}

type Link = { drop_id: string; assigned_by?: string | null; created_at?: string | null };

/** The person's own first, then the newest. */
function inOrder<L extends Link>(links: L[]): L[] {
  const mine = (l: L) => (l.assigned_by === 'user' ? 1 : 0);
  return [...links].sort(
    (a, b) =>
      mine(b) - mine(a) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );
}

export function dropPlaceOf(
  id: string | null | undefined,
  from: {
    worldLinks: ReadonlyArray<DropWorldLink>;
    chapterLinks: ReadonlyArray<DropChapterLink>;
    worlds: ReadonlyArray<Pick<World, 'id' | 'name' | 'display_name' | 'phase'>>;
    chapters: ReadonlyArray<Pick<Chapter, 'id' | 'title' | 'phase'>>;
  },
): DropPlace | null {
  if (!id) return null;
  for (const link of inOrder(from.chapterLinks.filter((l) => l.drop_id === id))) {
    const chapter = from.chapters.find((c) => c.id === link.chapter_id);
    if (chapter && chapter.phase !== 'closed' && chapter.title) {
      return { kind: 'chapter', id: chapter.id, name: chapter.title };
    }
  }
  for (const link of inOrder(from.worldLinks.filter((l) => l.drop_id === id))) {
    const world = from.worlds.find((w) => w.id === link.world_id);
    const name = world?.display_name || world?.name;
    if (world && world.phase !== 'archived' && name) {
      return { kind: 'world', id: world.id, name };
    }
  }
  return null;
}
