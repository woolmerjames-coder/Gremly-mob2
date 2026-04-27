import { useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date/DateService';
import type { Note } from '../types';
import type { DropChapterLink, DropWorldLink, Chapter, World } from '../supabase/types';

// ─── useRecentDropsForChapter ─────────────────────────────────────────────────

export interface ChapterRecentDrop {
  id: string;
  title: string | null;
  content_preview: string | null;
  date: string; // YYYY-MM-DD
  type: string;
}

function computeRecentDropsForChapter(
  notes: Note[],
  dropChapterLinks: DropChapterLink[],
  chapterId: string,
  limit: number,
): ChapterRecentDrop[] {
  const dropIdsInChapter = new Set<string>();
  for (const link of dropChapterLinks) {
    if (link.chapter_id === chapterId) dropIdsInChapter.add(link.drop_id);
  }
  if (dropIdsInChapter.size === 0) return [];

  const candidates: ChapterRecentDrop[] = [];
  for (const n of notes) {
    if (n.archived) continue;
    if (!dropIdsInChapter.has(n.id)) continue;
    candidates.push({
      id: n.id,
      title: n.title ?? null,
      content_preview: n.body?.slice(0, 80) ?? null,
      date: n.target_date || n.date || n.created_at.slice(0, 10),
      type: (n.canonicalType || n.subtype || 'note') as string,
    });
  }

  candidates.sort((a, b) => b.date.localeCompare(a.date));
  return candidates.slice(0, limit);
}

export const useRecentDropsForChapter = (
  chapterId: string,
  limit: number = 4,
): ChapterRecentDrop[] => {
  const notes = useGremlyStore((s) => s.notes);
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  return useMemo(
    () => computeRecentDropsForChapter(notes, dropChapterLinks, chapterId, limit),
    [notes, dropChapterLinks, chapterId, limit],
  );
};

// ─── useAlsoTouchedWorldsForChapter ──────────────────────────────────────────

export interface ChapterAlsoTouchedWorld {
  id: string;
  name: string;
  display_name: string | null;
  drop_count: number;
}

function computeAlsoTouchedWorldsForChapter(
  worlds: World[],
  chapters: Chapter[],
  dropChapterLinks: DropChapterLink[],
  dropWorldLinks: DropWorldLink[],
  chapterId: string,
): ChapterAlsoTouchedWorld[] {
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) return [];
  const primaryWorldId = chapter.primary_world_id;

  const dropIdsInChapter = new Set<string>();
  for (const link of dropChapterLinks) {
    if (link.chapter_id === chapterId) dropIdsInChapter.add(link.drop_id);
  }
  if (dropIdsInChapter.size === 0) return [];

  const counts = new Map<string, number>();
  for (const link of dropWorldLinks) {
    if (!dropIdsInChapter.has(link.drop_id)) continue;
    if (link.world_id === primaryWorldId) continue;
    counts.set(link.world_id, (counts.get(link.world_id) ?? 0) + 1);
  }

  const out: ChapterAlsoTouchedWorld[] = [];
  for (const [worldId, count] of counts) {
    const w = worlds.find((x) => x.id === worldId);
    if (!w) continue;
    out.push({ id: w.id, name: w.name, display_name: w.display_name, drop_count: count });
  }

  out.sort((a, b) => b.drop_count - a.drop_count);
  return out;
}

export const useAlsoTouchedWorldsForChapter = (chapterId: string): ChapterAlsoTouchedWorld[] => {
  const worlds = useGremlyStore((s) => s.worlds);
  const chapters = useGremlyStore((s) => s.chapters);
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);
  return useMemo(
    () =>
      computeAlsoTouchedWorldsForChapter(
        worlds,
        chapters,
        dropChapterLinks,
        dropWorldLinks,
        chapterId,
      ),
    [worlds, chapters, dropChapterLinks, dropWorldLinks, chapterId],
  );
};

// ─── useOpenTodosForChapter ───────────────────────────────────────────────────

export interface ChapterOpenTodo {
  id: string;
  title: string;
  due_date: string | null;
  is_overdue: boolean;
}

function computeOpenTodosForChapter(
  notes: Note[],
  dropChapterLinks: DropChapterLink[],
  chapterId: string,
): ChapterOpenTodo[] {
  const dropIdsInChapter = new Set<string>();
  for (const link of dropChapterLinks) {
    if (link.chapter_id === chapterId) dropIdsInChapter.add(link.drop_id);
  }
  if (dropIdsInChapter.size === 0) return [];

  // Note type doesn't have completed_at (that's on the todos table).
  // Todo-notes are done by archiving; the `n.archived` check below handles it.
  const todayStr = getDateService().today(); // YYYY-MM-DD

  const candidates: ChapterOpenTodo[] = [];
  for (const n of notes) {
    if (n.archived) continue;
    // Match notes classified as todos via canonicalType (camelCase in type, may
    // be snake_case after store sanitization — check both).
    const ct = n.canonicalType ?? (n as any).canonical_type;
    if (ct !== 'todo') continue;
    if (!dropIdsInChapter.has(n.id)) continue;

    const due = n.target_date ?? null;
    candidates.push({
      id: n.id,
      title: n.title || n.body?.slice(0, 60) || '(untitled)',
      due_date: due,
      is_overdue: due ? due < todayStr : false,
    });
  }

  // Sort: overdue first, then upcoming by date asc, then no-date last
  candidates.sort((a, b) => {
    if (a.is_overdue && !b.is_overdue) return -1;
    if (!a.is_overdue && b.is_overdue) return 1;
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    return 0;
  });

  return candidates;
}

export const useOpenTodosForChapter = (chapterId: string): ChapterOpenTodo[] => {
  const notes = useGremlyStore((s) => s.notes);
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  return useMemo(
    () => computeOpenTodosForChapter(notes, dropChapterLinks, chapterId),
    [notes, dropChapterLinks, chapterId],
  );
};
