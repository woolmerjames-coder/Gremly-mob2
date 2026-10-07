/**
 * Settings, under Notifications: the person's notification settings and
 * whether this phone can receive them. Every change saves straight away; the
 * database marks the change, and today's plan is redone within a minute.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase/client';
import {
  getInstallId,
  readPermission,
  syncDevice,
  type Permission,
} from '../lib/notifications/device';
import { useGremlyStore } from '../lib/store/useGremlyStore';

export interface NotificationSettings {
  morning_enabled: boolean;
  morning_time: string;
  evening_enabled: boolean;
  evening_time: string;
  reminders_enabled: boolean;
  habit_checkins_enabled: boolean;
  checkins_enabled: boolean;
  weekly_enabled: boolean;
  // the day of the weekly summary is their weekly day, which is held in one
  // place (lib/week/thisWeek) and chosen in Settings under Your week
  weekly_time: string;
  good_news_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  paused_until: string | null;
}

export type PhoneHealth =
  | { kind: 'on'; lastDeliveredAt: string | null }
  | { kind: 'off-in-settings' }
  | { kind: 'not-asked' }
  | { kind: 'not-receiving'; reason: string | null };

const COLUMNS =
  'morning_enabled,morning_time,evening_enabled,evening_time,reminders_enabled,habit_checkins_enabled,checkins_enabled,weekly_enabled,weekly_time,good_news_enabled,quiet_start,quiet_end,paused_until';

/** What to tell them about this phone. Pure, for tests. */
export function phoneHealth(
  permission: Permission,
  device: {
    expo_token: string | null;
    disabled_at: string | null;
    disabled_reason: string | null;
  } | null,
  lastDeliveredAt: string | null,
): PhoneHealth {
  if (permission === 'denied') return { kind: 'off-in-settings' };
  if (permission === 'undetermined') return { kind: 'not-asked' };
  if (!device || !device.expo_token || device.disabled_at) {
    return { kind: 'not-receiving', reason: device?.disabled_reason ?? null };
  }
  return { kind: 'on', lastDeliveredAt };
}

export function useNotificationSettings() {
  const userId = useGremlyStore((s) => s.userId);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [health, setHealth] = useState<PhoneHealth | null>(null);

  const loadHealth = useCallback(async () => {
    if (!userId) return;
    const [permission, installId] = await Promise.all([readPermission(), getInstallId()]);
    const [{ data: device }, { data: last }] = await Promise.all([
      supabase
        .from('push_devices')
        .select('expo_token,disabled_at,disabled_reason')
        .eq('install_id', installId)
        .maybeSingle(),
      supabase
        .from('notification_log')
        .select('delivered_at')
        .eq('user_id', userId)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setHealth(
      phoneHealth(permission, (device as any) ?? null, (last as any)?.delivered_at ?? null),
    );
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('notification_preferences')
      .select(COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (data) setSettings(data as unknown as NotificationSettings);
    await loadHealth();
  }, [userId, loadHealth]);

  useEffect(() => {
    void load();
    // back from iPhone Settings: tell the server, then show the truth
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncDevice({ force: true }).then(loadHealth);
    });
    return () => sub.remove();
  }, [load, loadHealth]);

  const save = useCallback(
    async (patch: Partial<NotificationSettings>) => {
      if (!userId) return;
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      const { error } = await supabase
        .from('notification_preferences')
        .update(patch)
        .eq('user_id', userId);
      if (error) {
        console.warn('[NotificationSettings] save failed:', error.message);
        void load();
      }
    },
    [userId, load],
  );

  const repair = useCallback(async () => {
    await syncDevice({ force: true });
    await loadHealth();
  }, [loadHealth]);

  return { settings, health, save, repair, reload: load };
}
