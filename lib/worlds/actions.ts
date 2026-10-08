/**
 * Everything a person can do to their Worlds and Chapters by hand (Worlds
 * rebuild, stage 1). Joined to the store in useGremlyStore.ts.
 *
 * Every action changes the screen at once, writes to the database, puts the
 * screen back and throws if the write fails, marks what the person wrote as
 * theirs so Gremly never writes over it (each field's _source), tells Gremly
 * about the change (cortex worlds-changed: chat's cache is cleared and fresh
 * words are asked for), and hands back its Undo. Nothing here asks Gremly to
 * decide anything; a closed Chapter's memory is asked for separately
 * (askForMemory), once the close has landed.
 *
 * Deleting a World or a Chapter never deletes what is in it: only the World
 * or Chapter and its links go, and Undo puts both back.
 */
import { supabase } from '../supabase/client';
import { callChapterMemory, callWorldsChanged } from '../cortex/CortexClient';
import { getDateService, nowTimestamp } from '../date/DateService';
import type { Chapter, DropChapterLink, DropWorldLink, World } from '../supabase/types';
import { dayOf } from './model';

/** Puts a change back. */
export type Undo = () => Promise<void>;

/** The part of the store these actions read and write. */
export interface WorldsData {
  userId: string | null;
  worlds: World[];
  chapters: Chapter[];
  dropWorldLinks: DropWorldLink[];
  dropChapterLinks: DropChapterLink[];
}
type SetFn = (fn: (s: WorldsData) => Partial<WorldsData>) => void;
type GetFn = () => WorldsData;

export type FiledType = 'todo' | 'note' | 'habit';
export interface FiledItem {
  id: string;
  type: FiledType;
}

export interface NewChapter {
  title: string;
  worldId: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** A Gremly the person chose; none means it wears its World's */
  gremly?: string | null;
  /** Things the person already has that belong in it */
  items?: FiledItem[];
}

export interface WorldsActions {
  makeWorld: (input: { name: string; gremly: string }) => Promise<{ world: World; undo: Undo }>;
  renameWorld: (id: string, name: string) => Promise<Undo>;
  setWorldGremly: (id: string, slug: string) => Promise<Undo>;
  setWorldWords: (id: string, words: string) => Promise<Undo>;
  takeOfferedWorldWords: (id: string) => Promise<Undo>;
  hideWorld: (id: string) => Promise<Undo>;
  unhideWorld: (id: string) => Promise<Undo>;
  mergeWorlds: (keepId: string, goneId: string) => Promise<Undo>;
  deleteWorld: (id: string, chaptersTo: string | null) => Promise<Undo>;

  makeChapter: (input: NewChapter) => Promise<{ chapter: Chapter; undo: Undo }>;
  renameChapter: (id: string, title: string) => Promise<Undo>;
  setChapterDates: (id: string, startDate: string | null, endDate: string | null) => Promise<Undo>;
  moveChapter: (id: string, worldId: string) => Promise<Undo>;
  setChapterGremly: (id: string, slug: string | null) => Promise<Undo>;
  setChapterWords: (id: string, words: string) => Promise<Undo>;
  takeOfferedChapterWords: (id: string) => Promise<Undo>;
  setChapterMemory: (id: string, words: string) => Promise<Undo>;
  takeOfferedMemory: (id: string) => Promise<Undo>;
  closeChapter: (id: string) => Promise<Undo>;
  reopenChapter: (id: string) => Promise<Undo>;
  deleteChapter: (id: string) => Promise<Undo>;
  /** Ask Gremly to write a closed Chapter's memory; resolves to it, or null */
  askForMemory: (id: string) => Promise<string | null>;

