import Constants from 'expo-constants';
import { Platform } from 'react-native';

const isExpoGo = Constants.appOwnership === 'expo';

export async function registerForPushNotifications(): Promise<string | null> {
  if (isExpoGo) {
    console.log('[Notifications] Skipping - running in Expo Go');
    return null;
  }

  // Dynamic imports only when NOT in Expo Go
  const Notifications = await import('expo-notifications');
  const Device = await import('expo-device');

  if (!Device.isDevice) {
    console.log('[Notifications] Must use physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted');
    return null;
  }

  // Register notification categories (action buttons) before fetching token
  await registerNotificationCategories();

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: '4c82fb8d-fdff-41a8-8fec-ce46ee3e6183',
  });

  console.log('[Notifications] Push token:', tokenData.data);
  return tokenData.data;
}

export async function savePushToken(userId: string, token: string) {
  if (isExpoGo) return;

  const { supabase } = await import('../../lib/supabase/client');

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token: token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    console.error('[Notifications] Failed to save token:', error);
  } else {
    console.log('[Notifications] Token saved');
  }
}

/**
 * Set up a handler for notification taps/responses (including iOS action buttons).
 * Returns an unsubscribe function.
 */
export async function setupNotificationResponseHandler(config: {
  onOpenFlow: (type: 'morning' | 'evening' | 'weekly_summary' | 'afternoon_checkin') => void;
  onOpenItem: (entityId: string, entityType: string) => void;
  onDoneAction: (entityId: string, entityType: string) => void;
  onSnooze: (entityId: string, entityType: string, seconds: number, label: string) => void;
  onSnoozBeforeDue: (
    entityId: string,
    entityType: string,
    dueDate: string,
    dueTime: string | null,
  ) => void;
  onStartFlow: (type: 'morning' | 'evening') => void;
}): Promise<() => void> {
  if (isExpoGo) {
    console.log('[Notifications] Skipping response handler - running in Expo Go');
    return () => {};
  }

  const Notifications = await import('expo-notifications');

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      const actionId = response.actionIdentifier;
      console.log('[Notifications] Response received:', { actionId, data });

      if (!data) return;

      // --- Action-button routes ---

      if (actionId === NOTIFICATION_ACTIONS.DONE) {
        config.onDoneAction(data.entityId, data.entityType);
        return;
      }

      if (actionId === NOTIFICATION_ACTIONS.SNOOZE_15M) {
        config.onSnooze(data.entityId, data.entityType, 900, '15m');
        return;
      }

      if (actionId === NOTIFICATION_ACTIONS.SNOOZE_1HR) {
        config.onSnooze(data.entityId, data.entityType, 3600, '1hr');
        return;
      }

      if (actionId === NOTIFICATION_ACTIONS.SNOOZE_BEFORE_DUE) {
        config.onSnoozBeforeDue(data.entityId, data.entityType, data.dueDate, data.dueTime);
        return;
      }

      if (actionId === NOTIFICATION_ACTIONS.START) {
        if (data.type === 'morning' || data.notificationType === 'morning_brief') {
          config.onStartFlow('morning');
        } else if (data.type === 'evening' || data.notificationType === 'evening_sweep') {
          config.onStartFlow('evening');
        }
        return;
      }

      if (actionId === NOTIFICATION_ACTIONS.VIEW) {
        config.onOpenFlow('afternoon_checkin');
        return;
      }

      // --- Default tap (no action button) ---

      if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
        if (data.action === 'open_flow') {
          config.onOpenFlow(data.type);
        } else if (data.action === 'open_item') {
          config.onOpenItem(data.entityId ?? data.itemId, data.entityType ?? data.itemType);
        } else {
          console.log('[Notifications] Unknown default-tap payload:', data);
        }
        return;
      }

      console.log('[Notifications] Unhandled actionId:', actionId);
    } catch (error) {
      console.error('[Notifications] Error handling response:', error);
    }
  });

  return () => subscription.remove();
}

/**
 * Check if app was opened from a notification (cold start).
 * Returns the full notification data payload, or null.
 */
