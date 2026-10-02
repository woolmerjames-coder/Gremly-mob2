/**
 * The buttons on a notification: Done and Snooze 1 hour. Both open the app
 * (iOS runs them reliably that way) and change the item the way the app
 * would, so the server's schedule follows.
 */
import { supabase } from '../supabase/client';
import { useGremlyStore } from '../store/useGremlyStore';
import { getDateService, nowTimestamp } from '../date/DateService';
import { addReminderToItem, inMinutes, type ReminderItemType } from '../reminders/save';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A button pressed on a cold start runs before the store has loaded. */
async function storeReady(): Promise<void> {
  for (let i = 0; i < 40 && !useGremlyStore.getState().isInitialized; i += 1) await wait(250);
}

async function logHabit(habitId: string): Promise<void> {
  await storeReady();
  await useGremlyStore.getState().logHabitCompletionForDate(habitId, getDateService().today());
}

/** Done: completes a todo, logs a habit. Notes and people have nothing to finish. */
export async function doneFromNotification(moment: string, subject: string | null): Promise<void> {
  if (!subject) return;
  if (moment === 'habit_checkin') return logHabit(subject);
  const [type, id] = subject.split(':');
  if (type === 'todo') {
    await storeReady();
    const store = useGremlyStore.getState();
    if (store.todos.some((t) => t.id === id)) await store.completeTodo(id);
    else await supabase.from('todos').update({ completed_at: nowTimestamp() }).eq('id', id);
  } else if (type === 'habit') {
    await logHabit(id);
  }
}

/** Snooze 1 hour: adds a one off reminder to the item. */
export async function snoozeFromNotification(subject: string | null): Promise<void> {
  if (!subject) return;
  const [type, id] = subject.split(':');
  if (!id || !['todo', 'habit', 'note', 'person'].includes(type)) return;
  await addReminderToItem(type as ReminderItemType, id, inMinutes(60, getDateService().now()));
}
