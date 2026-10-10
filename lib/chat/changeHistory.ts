/**
 * An item's history: the changes the user said yes to in chat, Mind Drop,
 * today's thread or Sweep,
 * kept on the item itself (views.change_log), so the item overlay can say
 * "Moved to Mon 5 Oct, 3:00pm" and what it was, above the words they first
 * wrote.
 *
 * Those words stay as they were. views.original_text is a copy taken at the
 * first change, so the overlay can label them as the original for as long as
 * nobody has rewritten them. Edits the user makes in the overlay themselves
 * are not history: only a confirmed chat or Mind Drop change is logged, and
 * Undo takes its entry back out.
 *
 * Mockup is spec: the "Item history after an edit" canvas, Recommended
 * artboard (September 2026).
 */
import { getDateService } from '../date/DateService';
import type { EntityCardChange } from '../types';

export type ChangeSource = 'minddrop' | 'chat' | 'thread' | 'sweep';

const SOURCES = new Set<string>(['minddrop', 'chat', 'thread', 'sweep']);

export interface ChangeEntry {
  id: string;
  /** The item card's field names, and the change model's for the rest (lib/changes) */
  field: string;
  /** The value before, as the field stores it. */
  from: string | null;
  /** The value after, as the field stores it. */
  to: string;
  /** How it read before: "Fri 2 Oct, 10:00am", the old name. Null when there was none. */
  was: string | null;
  /** How it reads now: "Mon 5 Oct, 3:00pm", the new name, the words added. */
  now: string | null;
  /** When the change was made, ISO. */
  at: string;
  source: ChangeSource;
}

/** Plenty for an item's life; the oldest go first. */
export const CHANGE_LOG_MAX = 20;

type Views = Record<string, unknown>;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FIELDS = new Set<string>([
  'due_day',
  'due_time',
  'name',
  'frequency',
  'body',
  'body_add',
  'completed',
  'logged',
  // the change model's other fields (workers/shared/changes/fields.js)
  'deadline',
  'length',
  'start_day',
  'end_day',
  'end_time',
  'reminder_day',
  'reminder',
  'list',
  'part_of_day',
  // a note's kind: note, event or idea
  'kind',
  'worlds',
  'chapters',
  'tags',
  'pinned',
  'favourite',
]);

