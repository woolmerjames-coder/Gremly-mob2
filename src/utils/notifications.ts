/**
 * Push Notifications Utility
 *
 * Handles Expo push notification registration, permissions, and token management.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase/client';

// Configure notification handler to show alerts when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and get the Expo push token.
 *
 * @returns The Expo push token string, or null if registration fails
 */
export async function registerForPushNotifications(): Promise<string | null> {
  console.log('[Notifications] Starting push notification registration...');

  // Check if physical device (required for push notifications)
  if (!Device.isDevice) {
    console.log('[Notifications] Push notifications require a physical device');
    return null;
  }

  try {
    // Check existing permission status
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[Notifications] Existing permission status:', existingStatus);

    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      console.log('[Notifications] Requesting permission...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[Notifications] Permission request result:', status);
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission not granted');
      return null;
    }

    // Get Expo push token
    console.log('[Notifications] Getting Expo push token...');
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '4c82fb8d-fdff-41a8-8fec-ce46ee3e6183',
    });

    const token = tokenData.data;
    console.log('[Notifications] Push token obtained:', token);

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      console.log('[Notifications] Configuring Android notification channel...');
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return token;
  } catch (error) {
    console.log('[Notifications] Error during registration:', error);
    return null;
  }
}

/**
 * Save the push token to Supabase for the given user.
 *
 * @param userId - The user's ID
 * @param token - The Expo push token
 */
export async function savePushToken(userId: string, token: string): Promise<void> {
  console.log('[Notifications] Saving push token for user:', userId);

  try {
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      console.log('[Notifications] Error saving push token:', error.message);
      throw error;
    }

    console.log('[Notifications] Push token saved successfully');
  } catch (error) {
    console.log('[Notifications] Failed to save push token:', error);
    throw error;
  }
}