  placeItem: (
    item: FiledItem,
    where: { worldId?: string | null; chapterId?: string | null },
  ) => Promise<Undo>;
  takeItemOut: (
    item: FiledItem,
    where: { worldId?: string | null; chapterId?: string | null },
  ) => Promise<Undo>;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Tell Gremly a World or Chapter changed. Never holds anything up. */
function tellGremly(table: 'worlds' | 'chapters', id: string) {
  callWorldsChanged({ table, id })
    .then((r) => {
      if (!r.ok) console.warn('[Worlds] Gremly was not told of the change:', r.error);
    })
    .catch((err) => console.warn('[Worlds] Gremly was not told of the change:', err));
}

/** The phase an open Chapter has from its dates: set for later, or under way. */
export function openPhase(
  startDate: string | null | undefined,
  today: string,
): 'upcoming' | 'active' {
  const s = dayOf(startDate);
  return s && s > today ? 'upcoming' : 'active';
}

function pick<T extends object>(row: T, keys: string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (row as Record<string, unknown>)[k] ?? null;
  return out as Partial<T>;
}

export function createWorldsActions(set: SetFn, get: GetFn): WorldsActions {
  const userId = () => {
    const id = get().userId;
    if (!id) throw new Error('Not signed in');
    return id;
  };
  const today = () => getDateService().today();

  const localWorld = (id: string, patch: Partial<World>) =>
    set((s) => ({ worlds: s.worlds.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const localChapter = (id: string, patch: Partial<Chapter>) =>
    set((s) => ({ chapters: s.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  /** Change some fields of a World, with the old values kept for Undo. */
  async function updateWorld(id: string, patch: Partial<World>): Promise<Undo> {
    const owner = userId();
    const before = get().worlds.find((w) => w.id === id);
    if (!before) throw new Error('That World is not here any more');
    const was = pick(before, Object.keys(patch));
    localWorld(id, patch);
    const { error } = await supabase
      .from('worlds')
      .update(patch)
      .eq('id', id)
      .eq('owner_id', owner);
    if (error) {
      localWorld(id, was);
      throw new Error(error.message);
    }
    tellGremly('worlds', id);
    return async () => {
      await updateWorld(id, was);
    };
  }

  /** Change some fields of a Chapter, with the old values kept for Undo. */
  async function updateChapter(id: string, patch: Partial<Chapter>): Promise<Undo> {
    const owner = userId();
    const before = get().chapters.find((c) => c.id === id);
    if (!before) throw new Error('That Chapter is not here any more');
    const was = pick(before, Object.keys(patch));
    localChapter(id, patch);
    const { error } = await supabase
      .from('chapters')
      .update(patch)
      .eq('id', id)
      .eq('owner_id', owner);
    if (error) {
      localChapter(id, was);
      throw new Error(error.message);
    }
    tellGremly('chapters', id);
    return async () => {
      await updateChapter(id, was);
    };
  }

  // ---- links ---------------------------------------------------------------

  async function addWorldLinks(rows: DropWorldLink[]) {
    if (!rows.length) return;
    const { error } = await supabase
      .from('drop_world_links')
      .upsert(rows, { onConflict: 'drop_id,drop_type,world_id' });
    if (error) throw new Error(error.message);
    set((s) => ({
      dropWorldLinks: [
        ...s.dropWorldLinks.filter(
          (l) =>
            !rows.some(
              (r) =>
                r.drop_id === l.drop_id && r.drop_type === l.drop_type && r.world_id === l.world_id,
            ),
        ),
        ...rows,
      ],
    }));
  }

  async function addChapterLinks(rows: DropChapterLink[]) {
    if (!rows.length) return;
    const { error } = await supabase
      .from('drop_chapter_links')
      .upsert(rows, { onConflict: 'drop_id,drop_type,chapter_id' });
    if (error) throw new Error(error.message);
    set((s) => ({
      dropChapterLinks: [
        ...s.dropChapterLinks.filter(
          (l) =>
            !rows.some(
              (r) =>
                r.drop_id === l.drop_id &&
                r.drop_type === l.drop_type &&
                r.chapter_id === l.chapter_id,
            ),
        ),
        ...rows,
      ],
    }));
  }

  async function removeWorldLink(item: FiledItem, worldId: string) {
    const { error } = await supabase
      .from('drop_world_links')
      .delete()
      .eq('drop_id', item.id)
      .eq('drop_type', item.type)
      .eq('world_id', worldId)
      .eq('owner_id', userId());
    if (error) throw new Error(error.message);
    set((s) => ({
      dropWorldLinks: s.dropWorldLinks.filter(
        (l) => !(l.drop_id === item.id && l.drop_type === item.type && l.world_id === worldId),
      ),
    }));
  }

  async function removeChapterLink(item: FiledItem, chapterId: string) {
    const { error } = await supabase
      .from('drop_chapter_links')
      .delete()
      .eq('drop_id', item.id)
      .eq('drop_type', item.type)
      .eq('chapter_id', chapterId)
      .eq('owner_id', userId());
    if (error) throw new Error(error.message);
    set((s) => ({
      dropChapterLinks: s.dropChapterLinks.filter(
        (l) => !(l.drop_id === item.id && l.drop_type === item.type && l.chapter_id === chapterId),
      ),
    }));
  }

  const placedWorldLink = (item: FiledItem, worldId: string, now: string): DropWorldLink => ({
    drop_id: item.id,
    drop_type: item.type,
    world_id: worldId,
    owner_id: userId(),
    relevance_score: 1,
    assigned_by: 'user',
    reason: null,
    created_at: now,
    last_confirmed_at: now,
  });
  const placedChapterLink = (item: FiledItem, chapterId: string, now: string): DropChapterLink => ({
    drop_id: item.id,
    drop_type: item.type,
    chapter_id: chapterId,
    owner_id: userId(),
    relevance_score: 1,
    assigned_by: 'user',
    reason: null,
    created_at: now,
    last_confirmed_at: now,
  });

  /**
   * Put an item in a World or Chapter as the person's own choice, which
   * filing never moves. In a Chapter, it goes in the Chapter's World too.
   */
  async function placeItem(
    item: FiledItem,
    where: { worldId?: string | null; chapterId?: string | null },
  ): Promise<Undo> {
    const now = nowTimestamp();
    const chapter = where.chapterId ? get().chapters.find((c) => c.id === where.chapterId) : null;
    const worldId = where.worldId || chapter?.primary_world_id || null;
    const hadWorld = worldId
      ? get().dropWorldLinks.find(
          (l) => l.drop_id === item.id && l.drop_type === item.type && l.world_id === worldId,
        )
      : undefined;
    const hadChapter = chapter
      ? get().dropChapterLinks.find(
          (l) => l.drop_id === item.id && l.drop_type === item.type && l.chapter_id === chapter.id,
        )
      : undefined;
    if (worldId) await addWorldLinks([placedWorldLink(item, worldId, now)]);
    if (chapter) await addChapterLinks([placedChapterLink(item, chapter.id, now)]);
    if (chapter) tellGremly('chapters', chapter.id);
    else if (worldId) tellGremly('worlds', worldId);
    return async () => {
      if (chapter) {
        if (hadChapter) await addChapterLinks([hadChapter]);
        else await removeChapterLink(item, chapter.id);
      }
      if (worldId) {
        if (hadWorld) await addWorldLinks([hadWorld]);
        else await removeWorldLink(item, worldId);
      }
    };
  }

  /** Take an item out of a Chapter, or out of a World and its Chapters. */
  async function takeItemOut(
    item: FiledItem,
    where: { worldId?: string | null; chapterId?: string | null },
  ): Promise<Undo> {
    const s = get();
    const chapterIds = where.chapterId
      ? [where.chapterId]
      : where.worldId
        ? s.chapters.filter((c) => c.primary_world_id === where.worldId).map((c) => c.id)
        : [];
    const goneChapter = s.dropChapterLinks.filter(
      (l) =>
        l.drop_id === item.id && l.drop_type === item.type && chapterIds.includes(l.chapter_id),
    );
    const goneWorld = where.worldId
      ? s.dropWorldLinks.filter(
          (l) => l.drop_id === item.id && l.drop_type === item.type && l.world_id === where.worldId,
        )
      : [];
    for (const l of goneChapter) await removeChapterLink(item, l.chapter_id);
    for (const l of goneWorld) await removeWorldLink(item, l.world_id);
    if (where.chapterId) tellGremly('chapters', where.chapterId);
    if (where.worldId) tellGremly('worlds', where.worldId);
    return async () => {
      await addChapterLinks(goneChapter);
      await addWorldLinks(goneWorld);
    };
  }

  // ---- whole rows, for delete and its Undo -----------------------------------

  async function putWorldBack(row: World, links: DropWorldLink[], chapterIds: string[]) {
    const { error } = await supabase.from('worlds').upsert(row);
    if (error) throw new Error(error.message);
    set((s) => ({ worlds: [...s.worlds.filter((w) => w.id !== row.id), row] }));
    await addWorldLinks(links);
    for (const cid of chapterIds) await updateChapter(cid, { primary_world_id: row.id });
    tellGremly('worlds', row.id);
  }

  async function removeWorldRow(id: string) {
    const { error } = await supabase.from('worlds').delete().eq('id', id).eq('owner_id', userId());
    if (error) throw new Error(error.message);
    set((s) => ({
      worlds: s.worlds.filter((w) => w.id !== id),
      dropWorldLinks: s.dropWorldLinks.filter((l) => l.world_id !== id),
    }));
  }

  return {
    // ---- Worlds ---------------------------------------------------------------

    makeWorld: async ({ name, gremly }) => {
      const owner = userId();
      const now = nowTimestamp();
      const title = clean(name);
      if (!title) throw new Error('A World needs a name');
      const { data, error } = await supabase
        .from('worlds')
        .insert({
          owner_id: owner,
          name: title,
          display_name: title,
          phase: 'active',
          source: 'user',
          confirmed_at: now,
          mascot_slug: gremly,
          mascot_slug_source: 'user',
          mascot_slug_updated_at: now,
        })
        .select()
        .single();
      if (error || !data) throw new Error(error?.message || 'The World could not be made');
      const world = data as World;
      set((s) => ({ worlds: [...s.worlds, world] }));
      tellGremly('worlds', world.id);
      return {
        world,
        undo: async () => {
          await removeWorldRow(world.id);
        },
      };
    },

    renameWorld: (id, name) => {
      const title = clean(name);
      if (!title) return Promise.reject(new Error('A World needs a name'));
      return updateWorld(id, { name: title, display_name: title });
    },

    setWorldGremly: (id, slug) =>
      updateWorld(id, {
        mascot_slug: slug,
        mascot_slug_source: 'user',
        mascot_slug_updated_at: nowTimestamp(),
      }),

    setWorldWords: (id, words) =>
      updateWorld(id, {
        card_subtitle: clean(words) || null,
        card_subtitle_source: 'user',
        card_subtitle_updated_at: nowTimestamp(),
        card_subtitle_offered: null,
        card_subtitle_offered_at: null,
      }),

    // Gremly's version, offered under the person's own, becomes the line again
    // and is his to keep fresh
    takeOfferedWorldWords: (id) => {
      const w = get().worlds.find((x) => x.id === id);
      if (!w?.card_subtitle_offered) return Promise.reject(new Error('There is nothing offered'));
      return updateWorld(id, {
        card_subtitle: w.card_subtitle_offered,
        card_subtitle_source: 'words',
        card_subtitle_updated_at: nowTimestamp(),
        card_subtitle_offered: null,
        card_subtitle_offered_at: null,
      });
    },

    hideWorld: (id) => updateWorld(id, { phase: 'archived' }),
    unhideWorld: (id) => updateWorld(id, { phase: 'active' }),

    mergeWorlds: async (keepId, goneId) => {
      const s = get();
      const gone = s.worlds.find((w) => w.id === goneId);
      if (!gone || !s.worlds.some((w) => w.id === keepId) || keepId === goneId)
        throw new Error('Those two Worlds cannot be merged');
      const now = nowTimestamp();
      const goneLinks = s.dropWorldLinks.filter((l) => l.world_id === goneId);
      const keepHas = new Set(
        s.dropWorldLinks
          .filter((l) => l.world_id === keepId)
          .map((l) => `${l.drop_type}:${l.drop_id}`),
      );
      const added = goneLinks
        .filter((l) => !keepHas.has(`${l.drop_type}:${l.drop_id}`))
        .map((l) => ({ ...l, world_id: keepId, last_confirmed_at: now }));
      const moved = s.chapters.filter((c) => c.primary_world_id === goneId).map((c) => c.id);
      await addWorldLinks(added);
      for (const cid of moved) await updateChapter(cid, { primary_world_id: keepId });
      await removeWorldRow(goneId);
      tellGremly('worlds', keepId);
      return async () => {
        await putWorldBack(gone, goneLinks, moved);
        for (const l of added) await removeWorldLink({ id: l.drop_id, type: l.drop_type }, keepId);
        tellGremly('worlds', keepId);
      };
    },

    deleteWorld: async (id, chaptersTo) => {
      const s = get();
      const row = s.worlds.find((w) => w.id === id);
      if (!row) throw new Error('That World is not here any more');
      const links = s.dropWorldLinks.filter((l) => l.world_id === id);
      const moved = s.chapters.filter((c) => c.primary_world_id === id).map((c) => c.id);
      for (const cid of moved) await updateChapter(cid, { primary_world_id: chaptersTo });
      await removeWorldRow(id);
      if (chaptersTo) tellGremly('worlds', chaptersTo);
      return async () => {
        await putWorldBack(row, links, moved);
      };
    },

    // ---- Chapters -------------------------------------------------------------

    makeChapter: async (input) => {
      const owner = userId();
      const now = nowTimestamp();
      const title = clean(input.title);
      if (!title) throw new Error('A Chapter needs a name');
      const start = dayOf(input.startDate) || null;
      const end = dayOf(input.endDate) || null;
      const row: Record<string, unknown> = {
        owner_id: owner,
        title,
        title_source: 'user',
        title_updated_at: now,
        phase: openPhase(start, today()),
        source: 'user',
        confirmed_at: now,
        primary_world_id: input.worldId,
        start_date: start,
        end_date: end,
      };
      if (start) Object.assign(row, { start_date_source: 'user', start_date_updated_at: now });
      if (end) Object.assign(row, { end_date_source: 'user', end_date_updated_at: now });
      if (input.gremly)
        Object.assign(row, {
          mascot_slug: input.gremly,
          mascot_slug_source: 'user',
          mascot_slug_updated_at: now,
        });
      const { data, error } = await supabase.from('chapters').insert(row).select().single();
      if (error || !data) throw new Error(error?.message || 'The Chapter could not be made');
      const chapter = data as Chapter;
      set((s) => ({ chapters: [...s.chapters, chapter] }));
      const undos: Undo[] = [];
      for (const item of input.items || [])
        undos.push(await placeItem(item, { chapterId: chapter.id }));
      tellGremly('chapters', chapter.id);
      return {
        chapter,
        undo: async () => {
          for (const u of undos.reverse()) await u();
          const { error: e } = await supabase
            .from('chapters')
            .delete()
            .eq('id', chapter.id)
            .eq('owner_id', owner);
          if (e) throw new Error(e.message);
          set((s) => ({
            chapters: s.chapters.filter((c) => c.id !== chapter.id),
            dropChapterLinks: s.dropChapterLinks.filter((l) => l.chapter_id !== chapter.id),
          }));
        },
      };
    },

    renameChapter: (id, title) => {
      const t = clean(title);
      if (!t) return Promise.reject(new Error('A Chapter needs a name'));
      return updateChapter(id, {
        title: t,
        title_source: 'user',
        title_updated_at: nowTimestamp(),
      });
    },

    setChapterDates: (id, startDate, endDate) => {
      const c = get().chapters.find((x) => x.id === id);
      const now = nowTimestamp();
      const start = dayOf(startDate) || null;
      const end = dayOf(endDate) || null;
      if (start && end && end < start)
        return Promise.reject(new Error('The end comes before the start'));
      const patch: Partial<Chapter> = {
        start_date: start,
        start_date_source: 'user',
        start_date_updated_at: now,
        end_date: end,
        end_date_source: 'user',
        end_date_updated_at: now,
      };
      // an open Chapter is set for later or under way by its start
      if (c && !c.closed_at && c.phase !== 'closed' && c.phase !== 'suggested')
        patch.phase = openPhase(start, today());
      return updateChapter(id, patch);
    },

    moveChapter: (id, worldId) => updateChapter(id, { primary_world_id: worldId }),

    setChapterGremly: (id, slug) =>
      updateChapter(id, {
        mascot_slug: slug,
        mascot_slug_source: slug ? 'user' : null,
        mascot_slug_updated_at: nowTimestamp(),
      }),

    setChapterWords: (id, words) =>
      updateChapter(id, {
        card_subtitle: clean(words) || null,
        card_subtitle_source: 'user',
        card_subtitle_updated_at: nowTimestamp(),
        card_subtitle_offered: null,
        card_subtitle_offered_at: null,
      }),

    takeOfferedChapterWords: (id) => {
      const c = get().chapters.find((x) => x.id === id);
      if (!c?.card_subtitle_offered) return Promise.reject(new Error('There is nothing offered'));
      return updateChapter(id, {
        card_subtitle: c.card_subtitle_offered,
        card_subtitle_source: 'words',
        card_subtitle_updated_at: nowTimestamp(),
        card_subtitle_offered: null,
        card_subtitle_offered_at: null,
      });
    },

    setChapterMemory: (id, words) =>
      updateChapter(id, {
        epigraph: clean(words) || null,
        epigraph_source: 'user',
        epigraph_updated_at: nowTimestamp(),
        epigraph_offered: null,
        epigraph_offered_at: null,
      }),

    takeOfferedMemory: (id) => {
      const c = get().chapters.find((x) => x.id === id);
      if (!c?.epigraph_offered) return Promise.reject(new Error('There is nothing offered'));
      return updateChapter(id, {
        epigraph: c.epigraph_offered,
        epigraph_source: 'memory',
        epigraph_updated_at: nowTimestamp(),
        epigraph_offered: null,
        epigraph_offered_at: null,
      });
    },

    closeChapter: (id) => updateChapter(id, { phase: 'closed', closed_at: nowTimestamp() }),

    reopenChapter: (id) => {
      const c = get().chapters.find((x) => x.id === id);
      return updateChapter(id, { phase: openPhase(c?.start_date, today()), closed_at: null });
    },

    deleteChapter: async (id) => {
      const s = get();
      const row = s.chapters.find((c) => c.id === id);
      if (!row) throw new Error('That Chapter is not here any more');
      const links = s.dropChapterLinks.filter((l) => l.chapter_id === id);
      const { error } = await supabase
        .from('chapters')
        .delete()
        .eq('id', id)
        .eq('owner_id', userId());
      if (error) throw new Error(error.message);
      set((st) => ({
        chapters: st.chapters.filter((c) => c.id !== id),
        dropChapterLinks: st.dropChapterLinks.filter((l) => l.chapter_id !== id),
      }));
      if (row.primary_world_id) tellGremly('worlds', row.primary_world_id);
      return async () => {
        const { error: e } = await supabase.from('chapters').upsert(row);
        if (e) throw new Error(e.message);
        set((st) => ({ chapters: [...st.chapters.filter((c) => c.id !== id), row] }));
        await addChapterLinks(links);
        tellGremly('chapters', id);
      };
    },

    askForMemory: async (id) => {
      const r = await callChapterMemory(id);
      if (!r.ok) {
        console.warn('[Worlds] the memory could not be written:', r.error);
        return null;
      }
      const memory = r.data?.memory ?? null;
      if (memory && r.data?.field === 'epigraph')
        localChapter(id, {
          epigraph: memory,
          epigraph_source: 'memory',
          epigraph_updated_at: nowTimestamp(),
        });
      else if (memory && r.data?.field === 'epigraph_offered')
        localChapter(id, { epigraph_offered: memory, epigraph_offered_at: nowTimestamp() });
      return memory;
    },

    // ---- items ------------------------------------------------------------------

    placeItem,
    takeItemOut,
  };
}
