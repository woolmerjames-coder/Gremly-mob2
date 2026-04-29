import { useMemo } from 'react';
import { useGremlyStore } from './useGremlyStore';
import { getDateService } from '../date/DateService';
import { parseLocalYMD } from '../utils/dates';
import type { Note, Todo, Habit } from '../types';
import { startOfIsoWeek, weekKey } from '../date/isoWeek';
import type {
  DropChapterLink,
  DropWorldLink,
  Chapter,
  World,
  KeyMoment,
  WithYouItem,
} from '../supabase/types';
import {
  extractPeopleFromNotes,
  initialsOf,
  titleCase,
  selectWorldPalette,
} from './worldsSelectors';

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
  mentionCount?: number; // undefined for classifier-authored people
  role?: string; // Phase 2 (W.1)
  span?: string; // Phase 2 (W.1)
  evidenceDropId?: string; // Phase 2 (W.1)
}

export const useChapterPeople = (chapter: Chapter | null | undefined): ChapterPerson[] => {
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const notes = useGremlyStore((s) => s.notes);
  return useMemo(() => {
    if (!chapter) return [];
    // with_you path: classifier or user-authored structured array
    if (chapter.with_you !== null && chapter.with_you !== undefined) {
      return chapter.with_you.map((item: WithYouItem) => ({
        id: `withyou:${item.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: item.name,
        initials: initialsOf(item.name),
        // mentionCount omitted — classifier does not emit a count
        role: item.role ?? undefined,
        span: item.span ?? undefined,
        evidenceDropId: item.evidence_drop_id ?? undefined,
      }));
    }
    // @-tag fallback: extract from linked notes
    const noteIds = new Set<string>();
    for (const l of dropChapterLinks) {
      if (l.chapter_id === chapter.id && l.drop_type === 'note') noteIds.add(l.drop_id);
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
  }, [chapter?.id, chapter?.with_you, dropChapterLinks, notes]);
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

    const moments: KeyMoment[] = chapter.key_moments ?? [];
    const hasKeyMoments = moments.length > 0;

    if (!hasKeyMoments && chapter.start_date) {
      addItem(chapter.start_date, 'Start', undefined, `start-${chapter.start_date}`);
    }

    for (const km of moments) {
      addItem(km.date, km.text, km.location, `km-${km.date}-${km.text.slice(0, 8)}`);
    }

    if (!hasKeyMoments && chapter.end_date) {
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

// ─── HeldStripCell ───────────────────────────────────────────────────────────

export interface HeldStripCell {
  dateIso: string; // YYYY-MM-DD
  tense: 'held' | 'slip' | 'today' | 'future';
  /** Populated when tense is 'slip', or when tense is 'today' and today is
   *  also in slip_events (today-as-slip edge case). */
  slipReason?: string;
}

export const useChapterHeldStripCells = (chapter: Chapter | null | undefined): HeldStripCell[] => {
  const todayKey = getDateService().today();
  return useMemo(() => {
    if (!chapter || !chapter.start_date || !chapter.end_date || !chapter.slip_tracking_enabled)
      return [];

    const slipMap = new Map<string, string | undefined>();
    for (const s of chapter.slip_events ?? []) {
      slipMap.set(s.date, s.note);
    }

    const cells: HeldStripCell[] = [];
    let cursor = parseLocalYMD(chapter.start_date);
    const end = parseLocalYMD(chapter.end_date);

    while (cursor <= end) {
      const [yr, mn, dy] = [
        cursor.getFullYear(),
        String(cursor.getMonth() + 1).padStart(2, '0'),
        String(cursor.getDate()).padStart(2, '0'),
      ];
      const dateIso = `${yr}-${mn}-${dy}`;
      const isSlip = slipMap.has(dateIso);
      const slipReason = isSlip ? slipMap.get(dateIso) : undefined;

      let tense: HeldStripCell['tense'];
      if (dateIso === todayKey) {
        tense = 'today';
      } else if (isSlip) {
        tense = 'slip';
      } else if (dateIso < todayKey) {
        tense = 'held';
      } else {
        tense = 'future';
      }

      cells.push({ dateIso, tense, slipReason });
      cursor = new Date(cursor.getTime() + 86_400_000);
    }

    return cells;
  }, [
    chapter?.start_date,
    chapter?.end_date,
    chapter?.slip_events,
    chapter?.slip_tracking_enabled,
    todayKey,
  ]);
};

// ─── HeldStripStats ──────────────────────────────────────────────────────────

export interface HeldStripStats {
  heldCount: number;
  slipCount: number;
  currentStreak: number;
  totalDays: number;
  dayOfTotal: number;
}

export const useChapterHeldStripStats = (
  chapter: Chapter | null | undefined,
): HeldStripStats | null => {
  const cells = useChapterHeldStripCells(chapter);
  const todayKey = getDateService().today();
  return useMemo(() => {
    if (!chapter?.start_date || !chapter?.end_date || !chapter?.slip_tracking_enabled) return null;
    if (cells.length === 0) return null;

    const heldCount = cells.filter(
      (c) => c.tense === 'held' || (c.tense === 'today' && !c.slipReason),
    ).length;
    const slipCount = cells.filter(
      (c) => c.tense === 'slip' || (c.tense === 'today' && !!c.slipReason),
    ).length;
    const totalDays = cells.length;
    const todayIdx = cells.findIndex((c) => c.dateIso === todayKey);
    const dayOfTotal = Math.min(todayIdx === -1 ? totalDays : todayIdx + 1, totalDays);

    // currentStreak: days since last slip, up to and including today.
    // 0 if today itself is a slip.
    const todayCell = cells.find((c) => c.dateIso === todayKey);
    let currentStreak: number;
    if (todayCell?.tense === 'today' && todayCell.slipReason) {
      currentStreak = 0;
    } else {
      const slipCells = cells
        .filter((c) => c.tense === 'slip' && c.dateIso <= todayKey)
        .map((c) => c.dateIso)
        .sort();
      const lastSlipDate = slipCells.length > 0 ? slipCells[slipCells.length - 1] : null;
      if (lastSlipDate) {
        const lastSlipMs = parseLocalYMD(lastSlipDate).getTime();
        const todayMs = parseLocalYMD(todayKey).getTime();
        currentStreak = Math.round((todayMs - lastSlipMs) / 86_400_000);
      } else {
        const startMs = parseLocalYMD(chapter.start_date).getTime();
        const todayMs = parseLocalYMD(todayKey).getTime();
        currentStreak = Math.round((todayMs - startMs) / 86_400_000) + 1;
      }
    }

    return { heldCount, slipCount, currentStreak, totalDays, dayOfTotal };
  }, [cells, chapter?.start_date, chapter?.end_date, chapter?.slip_tracking_enabled, todayKey]);
};

// ─── UpcomingRiskItem ────────────────────────────────────────────────────────

export interface UpcomingRiskItem {
  id: string;
  text: string;
  dateIso: string;
  dateLabel: string; // "{Mon} {D}" e.g. "May 1"
}

export const useChapterUpcomingRisk = (chapter: Chapter | null | undefined): UpcomingRiskItem[] => {
  const todayKey = getDateService().today();
  return useMemo(() => {
    if (!chapter) return [];
    const months = [
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
    return (chapter.key_priorities ?? [])
      .filter((p) => p.kind === 'date' && p.due_date && p.due_date >= todayKey)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
      .map((p) => {
        const [, mm, dd] = (p.due_date ?? '').split('-');
        const month = months[parseInt(mm, 10) - 1] ?? mm;
        const day = parseInt(dd, 10).toString();
        return {
          id: `risk-${p.rank}-${p.due_date ?? ''}`,
          text: p.text,
          dateIso: p.due_date ?? '',
          dateLabel: `${month} ${day}`,
        };
      });
  }, [chapter?.key_priorities, todayKey]);
};

// ─── useChaptersForEntity ────────────────────────────────────────────────────

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
