/**
 * Adding a reminder to an item from anywhere outside the item's own sheet
 * (the morning brief, Today, a notification's Snooze). The reminder is saved
 * on the item; the server plans and sends it.
 */
import { supabase } from '../supabase/client';
import { updateDropRow } from '../minddrop/dropSync';
import { getDateService } from '../date/DateService';
import type { ItemReminder } from '../types';
import { cleanReminders, hhmm, localDay, newReminderId } from './reminders';

export type ReminderItemType = 'todo' | 'habit' | 'note' | 'person';
const TABLE: Record<ReminderItemType, string> = {
  todo: 'todos',
  habit: 'habits',
  note: 'notes',
  person: 'people',
};

/** An event reminder: minutes before the start, or the evening before for a day or more. */
export function beforeReminder(minutesBefore: number, now: Date): ItemReminder {
  return minutesBefore >= 1440
    ? { id: newReminderId(now), kind: 'before', evening: true }
    : { id: newReminderId(now), kind: 'before', minutes: minutesBefore };
}

/** A one off reminder some minutes from now, on the right day even near midnight. */
export function inMinutes(minutes: number, now: Date): ItemReminder {
  const at = new Date(now.getTime() + minutes * 60000);
  return {
    id: newReminderId(now),
    frequency: 'once',
    date: localDay(at),
    time: hhmm(at.getHours(), at.getMinutes()),
  };
}

/**
 * Adds the reminder to the item, keeping the ones it already has. A todo,
 * habit or note is changed on its row as the database holds it now, in turn
 * with every other write to that row (updateDropRow: a drop's late details or
 * reminder never put it back), and through the store. Throws when the item
 * has gone.
 */
export async function addReminderToItem(
  type: ReminderItemType,
  id: string,
  reminder: ItemReminder,
): Promise<void> {
  const now = getDateService().now();
  if (type !== 'person') {
    const wrote = await updateDropRow(type, id, 'add_reminder', (row) => ({
      reminders: [
        ...cleanReminders(
          Array.isArray(row.reminders_json) ? (row.reminders_json as ItemReminder[]) : [],
          now,
        ),
        reminder,
      ],
    }));
    if (!wrote) throw new Error(`[Reminders] the ${type} is no longer there`);
    return;
  }
  const { data } = await supabase
    .from(TABLE[type])
    .select('reminders_json')
    .eq('id', id)
    .maybeSingle();
  const current = Array.isArray((data as any)?.reminders_json)
    ? ((data as any).reminders_json as ItemReminder[])
    : [];
  const { error } = await supabase
    .from(TABLE[type])
    .update({ reminders_json: [...cleanReminders(current, now), reminder] })
    .eq('id', id);
  if (error) throw error;
}
