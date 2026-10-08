/**
 * The rules every new Worlds screen shares (Worlds rebuild, stage 1).
 *
 * Which Worlds show, which Chapters are open, ended or closed, Up next, a
 * Chapter's steps and what is kept on it, a World's loose things, and the
 * countdown words. Everything here is decided by ids, phases and dates, and
 * never by reading anyone's words.
 *
 * Up next uses the same rule as the brief and the daily picture
 * (workers/shared/upNext.js), so the screen and Gremly always agree.
 *
 * Pure: the screens pass in the store's rows and today's day.
 */
import { format, parseISO } from 'date-fns';
import { nextDateOf, upNext, OPEN_CHAPTER_PHASES } from '../../workers/shared/upNext';
import { DEFAULT_MASCOT_SLUG } from '../store/mascotRegistry';
import type { Chapter, DropChapterLink, DropWorldLink, World } from '../supabase/types';
import type { Habit, Note, Todo } from '../types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD day from a date or timestamp, or null. */
export function dayOf(v: string | null | undefined): string | null {
  const s = String(v || '').slice(0, 10);
  return DAY.test(s) ? s : null;
}

/** Whole days from one day to another. */
export function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);
}

const fmt = (day: string, pattern: string) => format(parseISO(day), pattern);
/** Sat 12 Dec */
export const dayShort = (day: string) => fmt(day, 'EEE d MMM');
/** 12 Dec */
export const dayPlain = (day: string) => fmt(day, 'd MMM');
/** Dec 2026 */
export const monthYear = (day: string) => fmt(day, 'MMM yyyy');

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

/**
 * The World phases the new screens show. Archived is a World the person hid.
 * Candidate is a World the old classifier suggested, which in the new design
 * does not exist until someone taps (it stops being made once the old fields
 * stop). Dormant and evolving are old states the new design does not show;
 * those Worlds are simply the person's Worlds.
 */
export const SHOWN_WORLD_PHASES = Object.freeze(['active', 'evolving', 'dormant']);

export const isHiddenWorld = (w: Pick<World, 'phase'>) => w.phase === 'archived';
export const isShownWorld = (w: Pick<World, 'phase'>) => SHOWN_WORLD_PHASES.includes(w.phase);

