import { useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date/DateService';
import { parseLocalYMD } from '../utils/dates';
import type { Note, Todo, Habit } from '../types';
import { startOfIsoWeek, weekKey } from '../date/isoWeek';
import type { DropChapterLink, DropWorldLink, Chapter, World, KeyMoment } from '../supabase/types';
import { extractPeopleFromNotes, initialsOf, titleCase } from './worldsSelectors';

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
  due_date: string | null; // YYYY-MM-DD from todo.due_day
  is_overdue: boolean;
}

function computeOpenTodosForChapter(
  todos: Todo[],
  dropChapterLinks: DropChapterLink[],
  chapterId: string,
): ChapterOpenTodo[] {
  // Collect todo drop-IDs linked to this chapter
  const todoIdsInChapter = new Set<string>();
  for (const link of dropChapterLinks) {
    if (link.chapter_id === chapterId && link.drop_type === 'todo') {
      todoIdsInChapter.add(link.drop_id);
    }
  }
  if (todoIdsInChapter.size === 0) return [];

  const todayStr = getDateService().today(); // YYYY-MM-DD

  const candidates: ChapterOpenTodo[] = [];
  for (const t of todos) {
    if (t.archived) continue;
    if (t.completed_at) continue;
    if (!todoIdsInChapter.has(t.id)) continue;

    // due_day is the canonical date field; fall back to due_date ISO prefix
    const due = t.due_day ?? (t.due_date ? t.due_date.slice(0, 10) : null);
    candidates.push({
      id: t.id,
      title: t.name || t.title || '(untitled)',
      due_date: due,
      is_overdue: due ? due < todayStr : false,
    });
  }

  // Sort: overdue first, then upcoming by due_day asc, then no-due last
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
  const todos = useGremlyStore((s) => s.todos);
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  return useMemo(
    () => computeOpenTodosForChapter(todos, dropChapterLinks, chapterId),
    [todos, dropChapterLinks, chapterId],
  );
};

// ─── useChapterCadenceWeeks / useChapterCadenceTotals ───────────────────────

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export interface CadenceWeek {
  weekStart: string; // 'YYYY-MM-DD' Monday
  activityCount: number;
  intensityLevel: 0 | 1 | 2 | 3 | 4;
  monthLabel: string;
}

export interface CadenceTotals {
  totalSessionsInWindow: number;
  weeksActiveInWindow: number;
  averagePerActiveWeek: string; // '~{X}/wk' or '\u2014/wk'
}

function computeCadenceWeeks(
  dropChapterLinks: DropChapterLink[],
  notes: Note[],
  todos: Todo[],
  habits: Habit[],
  chapterId: string,
  weeksBack: number,
): CadenceWeek[] {
  // Build lookup maps so we can resolve a link's drop created_at
  const noteMap = new Map<string, Note>(notes.map((n) => [n.id, n]));
  const todoMap = new Map<string, Todo>(todos.map((t) => [t.id, t]));
  const habitMap = new Map<string, Habit>(habits.map((h) => [h.id, h]));

  const buckets = new Map<string, number>();
  for (const link of dropChapterLinks) {
    if (link.chapter_id !== chapterId) continue;
    let createdAt: string | undefined;
    if (link.drop_type === 'note') createdAt = noteMap.get(link.drop_id)?.created_at;
    else if (link.drop_type === 'todo') createdAt = todoMap.get(link.drop_id)?.created_at;
    else if (link.drop_type === 'habit') createdAt = habitMap.get(link.drop_id)?.created_at;
    if (!createdAt) continue;
    const key = weekKey(new Date(createdAt));
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const today = getDateService().now();
  const windowEnd = startOfIsoWeek(today);
  const result: CadenceWeek[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekDate = new Date(windowEnd);
    weekDate.setDate(windowEnd.getDate() - i * 7);
    const key = weekKey(weekDate);
    const count = buckets.get(key) ?? 0;
    const level: 0 | 1 | 2 | 3 | 4 =
      count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
    const [, mo] = key.split('-');
    result.push({
      weekStart: key,
      activityCount: count,
      intensityLevel: level,
      monthLabel: MONTH_LABELS[parseInt(mo, 10) - 1],
    });
  }
  return result;
}

export const useChapterCadenceWeeks = (
  chapterId: string | null | undefined,
  weeksBack = 19,
): CadenceWeek[] => {
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const notes = useGremlyStore((s) => s.notes);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  return useMemo(() => {
    if (!chapterId) return [];
    return computeCadenceWeeks(dropChapterLinks, notes, todos, habits, chapterId, weeksBack);
  }, [dropChapterLinks, notes, todos, habits, chapterId, weeksBack]);
};

export const useChapterCadenceTotals = (
  chapterId: string | null | undefined,
  weeksBack = 19,
): CadenceTotals => {
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const notes = useGremlyStore((s) => s.notes);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  return useMemo(() => {
    if (!chapterId)
      return {
        totalSessionsInWindow: 0,
        weeksActiveInWindow: 0,
        averagePerActiveWeek: '\u2014/wk',
      };
    const weeks = computeCadenceWeeks(dropChapterLinks, notes, todos, habits, chapterId, weeksBack);
    const totalSessionsInWindow = weeks.reduce((sum, w) => sum + w.activityCount, 0);
    const weeksActiveInWindow = weeks.filter((w) => w.activityCount > 0).length;
    const averagePerActiveWeek =
      weeksActiveInWindow === 0
        ? '\u2014/wk'
        : `~${Math.round(totalSessionsInWindow / weeksActiveInWindow)}/wk`;
    return { totalSessionsInWindow, weeksActiveInWindow, averagePerActiveWeek };
  }, [dropChapterLinks, notes, todos, habits, chapterId, weeksBack]);
};

// ─── useChapterItemCount ──────────────────────────────────────────────────────

export const useChapterItemCount = (chapterId: string | null | undefined): number => {
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  return useMemo(() => {
    if (!chapterId) return 0;
    return dropChapterLinks.filter((l) => l.chapter_id === chapterId).length;
  }, [dropChapterLinks, chapterId]);
};

// ─── ChapterPerson ───────────────────────────────────────────────────────────

export interface ChapterPerson {
  id: string; // lowercased name (stable key today)
  name: string; // titlecased
  initials: string;
  mentionCount: number;
  role?: string; // Phase 2 (W.1)
  span?: string; // Phase 2 (W.1)
  evidenceDropId?: string; // Phase 2 (W.1)
}

export const useChapterPeople = (chapterId: string | null | undefined): ChapterPerson[] => {
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const notes = useGremlyStore((s) => s.notes);
  return useMemo(() => {
    if (!chapterId) return [];
    const noteIds = new Set<string>();
    for (const l of dropChapterLinks) {
      if (l.chapter_id === chapterId && l.drop_type === 'note') noteIds.add(l.drop_id);
    }
    const chapterNotes = notes.filter((n) => noteIds.has(n.id));
    const counts = extractPeopleFromNotes(chapterNotes);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, mentionCount]) => ({
        id: name.toLowerCase(),
        name: titleCase(name),
        initials: initialsOf(name),
        mentionCount,
      }));
  }, [dropChapterLinks, notes, chapterId]);
};

