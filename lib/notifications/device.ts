/**
 * This phone, as the server knows it: one row in push_devices per install,
 * kept current every time the app comes to the front. The Expo token is read
 * fresh each time (tokens change after a restore or reinstall), and the
 * permission is reported as it is, so Settings can show whether this phone
 * can receive notifications.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase/client';
import { generateDropId } from '../minddrop/ids';
import { getDateService } from '../date/DateService';
import { EXPO_PROJECT_ID } from './constants';

export type Permission = 'granted' | 'provisional' | 'denied' | 'undetermined';

const INSTALL_KEY = 'gremly.notifications.installId';
const LAST_SYNC_KEY = 'gremly.notifications.lastSync';
const SYNC_EVERY_MS = 10 * 60 * 1000;

export const isExpoGo = Constants.appOwnership === 'expo';

let installIdPromise: Promise<string> | null = null;

/** A random id for this install, made once and kept. */
export function getInstallId(): Promise<string> {
  if (!installIdPromise) {
    installIdPromise = (async () => {
      const stored = await AsyncStorage.getItem(INSTALL_KEY).catch(() => null);
      if (stored) return stored;
      const id = generateDropId();
      await AsyncStorage.setItem(INSTALL_KEY, id).catch(() => undefined);
      return id;
    })();
  }
  return installIdPromise;
}

/** What iOS (or Android) currently allows, without asking. */
export async function readPermission(): Promise<Permission> {
  if (isExpoGo) return 'undetermined';
  const p = await Notifications.getPermissionsAsync();
  if (p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'provisional';
  if (p.granted || p.status === 'granted') return 'granted';
  if (p.status === 'denied') return 'denied';
  return 'undetermined';
}

/** Shows the system prompt (iOS shows it once per install). */
export async function requestPermission(): Promise<Permission> {
  if (isExpoGo) return 'undetermined';
  await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return readPermission();
}

async function readToken(permission: Permission): Promise<string | null> {
  if (permission !== 'granted' && permission !== 'provisional') return null;
  if (!Device.isDevice) return null;
  try {
    const t = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    return t.data || null;
  } catch (err) {
    console.warn('[Notifications] could not read the push token:', err);
    return null;
  }
}

/**
 * Tells the server about this phone. Cheap to call: it skips when nothing
 * changed in the last ten minutes, unless `force` is set.
 */
export async function syncDevice(
  options: { force?: boolean } = {},
): Promise<{ permission: Permission; registered: boolean }> {
  if (isExpoGo || Platform.OS === 'web') return { permission: 'undetermined', registered: false };
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session?.user?.id) return { permission: 'undetermined', registered: false };

  const permission = await readPermission();
  const token = await readToken(permission);
  const fingerprint = `${auth.session.user.id}|${permission}|${token ?? ''}`;
  if (!options.force) {
    const last = await AsyncStorage.getItem(LAST_SYNC_KEY).catch(() => null);
    if (last) {
      const [at, fp] = [Number(last.split('#')[0]), last.split('#').slice(1).join('#')];
      if (fp === fingerprint && getDateService().now().getTime() - at < SYNC_EVERY_MS)
        return { permission, registered: !!token };
    }
  }

  const { error } = await supabase.rpc('register_device', {
    p: {
      install_id: await getInstallId(),
      expo_token: token,
      platform: Platform.OS,
      // dev builds talk to Apple's sandbox, TestFlight and the App Store to production
      environment: __DEV__ ? 'development' : 'production',
      app_version: Constants.expoConfig?.version ?? null,
      build_number: Constants.expoConfig?.ios?.buildNumber ?? null,
      permission,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
  if (error) {
    console.warn('[Notifications] register_device failed:', error.message);
    return { permission, registered: false };
  }
  await AsyncStorage.setItem(
    LAST_SYNC_KEY,
    `${getDateService().now().getTime()}#${fingerprint}`,
  ).catch(() => undefined);
  return { permission, registered: !!token };
}

/** Before signing out: this phone stops receiving that person's notifications. */
export async function releaseDevice(): Promise<void> {
  if (isExpoGo) return;
  try {
    await supabase.rpc('release_device', { p_install_id: await getInstallId() });
    await AsyncStorage.removeItem(LAST_SYNC_KEY);
  } catch (err) {
    console.warn('[Notifications] release_device failed:', err);
  }
}
