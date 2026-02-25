import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { ItemReminder } from '../types';

const isExpoGo = Constants.appOwnership === 'expo';

/**
 * Schedule a local notification for a per-item reminder on a todo or habit.
 * Returns the expo notification ID (for cancellation), or null on error/skip.
 */
export async function scheduleItemReminder(
  itemId: string,
  itemTitle: string,
  itemType: 'todo' | 'habit',
  reminder: ItemReminder,
): Promise<string | null> {
  if (isExpoGo) {
    console.log('[itemReminderService] Skipping schedule in Expo Go');
    return null;
  }

  try {
    const title = itemType === 'habit' ? 'Habit reminder' : 'Reminder';
    const content: Notifications.NotificationContentInput = {
      title,
      body: itemTitle,
      data: { type: 'item_reminder', itemId, itemType, action: 'open_item' },
      sound: 'default',
    };

    let trigger: Notifications.NotificationTriggerInput;

    if (reminder.frequency === 'once') {
      if (!reminder.date) {
        // No date for a one-shot reminder — not supported yet
        return null;
      }

      const [hour, minute] = reminder.time.split(':').map(Number);
      const fireDate = new Date(`${reminder.date}T00:00:00`);
      fireDate.setHours(hour, minute, 0, 0);

      if (fireDate.getTime() <= Date.now()) {
        console.log(`[itemReminderService] Skipping past date: ${fireDate.toISOString()}`);
        return null;
      }

      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      };
    } else {
      // daily
      const [hour, minute] = reminder.time.split(':').map(Number);
      trigger = {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      };
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content,
      trigger,
    });

    console.log(
      `[itemReminderService] Scheduled ${reminder.frequency} reminder for ${itemType} "${itemTitle}" → ${notificationId}`,
    );
    return notificationId;
  } catch (error) {
    console.error(`[itemReminderService] Failed to schedule for ${itemType} ${itemId}:`, error);
    return null;
  }
}

/**
 * Schedule a quick "in X seconds" reminder for a todo or habit.
 * Powers the "In 1 hour" quick option.
 */
export async function scheduleQuickReminder(
  itemId: string,
  itemTitle: string,
  itemType: 'todo' | 'habit',
  seconds: number,
): Promise<string | null> {
  if (isExpoGo) {
    console.log('[itemReminderService] Skipping quick reminder in Expo Go');
    return null;
  }

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Reminder',
        body: itemTitle,
        data: { type: 'item_reminder', itemId, itemType, action: 'open_item' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
      },
    });

    console.log(
      `[itemReminderService] Quick reminder (${seconds}s) for ${itemType} "${itemTitle}" → ${notificationId}`,
    );
    return notificationId;
  } catch (error) {
    console.error(`[itemReminderService] Quick reminder failed for ${itemType} ${itemId}:`, error);
    return null;
  }
}

/**
 * Cancel a single scheduled notification by its expo notification ID.
 */
export async function cancelItemReminder(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log(`[itemReminderService] Cancelled ${notificationId}`);
  } catch (error) {
    console.warn(`[itemReminderService] Cancel failed for ${notificationId}:`, error);
  }
}

/**
 * Cancel all scheduled notifications for a list of item reminders.
 * Uses Promise.allSettled so one failure doesn't block others.
 */
export async function cancelAllItemReminders(reminders: ItemReminder[]): Promise<void> {
  const withIds = reminders.filter((r) => r.notificationId);
  if (withIds.length === 0) return;

  console.log(`[itemReminderService] Cancelling ${withIds.length} reminder(s)`);
  await Promise.allSettled(withIds.map((r) => cancelItemReminder(r.notificationId!)));
}