// ─── ChapterTimelineItem ─────────────────────────────────────────────────────

export interface ChapterTimelineItem {
  id: string;
  dateIso: string; // YYYY-MM-DD
  dateLabel: string; // "MAY 1 · BERLIN" or "MAY 1"
  text: string;
  tense: 'past' | 'now' | 'future';
  isMarker?: boolean; // synthetic "you are here" row
}

export const useChapterTimelineItems = (
  chapter: Chapter | null | undefined,
): ChapterTimelineItem[] => {
  const todayKey = getDateService().today();
  return useMemo(() => {
    if (!chapter) return [];

    const items: ChapterTimelineItem[] = [];

    const addItem = (dateIso: string, text: string, location: string | undefined, id: string) => {
      const label = dateIso.slice(5).replace('-', '/');
      // Format as "MMM D" by parsing month+day
      const [, mm, dd] = dateIso.split('-');
      const monthNames = [
        'JAN',
        'FEB',
        'MAR',
        'APR',
        'MAY',
        'JUN',
        'JUL',
        'AUG',
        'SEP',
        'OCT',
        'NOV',
        'DEC',
      ];
      const monthLabel = monthNames[parseInt(mm, 10) - 1] ?? mm;
      const dayLabel = parseInt(dd, 10).toString();
      const dateLabel = location
        ? `${monthLabel} ${dayLabel} · ${location.toUpperCase()}`
        : `${monthLabel} ${dayLabel}`;
      const tense: ChapterTimelineItem['tense'] =
        dateIso < todayKey ? 'past' : dateIso > todayKey ? 'future' : 'now';
      items.push({ id, dateIso, dateLabel, text, tense });
    };

    if (chapter.start_date) {
      addItem(chapter.start_date, 'Start', undefined, `start-${chapter.start_date}`);
    }

    const moments: KeyMoment[] = chapter.key_moments ?? [];
    for (const km of moments) {
      addItem(km.date, km.text, km.location, `km-${km.date}-${km.text.slice(0, 8)}`);
    }

    if (chapter.end_date) {
      addItem(chapter.end_date, 'End', undefined, `end-${chapter.end_date}`);
    }

    // Sort by date ascending
    items.sort((a, b) => a.dateIso.localeCompare(b.dateIso));

    // Inject synthetic "you are here" marker if today falls strictly between
    // two existing items and doesn't already match any existing item's date.
    const alreadyHasToday = items.some((i) => i.dateIso === todayKey);
    if (!alreadyHasToday && items.length >= 2) {
      const firstDate = items[0].dateIso;
      const lastDate = items[items.length - 1].dateIso;
      if (todayKey > firstDate && todayKey < lastDate) {
        const endDate = chapter.end_date ?? lastDate;
        const endMs = parseLocalYMD(endDate).getTime();
        const todayMs = parseLocalYMD(todayKey).getTime();
        const daysOut = Math.max(0, Math.round((endMs - todayMs) / 86_400_000));
        const [, mm, dd] = todayKey.split('-');
        const monthNames = [
          'JAN',
          'FEB',
          'MAR',
          'APR',
          'MAY',
          'JUN',
          'JUL',
          'AUG',
          'SEP',
          'OCT',
          'NOV',
          'DEC',
        ];
        const monthLabel = monthNames[parseInt(mm, 10) - 1] ?? mm;
        const dayLabel = parseInt(dd, 10).toString();
        const marker: ChapterTimelineItem = {
          id: `marker-today`,
          dateIso: todayKey,
          dateLabel: `${monthLabel} ${dayLabel} · TODAY`,
          text: `today · ${daysOut} days out`,
          tense: 'now',
          isMarker: true,
        };
        // Insert in sorted position
        const insertIdx = items.findIndex((i) => i.dateIso > todayKey);
        if (insertIdx === -1) items.push(marker);
        else items.splice(insertIdx, 0, marker);
      }
    }

    return items;
  }, [chapter, todayKey]);
};
