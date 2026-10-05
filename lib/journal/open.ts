/**
 * How the rest of the app reaches the journal page.
 *
 * The add and edit overlay asks here before it opens. A journal entry tapped
 * anywhere (the Hub, Today, a Space, a card in chat) opens on the page, and a
 * new one started anywhere is written there.
 */
import { getDateService } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import { entryDay, isJournal, type JournalEntry } from './entry';
import { openJournal } from './session';

/** A drop still waiting to be sorted. The overlay sorts those, whatever kind they look like. */
const UNSORTED = 'needs_review';

/**
 * The saved entry with this id, when the page is the place for it. It is not
 * when the item is not a journal entry, has been taken out of the journal, or
 * is a drop still waiting to be sorted.
 */
function pageEntry(id: string): JournalEntry | null {
  const notes = useGremlyStore.getState().notes as unknown as (JournalEntry & {
    labels?: string[] | null;
  })[];
  const entry = notes.find((n) => n.id === id);
  return entry && isJournal(entry) && !entry.labels?.includes(UNSORTED) ? entry : null;
}

/** Whether an item opens on the journal page. */
export function opensOnPage(id: string): boolean {
  return !!pageEntry(id);
}

/** Opens a saved entry on the page, to read. False when the page is not the place for it. */
export function openEntryOnPage(id: string): boolean {
  const entry = pageEntry(id);
  if (!entry) return false;
  openJournal({
    day: entryDay(entry) || getDateService().ritualDay(),
    entryId: entry.id,
    reading: true,
  });
  return true;
}

/** Opens the day's page to write on, starting with any words already typed. */
export function writeOnPage(words?: string | null): void {
  const carry = words?.trim();
  openJournal({ day: getDateService().ritualDay(), carry: carry || undefined });
}