export async function getInitialNotification(): Promise<Record<string, any> | null> {
  if (isExpoGo) return null;

  const Notifications = await import('expo-notifications');
  const response = await Notifications.getLastNotificationResponseAsync();

  if (response?.notification.request.content.data) {
    return response.notification.request.content.data as Record<string, any>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Notification category & action constants
// ---------------------------------------------------------------------------

export const NOTIFICATION_CATEGORIES = {
  ENTITY_REMINDER: 'ENTITY_REMINDER',
  ENTITY_REMINDER_DEADLINE: 'ENTITY_REMINDER_DEADLINE',
  MORNING_BRIEF: 'MORNING_BRIEF',
  EVENING_SWEEP: 'EVENING_SWEEP',
  AFTERNOON_CHECKIN: 'AFTERNOON_CHECKIN',
} as const;

export const NOTIFICATION_ACTIONS = {
  DONE: 'DONE_ACTION',
  SNOOZE_15M: 'SNOOZE_15M_ACTION',
  SNOOZE_1HR: 'SNOOZE_1HR_ACTION',
  SNOOZE_TOMORROW: 'SNOOZE_TOMORROW_ACTION',
  SNOOZE_BEFORE_DUE: 'SNOOZE_BEFORE_DUE_ACTION',
  OPEN: 'OPEN_ACTION',
  START: 'START_ACTION',
  VIEW: 'VIEW_ACTION',
} as const;

/**
 * Register notification categories with Expo so iOS/Android show action buttons
 * on the notification banner / lock screen.
 */
export async function registerNotificationCategories(): Promise<void> {
  if (isExpoGo) return;

  const Notifications = await import('expo-notifications');

  await Promise.all([
    // 1. Generic entity reminder (todo / habit / note)
    Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.ENTITY_REMINDER, [
      {
        identifier: NOTIFICATION_ACTIONS.DONE,
        buttonTitle: '✓ Done',
        options: { opensAppToForeground: false },
      },
      {
        identifier: NOTIFICATION_ACTIONS.SNOOZE_15M,
        buttonTitle: 'Snooze 15m',
        options: { opensAppToForeground: false },
      },
      {
        identifier: NOTIFICATION_ACTIONS.SNOOZE_1HR,
        buttonTitle: 'Snooze 1hr',
        options: { opensAppToForeground: false },
      },
      {
        identifier: NOTIFICATION_ACTIONS.OPEN,
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]),

    // 2. Entity reminder with deadline context
    Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.ENTITY_REMINDER_DEADLINE, [
      {
        identifier: NOTIFICATION_ACTIONS.DONE,
        buttonTitle: '✓ Done',
        options: { opensAppToForeground: false },
      },
      {
        identifier: NOTIFICATION_ACTIONS.SNOOZE_BEFORE_DUE,
        buttonTitle: '30min Before Due',
        options: { opensAppToForeground: false },
      },
      {
        identifier: NOTIFICATION_ACTIONS.SNOOZE_1HR,
        buttonTitle: 'Snooze 1hr',
        options: { opensAppToForeground: false },
      },
      {
        identifier: NOTIFICATION_ACTIONS.OPEN,
        buttonTitle: 'Open',
        options: { opensAppToForeground: true },
      },
    ]),

    // 3. Morning Brief
    Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.MORNING_BRIEF, [
      {
        identifier: NOTIFICATION_ACTIONS.START,
        buttonTitle: 'Start',
        options: { opensAppToForeground: true },
      },
      {
        identifier: NOTIFICATION_ACTIONS.SNOOZE_15M,
        buttonTitle: 'Snooze 15m',
        options: { opensAppToForeground: false },
      },
    ]),

    // 4. Evening Sweep
    Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.EVENING_SWEEP, [
      {
        identifier: NOTIFICATION_ACTIONS.START,
        buttonTitle: 'Start',
        options: { opensAppToForeground: true },
      },
      {
        identifier: NOTIFICATION_ACTIONS.SNOOZE_15M,
        buttonTitle: 'Snooze 15m',
        options: { opensAppToForeground: false },
      },
    ]),

    // 5. Afternoon Check-in
    Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.AFTERNOON_CHECKIN, [
      {
        identifier: NOTIFICATION_ACTIONS.VIEW,
        buttonTitle: 'View',
        options: { opensAppToForeground: true },
      },
      {
        identifier: NOTIFICATION_ACTIONS.SNOOZE_1HR,
        buttonTitle: 'Snooze 1hr',
        options: { opensAppToForeground: false },
      },
    ]),
  ]);

  console.log('[Notifications] Categories registered');
}
