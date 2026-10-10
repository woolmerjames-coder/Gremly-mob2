/**
 * dropReminder.ts: the reminder a drop asked for (remind me), saved on its item
 * once the reminder call (Phase 2b) has answered.
 *
 * Moved here from dropPipeline.ts in the Mind Drop rethink (stage 4, 9 Oct
 * 2026): the reminder now arrives with the details, at the settle or later,
 * rather than at the end of the queue. Before stage 4 the classifier's
 * reminder_intent was never copied onto the drop, so this never ran.
 */
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService } from '../date/DateService';
import { maybeAsk } from '../notifications/ask';
import { hhmm, localDay } from '../reminders/reminders';
import type { ItemReminder } from '../types';
import { callPhase2b, type ReminderDetails } from './dropDetails';
import { updateDropRow, type DropKind, type SavedDropRow } from './dropSync';

export async function scheduleDropReminder(
  saved: SavedDropRow,
  reminder: ReminderDetails | null | undefined,
): Promise<void> {
  if (!reminder?.auto_reminder) return;
  try {
    const { entityType, id: entityId } = saved;

    // Skip external calendar events
    if (entityType === 'note') {
      const note = useGremlyStore.getState().notes.find((n) => n.id === entityId);
      if (note?.external_source != null) return;
    }

    const frequency =
      reminder.reminder_frequency === 'daily' ? ('daily' as const) : ('once' as const);
    const hasDate = !!reminder.reminder_date;

    const reminderToSave: ItemReminder = hasDate
      ? {
          id: `auto-${getDateService().now().getTime()}`,
          time: reminder.reminder_time || '09:00',
          frequency,
          date: frequency === 'once' ? reminder.reminder_date! : undefined,
        }
      : (() => {
          // two hours from now, on the right day even near midnight
          const at = new Date(getDateService().now().getTime() + 2 * 60 * 60 * 1000);
          return {
            id: `auto-quick-${getDateService().now().getTime()}`,
            time: hhmm(at.getHours(), at.getMinutes()),
            frequency: 'once' as const,
            date: localDay(at),
          };
        })();

    // Reminders the person set themselves stay; an earlier automatic one for
    // this drop is replaced (a drop asked again after a restart adds no second).
    // Written on the row as the database holds it now, in turn with every other
    // write to it (updateDropRow), so a late reminder never puts back an answer.
    const wrote = await updateDropRow(entityType, entityId, 'reminder', (row) => {
      const kept = (Array.isArray(row.reminders_json) ? row.reminders_json : []).filter(
        (r: ItemReminder) => !String(r?.id ?? '').startsWith('auto-'),
      );
      return { reminders: [...kept, reminderToSave] };
    });
    if (!wrote) return;

    console.log('[DropReminder] Auto-reminder saved', {
      entityId,
      date: reminderToSave.date,
      time: reminderToSave.time,
    });

    // The server sends it. If notifications are off, this is the moment to ask.
    void maybeAsk('bell');
  } catch (err) {
    console.warn('[DropReminder] Auto-reminder failed', { error: String(err) });
  }
}

/**
 * The reminder call for an item whose question was just answered (final check
 * item 5): an unclear drop has no reminder until then. Runs only when the
 * classifier heard a remind me on the drop; never rejects.
 */
export async function remindAfterAnswer(
  saved: SavedDropRow,
  text: string,
  kind: Pick<DropKind, 'bucket' | 'subtype'>,
): Promise<void> {
  try {
    const reminder = await callPhase2b(text, kind.bucket, kind.subtype);
    await scheduleDropReminder(saved, reminder);
  } catch (err) {
    console.warn('[DropReminder] the reminder after an answer did not go through', {
      id: saved.id,
      error: String(err),
    });
  }
}