/** The Worlds along the top of the home screen, oldest first. */
export function shownWorlds<T extends Pick<World, 'phase' | 'created_at'>>(worlds: T[]): T[] {
  return worlds
    .filter(isShownWorld)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export const hiddenWorlds = <T extends Pick<World, 'phase'>>(worlds: T[]): T[] =>
  worlds.filter(isHiddenWorld);

/** A World's name as the person sees it. */
export const worldName = (w: Pick<World, 'name' | 'display_name'> | null | undefined) =>
  (w?.display_name || w?.name || '').trim();

/** The Gremly a World wears. */
export const worldGremly = (w: Pick<World, 'mascot_slug'> | null | undefined) =>
  w?.mascot_slug || DEFAULT_MASCOT_SLUG;

export type WorldTint = 'sage' | 'peri' | 'pear' | 'peach' | 'rose';
export const WORLD_TINTS: readonly WorldTint[] = Object.freeze([
  'sage',
  'peri',
  'pear',
  'peach',
  'rose',
]);

/** A World's colour, the same every time for the same World. */
export function worldTint(w: Pick<World, 'id' | 'visual_style'> | null | undefined): WorldTint {
  const chosen = w?.visual_style?.color;
  if (chosen && (WORLD_TINTS as readonly string[]).includes(chosen)) return chosen as WorldTint;
  const id = String(w?.id || '');
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WORLD_TINTS[h % WORLD_TINTS.length];
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

type ChapterDates = Pick<Chapter, 'start_date' | 'end_date'>;
type ChapterState = Pick<Chapter, 'phase' | 'closed_at'>;

/** A Chapter that is open: under way, or set for later. */
export const isOpenChapter = (c: ChapterState) =>
  !c.closed_at && OPEN_CHAPTER_PHASES.includes(c.phase);

/** A Chapter that is closed and part of their story. */
export const isClosedChapter = (c: ChapterState) => !!c.closed_at || c.phase === 'closed';

/** An open Chapter whose end date has passed: it waits to be closed. */
export function hasEnded(c: ChapterState & ChapterDates, today: string): boolean {
  const end = dayOf(c.end_date);
  return isOpenChapter(c) && !!end && end < today;
}

/** Start and end on different days. */
export function isSpan(c: ChapterDates): boolean {
  const s = dayOf(c.start_date);
  const e = dayOf(c.end_date);
  return !!s && !!e && s !== e;
}

/** The day an open Chapter is next at, for ordering; no date sorts last. */
function sortDay(c: Chapter, today: string): string {
  return nextDateOf(c, today)?.date || '9999-12-31';
}

/**
 * Open Chapters in the order the home screen lists them: the ones still
 * running by their next date, then the ones that have ended.
 */
export function openChapters(chapters: Chapter[], today: string): Chapter[] {
  return chapters.filter(isOpenChapter).sort((a, b) => {
    const ea = hasEnded(a, today);
    const eb = hasEnded(b, today);
    if (ea !== eb) return ea ? 1 : -1;
    const da = sortDay(a, today);
    const db = sortDay(b, today);
    if (da !== db) return da < db ? -1 : 1;
    return String(a.created_at).localeCompare(String(b.created_at));
  });
}

/** Open Chapters still running. */
export const liveChapters = (chapters: Chapter[], today: string) =>
  openChapters(chapters, today).filter((c) => !hasEnded(c, today));

/** Open Chapters whose end has passed, waiting for the person to close them. */
export const waitingChapters = (chapters: Chapter[], today: string) =>
  openChapters(chapters, today).filter((c) => hasEnded(c, today));

/** Closed Chapters, the most recent first. */
export function closedChapters(chapters: Chapter[]): Chapter[] {
  const when = (c: Chapter) => dayOf(c.end_date) || dayOf(c.closed_at) || dayOf(c.start_date) || '';
  return chapters.filter(isClosedChapter).sort((a, b) => when(b).localeCompare(when(a)));
}

/**
 * The Chapter that leads the home screen: the open one with the nearest
 * date, by the brief's own rule. When none has a date ahead, the first one
 * still running leads instead, so something is always there to open.
 */
export function leadChapter(chapters: Chapter[], today: string): Chapter | null {
  const u = upNext(chapters, today);
  if (u) return chapters.find((c) => c.id === u.chapter_id) || null;
  return liveChapters(chapters, today)[0] || null;
}

/** The Gremly a Chapter wears: its own, or its World's. */
export function chapterGremly(
  c: Pick<Chapter, 'mascot_slug'> | null | undefined,
  world: Pick<World, 'mascot_slug'> | null | undefined,
): string {
  return c?.mascot_slug || worldGremly(world);
}

export type Countdown =
  | { kind: 'days'; n: number; label: string }
  | { kind: 'word'; big: string; label: string };

/**
 * The countdown a Chapter shows, worked out from its dates on the day. A
 * stretch of days counts to its start, then shows which day of it this is.
 * One date counts to that date. Nothing counts once it has passed.
 */
export function countdown(c: ChapterDates, today: string): Countdown | null {
  const s = dayOf(c.start_date);
  const e = dayOf(c.end_date);
  if (s && e && s !== e) {
    if (today < s) return daysToGo(daysFrom(today, s), 'starts');
    if (today <= e)
      return {
        kind: 'word',
        big: `Day ${daysFrom(s, today) + 1}`,
        label: `of ${daysFrom(s, e) + 1}`,
      };
    return null;
  }
  const d = e || s;
  if (!d || d < today) return null;
  return daysToGo(daysFrom(today, d), e ? 'ends' : 'starts');
}

function daysToGo(n: number, which: 'starts' | 'ends'): Countdown {
  if (n === 0)
    return { kind: 'word', big: 'Today', label: which === 'starts' ? 'it starts' : 'is the day' };
  return { kind: 'days', n, label: n === 1 ? 'day to go' : 'days to go' };
}

/** The line that says when a Chapter is, in words. */
export function whenLine(c: ChapterDates, today: string): string {
  const s = dayOf(c.start_date);
  const e = dayOf(c.end_date);
  if (s && e && s !== e) return dayRange(s, e);
  if (e) return `By ${dayShort(e)}`;
  if (s) return s > today ? dayShort(s) : `Since ${dayPlain(s)}`;
  return 'No date yet';
}

/** Fri 20 to Sun 22 Nov, or Mon 30 Nov to Tue 1 Dec across months. */
export function dayRange(a: string, b: string): string {
  if (a.slice(0, 7) === b.slice(0, 7)) return `${fmt(a, 'EEE d')} to ${dayShort(b)}`;
  return `${dayShort(a)} to ${dayShort(b)}`;
}

/** When a closed Chapter was, for Looking back: Dec 2026. */
export function closedWhen(c: Pick<Chapter, 'start_date' | 'end_date' | 'closed_at'>): string {
  const d = dayOf(c.end_date) || dayOf(c.closed_at) || dayOf(c.start_date);
  return d ? monthYear(d) : '';
}

// ---------------------------------------------------------------------------
// What belongs where
// ---------------------------------------------------------------------------

/** Item ids filed in each World and each Chapter, by type. */
export interface Filed {
  inWorld: Map<string, { todo: Set<string>; note: Set<string>; habit: Set<string> }>;
  inChapter: Map<string, { todo: Set<string>; note: Set<string>; habit: Set<string> }>;
  /** Every item filed in any Chapter */
  anyChapter: { todo: Set<string>; note: Set<string>; habit: Set<string> };
}

const emptySets = () => ({
  todo: new Set<string>(),
  note: new Set<string>(),
  habit: new Set<string>(),
});

/** Index the links once, for the screens to read from. */
export function filedIndex(worldLinks: DropWorldLink[], chapterLinks: DropChapterLink[]): Filed {
  const inWorld: Filed['inWorld'] = new Map();
  const inChapter: Filed['inChapter'] = new Map();
  const anyChapter = emptySets();
  for (const l of worldLinks || []) {
    if (!inWorld.has(l.world_id)) inWorld.set(l.world_id, emptySets());
    inWorld.get(l.world_id)![l.drop_type]?.add(l.drop_id);
  }
  for (const l of chapterLinks || []) {
    if (!inChapter.has(l.chapter_id)) inChapter.set(l.chapter_id, emptySets());
    inChapter.get(l.chapter_id)![l.drop_type]?.add(l.drop_id);
    anyChapter[l.drop_type]?.add(l.drop_id);
  }
  return { inWorld, inChapter, anyChapter };
}

export const isDone = (t: Pick<Todo, 'completed_at'>) => !!t.completed_at;
const liveItem = (i: { archived?: boolean }) => !i.archived;

/** Open steps by their due day, undated last, then done ones, newest first. */
function byStep(a: Todo, b: Todo): number {
  const da = isDone(a);
  const dbn = isDone(b);
  if (da !== dbn) return da ? 1 : -1;
  if (da) return String(b.completed_at).localeCompare(String(a.completed_at));
  const xa = dayOf(a.due_day) || '9999-12-31';
  const xb = dayOf(b.due_day) || '9999-12-31';
  if (xa !== xb) return xa < xb ? -1 : 1;
  return String(a.created_at).localeCompare(String(b.created_at));
}

/** A Chapter's steps: the todos filed in it. */
export function chapterSteps(chapterId: string, todos: Todo[], filed: Filed): Todo[] {
  const ids = filed.inChapter.get(chapterId)?.todo;
  if (!ids?.size) return [];
  return todos.filter((t) => ids.has(t.id) && liveItem(t)).sort(byStep);
}

/** The first step not yet ticked, or null. */
export const nextStep = (steps: Todo[]) => steps.find((t) => !isDone(t)) || null;

/** How many steps are ticked, of how many. */
export function progress(steps: Todo[]): { done: number; total: number } {
  return { done: steps.filter(isDone).length, total: steps.length };
}

/** "2 of 5 steps done", or empty when there are no steps. */
export function stepsLine(steps: Todo[]): string {
  if (!steps.length) return '';
  const p = progress(steps);
  return `${p.done} of ${p.total} ${p.total === 1 ? 'step' : 'steps'} done`;
}

/** A note that is a list. */
export const isList = (n: Pick<Note, 'has_list' | 'list_items'>) =>
  !!n.has_list || (Array.isArray(n.list_items) && n.list_items.length > 0);

/** Lists first, then the newest thing kept. */
function byKept(a: Note, b: Note): number {
  const la = isList(a) ? 0 : 1;
  const lb = isList(b) ? 0 : 1;
  if (la !== lb) return la - lb;
  return String(b.created_at).localeCompare(String(a.created_at));
}

/** What is kept on a Chapter: its notes and lists. */
export function chapterKept(chapterId: string, notes: Note[], filed: Filed): Note[] {
  const ids = filed.inChapter.get(chapterId)?.note;
  if (!ids?.size) return [];
  return notes.filter((n) => ids.has(n.id) && liveItem(n)).sort(byKept);
}

/** A Chapter's habits. */
export function chapterHabits(chapterId: string, habits: Habit[], filed: Filed): Habit[] {
  const ids = filed.inChapter.get(chapterId)?.habit;
  if (!ids?.size) return [];
  return habits.filter((h) => ids.has(h.id) && liveItem(h as { archived?: boolean }));
}

/**
 * A World's loose things: what is filed in the World and in none of the
 * Chapters. Ticked todos are left out of a World's list; they live on in
 * the item's own history.
 */
export function worldLoose(
  worldId: string,
  data: { todos: Todo[]; notes: Note[]; habits: Habit[] },
  filed: Filed,
): { todos: Todo[]; kept: Note[]; habits: Habit[] } {
  const ids = filed.inWorld.get(worldId);
  if (!ids) return { todos: [], kept: [], habits: [] };
  const free = (type: 'todo' | 'note' | 'habit', id: string) =>
    ids[type].has(id) && !filed.anyChapter[type].has(id);
  return {
    todos: data.todos.filter((t) => free('todo', t.id) && liveItem(t) && !isDone(t)).sort(byStep),
    kept: data.notes.filter((n) => free('note', n.id) && liveItem(n)).sort(byKept),
    habits: data.habits.filter((h) => free('habit', h.id) && liveItem(h as { archived?: boolean })),
  };
}

/** A World's Chapters, by state. */
export function worldChapters(worldId: string, chapters: Chapter[], today: string) {
  const mine = chapters.filter((c) => c.primary_world_id === worldId);
  return {
    live: liveChapters(mine, today),
    waiting: waitingChapters(mine, today),
    closed: closedChapters(mine),
  };
}

/**
 * The todos Today should leave out: steps left on a closed Chapter stay with
 * it and leave Today (James's call, round two).
 */
export function stepsOnClosedChapters(chapters: Chapter[], filed: Filed): Set<string> {
  const out = new Set<string>();
  for (const c of chapters) {
    if (!isClosedChapter(c)) continue;
    for (const id of filed.inChapter.get(c.id)?.todo || []) out.add(id);
  }
  return out;
}

/** When a step is due, in words. */
export function dueWords(t: Pick<Todo, 'due_day'>, today: string): string {
  const d = dayOf(t.due_day);
  if (!d) return '';
  const n = daysFrom(today, d);
  if (n < 0) return `Was due ${dayShort(d)}`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due ${dayShort(d)}`;
}
