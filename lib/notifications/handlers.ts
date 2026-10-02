/**
 * Installed once, when the app's code loads (App.tsx imports it at module
 * scope), so a tap that launched the app is never missed. A tap marks the
 * notification opened and queues its route; the buttons run their action.
 */
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase/client';
import { nowTimestamp } from '../date/DateService';
import { isExpoGo } from './device';
import { ACTION, CATEGORY } from './constants';
import { useNotificationUi } from './store';
import { doneFromNotification, snoozeFromNotification } from './actions';

const CLEARED_KEY = 'gremly.notifications.oldLocalCleared';
const HANDLED_KEY = 'gremly.notifications.handled';
const HANDLED_KEEP = 50;
const seen = new Set<string>();
let installed = false;

/** Where a tap goes. Understands the old system's payloads still sitting in Notification Center. */
export function routeFromData(data: Record<string, any> | null | undefined): string | null {
  if (!data) return null;
  if (typeof data.route === 'string' && data.route) return data.route;
  if (data.action === 'open_flow') {
    if (data.type === 'morning') return 'brief';
    if (data.type === 'evening') return 'sweep';
    if (data.type === 'weekly_summary') return 'summary';
    return 'home';
  }
  if (data.action === 'open_item' && (data.entityId || data.itemId)) {
    return `item/${data.entityType ?? data.itemType}/${data.entityId ?? data.itemId}`;
  }
  return null;
}

async function markOpened(logId: string | null | undefined, action: string | null): Promise<void> {
  if (!logId) return;
  try {
    // a cold start restores the session first, so the update is made as them
    await supabase.auth.getSession();
    const res = await supabase.rpc('mark_notification_opened', {
      p_log_id: logId,
      p_action: action,
    });
    if (res?.error) console.warn('[Notifications] could not mark opened:', res.error.message);
  } catch (err) {
    console.warn('[Notifications] could not mark opened:', err);
  }
}

async function readHandled(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Remembers a response across launches and clears it from the OS, before any
 * action runs: a later cold launch, even one after a crash in the action, can
 * never hand the same Done or Snooze back to run again.
 */
let claiming: Promise<unknown> = Promise.resolve();
function claimResponse(key: string): Promise<boolean> {
  // one at a time, so two responses arriving together both get remembered
  const next = claiming.then(() => claimNow(key));
  claiming = next.catch(() => undefined);
  return next;
}

async function claimNow(key: string): Promise<boolean> {
  const handled = await readHandled();
  if (handled.includes(key)) return false;
  try {
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...handled, key].slice(-HANDLED_KEEP)));
  } catch {
    // the OS copy is still cleared below
  }
  try {
    await Notifications.clearLastNotificationResponseAsync();
  } catch {
    // the stored key still stops a replay
  }
  return true;
}

export async function handleResponse(response: Notifications.NotificationResponse): Promise<void> {
  const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (!(await claimResponse(key))) return;
  const data = (response.notification.request.content.data ?? {}) as Record<string, any>;
  const action = response.actionIdentifier;
  const isDefault = action === Notifications.DEFAULT_ACTION_IDENTIFIER;
  void markOpened(data.logId, isDefault ? null : action);
  try {
    if (action === ACTION.done) {
      await doneFromNotification(String(data.moment || ''), data.subject ?? null);
      return;
    }
    if (action === ACTION.snooze) {
      await snoozeFromNotification(data.subject ?? null);
      return;
    }
  } catch (err) {
    console.warn('[Notifications] action failed:', err);
    return;
  }
  const route = routeFromData(data);
  if (route && route !== 'drop') useNotificationUi.getState().openRoute(route);
}

async function registerCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(CATEGORY.reminder, [
    { identifier: ACTION.done, buttonTitle: 'Done', options: { opensAppToForeground: true } },
    {
      identifier: ACTION.snooze,
      buttonTitle: 'Snooze 1 hour',
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(CATEGORY.habit, [
    { identifier: ACTION.done, buttonTitle: 'Done', options: { opensAppToForeground: true } },
  ]);
}

/**
 * The old system scheduled reminders on the phone; the server sends them now,
 * so anything the old build left behind is cleared once, or it would arrive twice.
 */
async function clearOldLocalNotifications(): Promise<void> {
  const done = await AsyncStorage.getItem(CLEARED_KEY).catch(() => null);
  if (done) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem(CLEARED_KEY, nowTimestamp());
}

export function installNotificationHandlers(): void {
  if (installed || isExpoGo) return;
  installed = true;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const data = (n.request.content.data ?? {}) as Record<string, any>;
      const silent = !!data.silent;
      return {
        shouldShowBanner: !silent,
        shouldShowList: !silent,
        shouldPlaySound: !silent && data.moment === 'reminder',
        shouldSetBadge: false,
      };
    },
  });
  Notifications.addNotificationResponseReceivedListener((r) => {
    void handleResponse(r);
  });
  Notifications.getLastNotificationResponseAsync()
    .then((r) => (r ? handleResponse(r) : undefined))
    .catch(() => undefined);
  registerCategories().catch((err) => console.warn('[Notifications] categories:', err));
  clearOldLocalNotifications().catch((err) => console.warn('[Notifications] clearing old:', err));
}
