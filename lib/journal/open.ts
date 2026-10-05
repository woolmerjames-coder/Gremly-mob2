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
 * Opens a saved entry on the page, to read. False when the page is not the
 * place for it: it is not a journal entry, it has been taken out of the
 * journal, or it is a drop still waiting to be sorted.
 */
export function openEntryOnPage(id: string): boolean {
  const notes = useGremlyStore.getState().notes as unknown as (JournalEntry & {
    labels?: string[] | null;
  })[];
  const entry = notes.find((n) => n.id === id);
  if (!entry || !isJournal(entry) || entry.labels?.includes(UNSORTED)) return false;
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
