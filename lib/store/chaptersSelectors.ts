import { useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { selectWorldPalette } from './worldsSelectors';

// ─── useChaptersForEntity ─────────────────────────────────────────────────────

export interface ChapterForEntity {
  id: string;
  title: string;
  primary_world_id: string | null;
  worldAccentColor: string;
}

export const useChaptersForEntity = (entityId: string | null | undefined): ChapterForEntity[] => {
  const chapters = useGremlyStore((s) => s.chapters);
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const worlds = useGremlyStore((s) => s.worlds);
  return useMemo(() => {
    if (!entityId) return [];
    const chapterIds = new Set<string>();
    for (const link of dropChapterLinks) {
      if (link.drop_id === entityId) chapterIds.add(link.chapter_id);
    }
    if (chapterIds.size === 0) return [];
    const result: ChapterForEntity[] = [];
    for (const c of chapters) {
      if (!chapterIds.has(c.id)) continue;
      const palette = selectWorldPalette({ worlds } as any, c.primary_world_id ?? '');
      result.push({
        id: c.id,
        title: c.title,
        primary_world_id: c.primary_world_id ?? null,
        worldAccentColor: palette.dot,
      });
    }
    result.sort((a, b) => a.title.localeCompare(b.title));
    return result;
  }, [entityId, chapters, dropChapterLinks, worlds]);
};

// ─── useActiveChaptersGroupedByWorld ─────────────────────────────────────────

export interface ChapterPickerItem {
  id: string;
  title: string;
  start_date: string | null;
}

export interface WorldChapterGroup {
  worldId: string;
  worldName: string;
  worldAccentColor: string;
  chapters: ChapterPickerItem[];
}

export const useActiveChaptersGroupedByWorld = (): WorldChapterGroup[] => {
  const chapters = useGremlyStore((s) => s.chapters);
  const worlds = useGremlyStore((s) => s.worlds);
  return useMemo(() => {
    // Only chapters that haven't been closed
    const active = chapters.filter((c) => c.closed_at == null);
    // Group by primary_world_id
    const byWorld = new Map<string, ChapterPickerItem[]>();
    for (const c of active) {
      const wid = c.primary_world_id ?? '__none__';
      if (!byWorld.has(wid)) byWorld.set(wid, []);
      byWorld.get(wid)!.push({ id: c.id, title: c.title, start_date: c.start_date });
    }
    const groups: WorldChapterGroup[] = [];
    // Sort worlds alphabetically by name
    const sortedWorlds = [...worlds].sort((a, b) => a.name.localeCompare(b.name));
    for (const w of sortedWorlds) {
      const wChapters = byWorld.get(w.id);
      if (!wChapters || wChapters.length === 0) continue;
      const palette = selectWorldPalette({ worlds } as any, w.id);
      // Sort chapters by start_date descending (most recent first)
      const sorted = [...wChapters].sort((a, b) => {
        if (!a.start_date && !b.start_date) return 0;
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return b.start_date.localeCompare(a.start_date);
      });
      groups.push({
        worldId: w.id,
        worldName: w.name,
        worldAccentColor: palette.dot,
        chapters: sorted,
      });
    }
    return groups;
  }, [chapters, worlds]);
};
