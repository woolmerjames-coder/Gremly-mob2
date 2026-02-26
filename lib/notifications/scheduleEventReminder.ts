import * as Notifications from 'expo-notifications';
import { NOTIFICATION_CATEGORIES } from '../../src/utils/notifications';

/**
 * Schedule a local push notification for an event.
 * Returns the notification identifier (for cancellation).
 */
export async function scheduleEventReminder(
  eventId: string,
  eventTitle: string,
  eventDate: string, // YYYY-MM-DD
  eventTime: string | null, // HH:mm or null for all-day
  minutesBefore: number,
): Promise<string | null> {
  try {
    if (!eventTime && minutesBefore < 1440) {
      // All-day event with non-day-before reminder — skip (no specific time to count from)
      return null;
    }

    let triggerDate: Date;

    if (minutesBefore >= 1440) {
      // "Day before" — fire at 6:00 PM the day before
      triggerDate = new Date(`${eventDate}T18:00:00`);
      triggerDate.setDate(triggerDate.getDate() - 1);
    } else if (eventTime) {
      // Specific time event — fire minutesBefore the start
      const [h, m] = eventTime.split(':').map(Number);
      triggerDate = new Date(`${eventDate}T00:00:00`);
      triggerDate.setHours(h, m, 0, 0);
      triggerDate.setMinutes(triggerDate.getMinutes() - minutesBefore);
    } else {
      return null;
    }

    // Don't schedule if the trigger is in the past
    if (triggerDate.getTime() <= Date.now()) {
      return null;
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title:
          minutesBefore >= 1440
            ? `Tomorrow: ${eventTitle}`
            : minutesBefore >= 60
              ? `In ${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? 's' : ''}: ${eventTitle}`
              : `In ${minutesBefore} min: ${eventTitle}`,
        body: 'Tap to view in Gremly',
        categoryIdentifier: NOTIFICATION_CATEGORIES.ENTITY_REMINDER,
        data: {
          type: 'event_reminder',
          notificationType: 'entity_reminder',
          entityId: eventId,
          entityType: 'event',
          action: 'open_item',
          dueDate: eventDate,
          dueTime: eventTime ?? null,
        },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });

    return id;
  } catch (error) {
    console.error('[scheduleEventReminder] Failed:', error);
    return null;
  }
}

/**
 * Cancel a previously scheduled notification.
 */
export async function cancelEventReminder(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('[cancelEventReminder] Failed:', error);
  }
}
