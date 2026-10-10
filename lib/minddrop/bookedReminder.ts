/**
 * bookedReminder.ts: Want a reminder? after a booked appointment's day (Mind
 * Drop rethink, James's 9 October ask on When is it?). Asked once, on the
 * card, after the day is picked: The evening before, An hour before (only
 * when a time is set) and No thanks. Only reminders that are still ahead are
 * offered; when none is, the question is not asked.
 *
 * The reminder is saved on the item's reminders as a 'before' reminder, which
 * the server counts back from the event's day and time (target_date and
 * event_time) and sends.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { addReminderToItem, beforeReminder } from '../reminders/save';
import { PlainError } from './plainError';

export type BookedReminder = 'evening' | 'hour';

/** The evening before is 6pm the day before, as the server sends it. */
const EVENING_MINUTES = 18 * 60;

const dayBefore = (day: string) => getDateService().addDays(day, -1);

function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** A moment (a day and minutes into it) is after the clock's day and minutes. */
function isAhead(day: string, minutes: number, clockDay: string, clockMinutes: number): boolean {
  return day > clockDay || (day === clockDay && minutes > clockMinutes);
}

/**
 * The reminders worth offering for an appointment on `day` (at `time`), given
 * the clock now (its date and minutes past midnight, in the person's zone).
 */
export function remindersAhead(
  day: string,
  time: string | null,
  clockDay: string,
  clockMinutes: number,
): BookedReminder[] {
  const out: BookedReminder[] = [];
  if (isAhead(dayBefore(day), EVENING_MINUTES, clockDay, clockMinutes)) out.push('evening');
  const start = minutesOf(time);
  if (start !== null) {
    const at = start - 60;
    const ahead =
      at >= 0
        ? isAhead(day, at, clockDay, clockMinutes)
        : isAhead(dayBefore(day), at + 24 * 60, clockDay, clockMinutes);
    if (ahead) out.push('hour');
  }
  return out;
}

/** The reminders still ahead for an appointment, by the clock now. */
export function remindersAheadNow(day: string, time: string | null): BookedReminder[] {
  const ds = getDateService();
  return remindersAhead(day, time, ds.calendarDay(), ds.minutesIntoDay() % (24 * 60));
}

/** Save the reminder picked on the item the drop became (found by its id or drop id). */
export async function remindBefore(id: string, which: BookedReminder): Promise<void> {
  const s = useGremlyStore.getState();
  const match = (x: { id: string; drop_id?: string | null; archived?: boolean | null }) =>
    (x.id === id || x.drop_id === id) && x.archived !== true;
  const note = (s.notes || []).find(match);
  const todo = note ? null : (s.todos || []).find(match);
  const habit = note || todo ? null : (s.habits || []).find(match);
  const found = note
    ? { type: 'note' as const, id: note.id }
    : todo
      ? { type: 'todo' as const, id: todo.id }
      : habit
        ? { type: 'habit' as const, id: habit.id }
        : null;
  if (!found) throw new PlainError('That one is no longer on your list.');
  const reminder = beforeReminder(which === 'evening' ? 24 * 60 : 60, getDateService().now());
  await addReminderToItem(found.type, found.id, reminder);
}
