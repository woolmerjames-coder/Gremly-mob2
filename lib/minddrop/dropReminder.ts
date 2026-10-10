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
import { supabase } from '../supabase/client';
import { getDateService, nowTimestamp } from '../date/DateService';
import { maybeAsk } from '../notifications/ask';
import { hhmm, localDay } from '../reminders/reminders';
import type { ItemReminder } from '../types';
import type { ReminderDetails } from './dropDetails';
import type { SavedDropRow } from './dropSync';

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
    // this drop is replaced (a drop asked again after a restart adds no second)
    const table = entityType === 'todo' ? 'todos' : entityType === 'habit' ? 'habits' : 'notes';
    const { data: row, error: readError } = await supabase
      .from(table)
      .select('reminders_json')
      .eq('id', entityId)
      .single();
    if (readError) throw readError;
    const kept = (Array.isArray(row?.reminders_json) ? row.reminders_json : []).filter(
      (r: ItemReminder) => !String(r?.id ?? '').startsWith('auto-'),
    );
    const reminders = [...kept, reminderToSave];
    const { error } = await supabase
      .from(table)
      .update({ reminders_json: reminders, updated_at: nowTimestamp() })
      .eq('id', entityId);
    if (error) throw error;

    useGremlyStore.setState((state) => ({
      [table]: (state[table] as any[]).map((item: any) =>
        item.id === entityId ? { ...item, reminders } : item,
      ),
    }));

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
