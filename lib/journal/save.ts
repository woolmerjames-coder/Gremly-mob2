/**
 * Saving what was written on the journal page, when the page saves it itself
 * (from the Hub, Today or a Space). In the wrap up, the wrap up saves it.
 *
 * A new page becomes the day's entry, the same one the wrap up writes. A
 * saved entry is changed in place. A check in on a goal is an entry of its
 * own, kept with the goal.
 */
import { saveCheckIn, saveJournal, updateJournal } from '../wrapup/journal';
import { dayWords } from './words';
import type { JournalGoal, JournalPart, JournalSaveResult, JournalWritten } from './session';

export async function savePage(p: {
  day: string;
  part?: JournalPart;
  /** The saved entry being changed. Left out for a new page. */
  entryId?: string | null;
  /** The goal a new check in is for */
  goal?: JournalGoal | null;
  written: JournalWritten;
}): Promise<JournalSaveResult & { noteId?: string }> {
  const { text, layout, moods } = p.written;
  if (p.entryId) {
    const res = await updateJournal({ noteId: p.entryId, text, moods, page: layout });
    return res.ok ? { ok: true, noteId: p.entryId } : res;
  }
  if (p.goal) {
    const res = await saveCheckIn({ text, moods, goal: p.goal, page: layout });
    return res.ok ? { ok: true, noteId: res.noteId } : res;
  }
  const res = await saveJournal({
    text,
    moods,
    day: p.day,
    weekday: dayWords(p.day).weekday,
    part: p.part,
    page: layout,
  });
  return res.ok ? { ok: true, noteId: res.noteId } : res;
}
