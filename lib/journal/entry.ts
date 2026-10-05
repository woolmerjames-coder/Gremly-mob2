/**
 * Journal entries as the page, the Hub's list and the calendar look them up:
 * the day an entry belongs to, the entries of a day, the days that have one,
 * and the entry that is a day's page.
 *
 * A day can hold more than one entry: the page written that evening, and
 * perhaps a drop Gremly filed as a journal entry at lunchtime. Each is its
 * own entry. Only one of them is the day's page, the one the wrap up and the
 * journal page both write to.
 */
import { getDateService } from '../date/DateService';
import { journalFor } from '../wrapup/journal';

export type JournalEntry = {
  id: string;
  title?: string | null;
  body?: string | null;
  mood?: string[] | null;
  subtype?: string | null;
  journal_subtype?: string | null;
  archived?: boolean | null;
  created_at: string;
  /** The day the entry is about, when it was given one */
  date?: string | null;
  views?: Record<string, unknown> | null;
  /** Its photos, as the app loaded them with the entry */
  log_photos?: unknown;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isJournal(note: { subtype?: string | null; archived?: boolean | null }): boolean {
  return note.subtype === 'journal' && !note.archived;
}

/**
 * The person's day an entry belongs to. One from a wrap up or the page says
 * its day itself, which after midnight is still the day before. Any other is
 * the day it is about, or the day it was written.
 */
export function entryDay(entry: Pick<JournalEntry, 'created_at' | 'date' | 'views'>): string {
  const marked = entry.views?.sweep_date;
  if (typeof marked === 'string' && DAY.test(marked)) return marked;
  const ds = getDateService();
  return ds.dayOf(entry.date) ?? ds.dayOf(entry.created_at) ?? '';
}

/** Every journal entry, newest day first, and within a day in the order written. */
export function journalEntries<T extends JournalEntry>(notes: T[]): T[] {
  return notes
    .filter(isJournal)
    .map((n) => ({ n, day: entryDay(n) }))
    .sort((a, b) =>
      a.day === b.day ? a.n.created_at.localeCompare(b.n.created_at) : b.day.localeCompare(a.day),
    )
    .map((x) => x.n);
}

/** A day's entries, in the order written. */
export function entriesOn<T extends JournalEntry>(notes: T[], day: string): T[] {
  return journalEntries(notes).filter((n) => entryDay(n) === day);
}

/** The days that have an entry, as YYYY-MM-DD. */
export function daysWithEntries(notes: JournalEntry[]): Set<string> {
  const days = new Set<string>();
  for (const n of notes) {
    if (!isJournal(n)) continue;
    const day = entryDay(n);
    if (day) days.add(day);
  }
  return days;
}

/** The entry that is a day's page: the one the wrap up and the journal page write to. */
export function pageEntryFor<T extends JournalEntry>(notes: T[], day: string): T | null {
  const id = journalFor(notes, day);
  return id ? (notes.find((n) => n.id === id) ?? null) : null;
}

/** The entries written before and after this one, for stepping through the journal. */
export function neighbours<T extends JournalEntry>(
  notes: T[],
  id: string,
): { before: T | null; after: T | null } {
  const oldestFirst = notes
    .filter(isJournal)
    .map((n) => ({ n, day: entryDay(n) }))
    .sort((a, b) =>
      a.day === b.day ? a.n.created_at.localeCompare(b.n.created_at) : a.day.localeCompare(b.day),
    )
    .map((x) => x.n);
  const at = oldestFirst.findIndex((n) => n.id === id);
  if (at < 0) return { before: null, after: null };
  return { before: oldestFirst[at - 1] ?? null, after: oldestFirst[at + 1] ?? null };
}

/** A goal check in written from a Space, which keeps its goal with it. */
export function checkInOf(
  entry: Pick<JournalEntry, 'views'>,
): { goal_id: string; goal_name: string } | null {
  const c = entry.views?.goal_checkin as { goal_id?: unknown; goal_name?: unknown } | undefined;
  return c && typeof c.goal_id === 'string' && typeof c.goal_name === 'string'
    ? { goal_id: c.goal_id, goal_name: c.goal_name }
    : null;
}
