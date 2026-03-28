import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase/client';
import { nowTimestamp, getDateService } from '../lib/date/DateService';
import { useGremlyStore } from '../lib/store/useGremlyStore';

const HEARTBEAT_DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function syncTimezone(userId: string): Promise<void> {
  const deviceTz = getDeviceTimezone();

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.log('[TimezoneSync] Read error:', error.message);
    return;
  }

  const storedTz = data?.timezone as string | undefined;

  if (storedTz === deviceTz) return;

  // Update local state FIRST so the app immediately reflects the correct
  // timezone regardless of network connectivity.
  getDateService().setTimezone(deviceTz);
  useGremlyStore.getState().setUserTimezone(deviceTz);

  // Persist to Supabase for server-side systems (workers, notifications).
  // This can fail gracefully — the local timezone is already correct.
  const { error: updateErr } = await supabase
    .from('notification_preferences')
    .update({ timezone: deviceTz, updated_at: nowTimestamp() })
    .eq('user_id', userId);

  if (updateErr) {
    console.warn('[TimezoneSync] Supabase write failed (local timezone updated):', updateErr.message);
  }

  console.log(`[TimezoneSync] Updated: ${storedTz ?? '(none)'} → ${deviceTz}`);
}

async function writeHeartbeat(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notification_preferences')
    .update({ last_app_active_at: nowTimestamp() })
    .eq('user_id', userId);

  if (error) {
    console.log('[TimezoneSync] Heartbeat error:', error.message);
    return;
  }

  console.log('[TimezoneSync] Heartbeat written');
}

export function useTimezoneSync(): void {
  const [userId, setUserId] = useState<string | null>(null);
  const lastHeartbeatRef = useRef<number>(0);

  // Get userId directly from Supabase auth (avoids AuthProvider dependency)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync on mount / userId change
  useEffect(() => {
    if (!userId) return;
    syncTimezone(userId);
  }, [userId]);

  // AppState listener: re-check timezone + debounced heartbeat
  useEffect(() => {
    if (!userId) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;

      // Timezone check (no debounce — cheap read + conditional write)
      syncTimezone(userId);

      // Heartbeat (debounced to 10-min intervals)
      const now = getDateService().now().getTime();
      if (now - lastHeartbeatRef.current >= HEARTBEAT_DEBOUNCE_MS) {
        lastHeartbeatRef.current = now;
        writeHeartbeat(userId);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [userId]);
}
