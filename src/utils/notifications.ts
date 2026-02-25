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
 * Set up a handler for notification taps/responses
 * Returns an unsubscribe function
 */
export async function setupNotificationResponseHandler(
  onMorningNotification: () => void,
  onEveningNotification: () => void,
  onWeeklyNotification?: () => void,
  onItemReminderNotification?: (itemId: string, itemType: string) => void,
): Promise<() => void> {
  if (isExpoGo) {
    console.log('[Notifications] Skipping response handler - running in Expo Go');
    return () => {};
  }

  const Notifications = await import('expo-notifications');

  // Handle notification taps
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    console.log('[Notifications] Response received:', data);

    if (data?.action === 'open_flow') {
      if (data.type === 'morning') {
        onMorningNotification();
      } else if (data.type === 'evening') {
        onEveningNotification();
      } else if (data.type === 'weekly_summary') {
        onWeeklyNotification?.();
      }
    }

    if (data?.action === 'open_item') {
      onItemReminderNotification?.(data.itemId, data.itemType);
    }
  });

  return () => subscription.remove();
}

/**
 * Check if app was opened from a notification (cold start)
 * Returns the notification data if available
 */
export async function getInitialNotification(): Promise<{ type: string; action: string } | null> {
  if (isExpoGo) return null;

  const Notifications = await import('expo-notifications');
  const response = await Notifications.getLastNotificationResponseAsync();

  if (response?.notification.request.content.data) {
    return response.notification.request.content.data as { type: string; action: string };
  }
  return null;
}
