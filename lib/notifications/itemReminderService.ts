import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import type { ItemReminder } from '../types';
import { NOTIFICATION_CATEGORIES } from '../../src/utils/notifications';
import { getDateService } from '../date';

const isExpoGo = Constants.appOwnership === 'expo';

export function buildNotificationCopy(
  itemTitle: string,
  itemType: 'todo' | 'habit',
  isSnooze: boolean = false,
  isOverdue: boolean = false,
): { title: string; body: string } {
  // Clean the title — remove trailing periods, lowercase first char for
  // embedding in sentences
  const clean = itemTitle.replace(/\.$/, '');
  const lower = clean.charAt(0).toLowerCase() + clean.slice(1);

  if (isOverdue) {
    return {
      title: 'This was due already',
      body: `Still need to: ${clean}`,
    };
  }

  if (isSnooze) {
    // Snoozed reminders get a gentle nudge
    const snoozeOptions = [
      { title: 'Hey, circling back', body: `Still need to ${lower}` },
      { title: 'Quick nudge', body: clean },
      { title: 'This popped back up', body: clean },
    ];
    return snoozeOptions[Math.floor(Math.random() * snoozeOptions.length)];
  }

  if (itemType === 'habit') {
    const habitOptions = [
      { title: 'Habit check-in', body: `Time for: ${clean}` },
      { title: clean, body: "Don't break the chain" },
    ];
    return habitOptions[Math.floor(Math.random() * habitOptions.length)];
  }

  // Todos — vary the copy
  const todoOptions = [
    { title: `Time to ${lower}`, body: 'Tap to mark it done' },
    { title: clean, body: "You've got this" },
    { title: 'Heads up', body: clean },
  ];
  return todoOptions[Math.floor(Math.random() * todoOptions.length)];
}

/**
 * Schedule a local notification for a per-item reminder on a todo or habit.
 * Returns the expo notification ID (for cancellation), or null on error/skip.
 */
export async function scheduleItemReminder(
  itemId: string,
  itemTitle: string,
  itemType: 'todo' | 'habit',
  reminder: ItemReminder,
  dueDate?: string | null,
  dueTime?: string | null,
): Promise<string | null> {
  if (isExpoGo) {
    console.log('[itemReminderService] Skipping schedule in Expo Go');
    return null;
  }

  try {
    const { title, body } = buildNotificationCopy(itemTitle, itemType);
    const categoryIdentifier = dueDate
      ? NOTIFICATION_CATEGORIES.ENTITY_REMINDER_DEADLINE
      : NOTIFICATION_CATEGORIES.ENTITY_REMINDER;
    const content: Notifications.NotificationContentInput = {
      title,
      body,
      categoryIdentifier,
      data: {
        type: 'item_reminder',
        notificationType: 'entity_reminder',
        entityId: itemId,
        entityType: itemType,
        action: 'open_item',
        dueDate: dueDate ?? null,
        dueTime: dueTime ?? null,
      },
      sound: 'default',
    };

    const [hour, minute] = reminder.time.split(':').map(Number);

    if (reminder.frequency === 'once') {
      if (!reminder.date) {
        // No date for a one-shot reminder — not supported yet
        return null;
      }

      const fireDate = getDateService().fromLocalDate(reminder.date);
      fireDate.setHours(hour, minute, 0, 0);

      if (fireDate.getTime() <= getDateService().now().getTime()) {
        console.log(`[itemReminderService] Skipping past date: ${fireDate.toISOString()}`);
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
        },
      });

      console.log(
        `[itemReminderService] Scheduled once reminder for ${itemType} "${itemTitle}" → ${notificationId}`,
      );
      return notificationId;
    } else if (reminder.frequency === 'daily') {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        },
      });

      console.log(
        `[itemReminderService] Scheduled daily reminder for ${itemType} "${itemTitle}" → ${notificationId}`,
      );
      return notificationId;
    } else {
      // weekdays, weekends, or weekly — schedule WEEKLY triggers for each day
      let daysToSchedule: number[];

      if (reminder.frequency === 'weekdays') {
        daysToSchedule = [2, 3, 4, 5, 6]; // Mon=2, Tue=3, ... Fri=6 (Expo uses 1=Sun)
      } else if (reminder.frequency === 'weekends') {
        daysToSchedule = [1, 7]; // Sun=1, Sat=7 (Expo uses 1=Sun, 7=Sat)
      } else {
        // 'weekly' — use days_of_week (0=Sun, 1=Mon, ..., 6=Sat) → Expo weekday (1=Sun, 2=Mon, ..., 7=Sat)
        daysToSchedule = (reminder.days_of_week ?? []).map((d) => d + 1);
      }

      if (daysToSchedule.length === 0) return null;

      const ids: string[] = [];
      for (const weekday of daysToSchedule) {
        const nid = await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour,
            minute,
          },
        });
        ids.push(nid);
      }

      const joined = ids.join(',');
      console.log(
        `[itemReminderService] Scheduled ${reminder.frequency} reminder for ${itemType} "${itemTitle}" (${daysToSchedule.length} days) → ${joined}`,
      );
      return joined;
    }
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
  dueDate?: string | null,
  dueTime?: string | null,
): Promise<string | null> {
  if (isExpoGo) {
    console.log('[itemReminderService] Skipping quick reminder in Expo Go');
    return null;
  }

  try {
    const categoryIdentifier = dueDate
      ? NOTIFICATION_CATEGORIES.ENTITY_REMINDER_DEADLINE
      : NOTIFICATION_CATEGORIES.ENTITY_REMINDER;
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        ...buildNotificationCopy(itemTitle, itemType, true),
        categoryIdentifier,
        data: {
          type: 'item_reminder',
          notificationType: 'entity_reminder',
          entityId: itemId,
          entityType: itemType,
          action: 'open_item',
          dueDate: dueDate ?? null,
          dueTime: dueTime ?? null,
        },
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
 * Handles comma-separated IDs from multi-day schedules (weekdays/weekends/weekly).
 */
export async function cancelItemReminder(notificationId: string): Promise<void> {
  try {
    const ids = notificationId.includes(',') ? notificationId.split(',') : [notificationId];
    await Promise.allSettled(
      ids.map(async (id) => {
        await Notifications.cancelScheduledNotificationAsync(id.trim());
        console.log(`[itemReminderService] Cancelled ${id.trim()}`);
      }),
    );
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