/** "Mon 5 Oct" from YYYY-MM-DD. Always the date itself: a history line should not say Today a week later. */
export function historyDay(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = getDateService().fromLocalDate(dateStr.slice(0, 10));
  if (!d || isNaN(d.getTime())) return dateStr;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "3:00pm" from HH:mm. */
function clock(time: string | null | undefined): string {
  if (!time) return '';
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return time;
  const h = parseInt(m[1], 10);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]}${h >= 12 ? 'pm' : 'am'}`;
}

/** "Mon 5 Oct, 3:00pm", either half on its own when that is all there is. */
export function historyWhen(
  day: string | null | undefined,
  time: string | null | undefined,
): string {
  return [historyDay(day), clock(time)].filter(Boolean).join(', ');
}

/** How the item read before and after a change, in the words the history shows. */
export function historyWords(
  entity: {
    title?: string | null;
    due_day?: string | null;
    target_date?: string | null;
    due_time?: string | null;
  },
  change: Pick<EntityCardChange, 'field' | 'from' | 'to'>,
): { was: string | null; now: string | null } {
  switch (change.field) {
    case 'due_day':
      return {
        was: change.from ? historyWhen(change.from, entity.due_time) : null,
        now: historyWhen(change.to, entity.due_time) || null,
      };
    case 'due_time': {
      const day = entity.due_day ?? entity.target_date;
      return {
        was: change.from ? historyWhen(day, change.from) : null,
        now: historyWhen(day, change.to) || null,
      };
    }
    case 'name':
      return { was: change.from || entity.title || null, now: change.to };
    case 'body':
      return { was: null, now: null };
    case 'body_add':
      return { was: null, now: change.to };
    default:
      return { was: change.from || null, now: change.to };
  }
}

function asViews(views: unknown): Views {
  return views && typeof views === 'object' && !Array.isArray(views) ? (views as Views) : {};
}

function isEntry(e: unknown): e is ChangeEntry {
  if (!e || typeof e !== 'object') return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.field === 'string' &&
    FIELDS.has(x.field) &&
    typeof x.to === 'string' &&
    typeof x.at === 'string' &&
    typeof x.source === 'string' &&
    SOURCES.has(x.source)
  );
}

/** The item's history, oldest first. Anything that does not read as an entry is left out. */
export function changeLogOf(views: unknown): ChangeEntry[] {
  const log = asViews(views).change_log;
  return Array.isArray(log) ? log.filter(isEntry) : [];
}

export function originalTextOf(views: unknown): string | null {
  const t = asViews(views).original_text;
  return typeof t === 'string' && t.trim() ? t : null;
}

function withEntry(
  views: unknown,
  entry: ChangeEntry,
  bodyBefore: string | null | undefined,
): Views {
  const next: Views = { ...asViews(views) };
  next.change_log = [...changeLogOf(views), entry].slice(-CHANGE_LOG_MAX);
  // the words as they were before anything changed; only the first change takes the copy
  if (!originalTextOf(views) && bodyBefore?.trim()) next.original_text = bodyBefore;
  return next;
}

function withoutEntry(views: unknown, id: string): Views {
  const next: Views = { ...asViews(views) };
  const log = changeLogOf(views).filter((e) => e.id !== id);
  if (log.length) {
    next.change_log = log;
  } else {
    delete next.change_log;
    delete next.original_text;
  }
  return next;
}

function replacing(views: unknown, entry: ChangeEntry): Views {
  return {
    ...asViews(views),
    change_log: changeLogOf(views).map((e) => (e.id === entry.id ? entry : e)),
  };
}

function newId(): string {
  return `${getDateService().now().getTime().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * The item's views with one entry added, worded by the caller, and how to take
 * it back out for Undo. With join, the entry replaces the last one instead
 * (a time that came with the day change just made).
 */
export function recordEntry(
  views: unknown,
  words: { field: string; from: string | null; to: string; was: string | null; now: string | null },
  source: ChangeSource,
  bodyBefore: string | null | undefined,
  join = false,
): { views: Views; undo: (current: unknown) => Views } {
  const log = changeLogOf(views);
  const last = log[log.length - 1];
  if (join && last) {
    const joined: ChangeEntry = { ...last, now: words.now };
    return { views: replacing(views, joined), undo: (current) => replacing(current, last) };
  }
  const entry: ChangeEntry = {
    id: newId(),
    ...words,
    at: getDateService().now().toISOString(),
    source,
  };
  return {
    views: withEntry(views, entry, bodyBefore),
    undo: (current) => withoutEntry(current, entry.id),
  };
}

/**
 * The item's views with this change logged, and how to take it back out for
 * Undo (given the views as they are by then, so anything else that changed
 * meanwhile stays). With sameChange, a time that came with the day change
 * just made joins that line instead of adding a second one.
 */
export function recordChange(
  views: unknown,
  entity: Parameters<typeof historyWords>[0],
  change: Pick<EntityCardChange, 'field' | 'from' | 'to'>,
  source: ChangeSource,
  bodyBefore: string | null | undefined,
  sameChange = false,
): { views: Views; undo: (current: unknown) => Views } {
  const words = historyWords(entity, change);
  const log = changeLogOf(views);
  const last = log[log.length - 1];
  if (sameChange && last && last.field === 'due_day' && change.field === 'due_time') {
    const joined: ChangeEntry = { ...last, now: words.now };
    return { views: replacing(views, joined), undo: (current) => replacing(current, last) };
  }
  const entry: ChangeEntry = {
    id: newId(),
    field: change.field,
    from: change.from ?? null,
    to: change.to,
    was: words.was,
    now: words.now,
    at: getDateService().now().toISOString(),
    source,
  };
  return {
    views: withEntry(views, entry, bodyBefore),
    undo: (current) => withoutEntry(current, entry.id),
  };
}

// ── What the overlay shows ───────────────────────────────────────────────────

export type HistoryIcon = 'moved' | 'renamed' | 'repeat' | 'added' | 'note' | 'done' | 'logged';

/** The headline of one change: "Moved to Mon 5 Oct, 3:00pm". */
export function changeLine(entry: ChangeEntry): { icon: HistoryIcon; title: string } {
  switch (entry.field) {
    case 'due_day':
    case 'due_time':
      return { icon: 'moved', title: entry.now ? `Moved to ${entry.now}` : 'Moved' };
    case 'name':
      return { icon: 'renamed', title: `Renamed to “${entry.now ?? entry.to}”` };
    case 'frequency':
      return { icon: 'repeat', title: `Changed to ${entry.now ?? entry.to}` };
    case 'body':
      return { icon: 'note', title: 'Rewrote its note' };
    case 'body_add':
      return { icon: 'added', title: 'Added to its notes' };
    case 'completed':
      return { icon: 'done', title: 'Marked done' };
    case 'logged':
      return { icon: 'logged', title: `Logged for ${historyDay(entry.to)}` };
    case 'deadline':
      return { icon: 'moved', title: entry.now ? `Due ${entry.now}` : 'Deadline taken off' };
    case 'start_day':
      return { icon: 'moved', title: entry.now ? `Starts ${entry.now}` : 'Start day taken off' };
    case 'end_day':
      return { icon: 'moved', title: entry.now ? `Ends ${entry.now}` : 'End day taken off' };
    case 'end_time':
      return { icon: 'moved', title: entry.now ? `Ends at ${entry.now}` : 'End time taken off' };
    case 'reminder_day':
      return {
        icon: 'moved',
        title: entry.now ? `Reminder on ${entry.now}` : 'Reminder taken off',
      };
    case 'length':
      return { icon: 'note', title: entry.now ? `Takes ${entry.now}` : 'Length taken off' };
    case 'reminder':
      return { icon: 'note', title: entry.now ?? 'Reminders changed' };
    case 'list':
      return { icon: 'added', title: entry.now ?? 'List updated' };
    case 'part_of_day':
      return {
        icon: 'moved',
        title: entry.now ? `Set for the ${entry.now}` : 'Part of the day taken off',
      };
    case 'kind':
      return { icon: 'note', title: `Made ${entry.to === 'note' ? 'a note' : `an ${entry.to}`}` };
    case 'worlds':
    case 'chapters':
    case 'tags':
      return { icon: 'note', title: entry.now ?? 'Changed' };
    case 'pinned':
      return { icon: 'note', title: entry.to === 'true' ? 'Pinned' : 'Unpinned' };
    case 'favourite':
      return {
        icon: 'note',
        title: entry.to === 'true' ? 'Marked as a favourite' : 'No longer a favourite',
      };
    default:
      return { icon: 'note', title: 'Changed' };
  }
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "just now", "5 min ago", "3 hr ago", "yesterday", then the date. */
export function agoWords(at: string, now: Date): string {
  const then = new Date(at);
  if (isNaN(then.getTime())) return '';
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (ymd(then) === ymd(now)) return `${Math.floor(mins / 60)} hr ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (ymd(then) === ymd(yesterday)) return 'yesterday';
  return historyDay(ymd(then));
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** The small line under it: "was Fri 2 Oct, 10:00am · from Mind Drop · just now". */
export function changeDetail(entry: ChangeEntry, now: Date): string {
  const parts: string[] = [];
  if (entry.field === 'due_day' || entry.field === 'due_time') {
    parts.push(
      entry.was ? `was ${entry.was}` : entry.field === 'due_day' ? 'had no day' : 'had no time',
    );
  } else if (entry.field === 'name' && entry.was) {
    parts.push(`was “${entry.was}”`);
  } else if (entry.field === 'frequency' && entry.was) {
    parts.push(`was ${entry.was}`);
  } else if (entry.field === 'body_add' && entry.now) {
    parts.push(`“${clip(entry.now, 32)}”`);
  }
  parts.push(
    entry.source === 'chat'
      ? 'from chat'
      : entry.source === 'thread'
        ? "from today's thread"
        : entry.source === 'sweep'
          ? 'from Sweep'
          : 'from Mind Drop',
  );
  const ago = agoWords(entry.at, now);
  if (ago) parts.push(ago);
  return parts.join(' · ');
}

/** Where the item began, the last line of the opened history. */
export function originLine(
  origin: string | null | undefined,
  createdAt: string | null | undefined,
): { title: string; detail: string } | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return null;
  const title =
    origin === 'catchall'
      ? 'Dropped into Mind Drop'
      : origin === 'space_chat' || origin === 'chat_save'
        ? 'Saved from chat'
        : 'Created';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { title, detail: historyWhen(ymd(d), time) };
}

/** The label over the words they first wrote. */
export function originalLabelWords(
  origin: string | null | undefined,
  dropId?: string | null,
): string {
  return origin === 'catchall' || dropId ? 'Your original drop' : 'Your original words';
}

/** "Wed 30 Sep", the day the item was made, beside the label. */
export function createdDay(createdAt: string | null | undefined): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  return isNaN(d.getTime()) ? '' : historyDay(ymd(d));
}

/** The label shows only while the words are still exactly the ones first written. */
export function showsOriginalLabel(views: unknown, body: string | null | undefined): boolean {
  const original = originalTextOf(views);
  if (!original || changeLogOf(views).length === 0) return false;
  return (body ?? '').trim() === original.trim();
}

function normTime(t: string | null | undefined): string {
  const m = (t ?? '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** The Date & time row says Updated while the last day or time change still holds. */
export function dateStillUpdated(
  entries: ChangeEntry[],
  current: { day?: string | null; time?: string | null },
): boolean {
  const last = [...entries].reverse().find((e) => e.field === 'due_day' || e.field === 'due_time');
  if (!last) return false;
  if (last.field === 'due_day')
    return !!current.day && current.day.slice(0, 10) === last.to.slice(0, 10);
  return !!normTime(current.time) && normTime(current.time) === normTime(last.to);
}
