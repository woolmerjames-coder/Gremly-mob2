/**
 * useNotificationPreferences Hook
 *
 * Manages notification preferences from Supabase.
 * Handles fetching, caching, and saving user notification settings.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../providers/AuthProvider';

/**
 * Notification preferences stored in Supabase
 */
export interface NotificationPreferences {
  morningEnabled: boolean;
  morningTime: string; // "HH:MM" format
  eveningEnabled: boolean;
  eveningTime: string; // "HH:MM" format
  timezone: string;
}

/**
 * Notification preferences with Date objects for UI
 */
export interface NotificationPreferencesUI {
  morningEnabled: boolean;
  morningTime: Date;
  eveningEnabled: boolean;
  eveningTime: Date;
  timezone: string;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  morningEnabled: true,
  morningTime: '08:00',
  eveningEnabled: true,
  eveningTime: '20:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

/**
 * Convert a time string "HH:MM" to a Date object (today at that time)
 */
function timeStringToDate(timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Convert a Date object to a time string "HH:MM"
 */
function dateToTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Convert database preferences to UI-friendly format with Date objects
 */
function toUIPreferences(prefs: NotificationPreferences): NotificationPreferencesUI {
  return {
    morningEnabled: prefs.morningEnabled,
    morningTime: timeStringToDate(prefs.morningTime),
    eveningEnabled: prefs.eveningEnabled,
    eveningTime: timeStringToDate(prefs.eveningTime),
    timezone: prefs.timezone,
  };
}

/**
 * Convert UI preferences back to database format
 */
function toDBPreferences(prefs: NotificationPreferencesUI): NotificationPreferences {
  return {
    morningEnabled: prefs.morningEnabled,
    morningTime: dateToTimeString(prefs.morningTime),
    eveningEnabled: prefs.eveningEnabled,
    eveningTime: dateToTimeString(prefs.eveningTime),
    timezone: prefs.timezone,
  };
}

export interface UseNotificationPreferencesResult {
  /** Current notification preferences with Date objects */
  preferences: NotificationPreferencesUI | null;
  /** Whether preferences are being loaded */
  loading: boolean;
  /** Error message if fetch/save failed */
  error: string | null;
  /** Save preferences to Supabase */
  savePreferences: (prefs: NotificationPreferencesUI) => Promise<void>;
}

/**
 * Hook for managing notification preferences from Supabase
 *
 * @example
 * const { preferences, loading, savePreferences } = useNotificationPreferences();
 *
 * if (loading) return <Loading />;
 *
 * return (
 *   <NotificationSettings
 *     morningEnabled={preferences.morningEnabled}
 *     morningTime={preferences.morningTime}
 *     onSave={(settings) => savePreferences(settings)}
 *   />
 * );
 */
export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const { userId } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferencesUI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch preferences on mount
  useEffect(() => {
    async function fetchPreferences() {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (fetchError) {
          // PGRST116 means no rows found - use defaults
          if (fetchError.code === 'PGRST116') {
            console.log('[useNotificationPreferences] No preferences found, using defaults');
            setPreferences(toUIPreferences(DEFAULT_PREFERENCES));
          } else {
            console.error('[useNotificationPreferences] Fetch error:', fetchError);
            setError(fetchError.message);
            // Still set defaults on error so UI can function
            setPreferences(toUIPreferences(DEFAULT_PREFERENCES));
          }
        } else if (data) {
          console.log('[useNotificationPreferences] Loaded preferences:', data);
          setPreferences(
            toUIPreferences({
              morningEnabled: data.morning_enabled ?? DEFAULT_PREFERENCES.morningEnabled,
              morningTime: data.morning_time ?? DEFAULT_PREFERENCES.morningTime,
              eveningEnabled: data.evening_enabled ?? DEFAULT_PREFERENCES.eveningEnabled,
              eveningTime: data.evening_time ?? DEFAULT_PREFERENCES.eveningTime,
              timezone: data.timezone ?? DEFAULT_PREFERENCES.timezone,
            }),
          );
        }
      } catch (err) {
        console.error('[useNotificationPreferences] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load preferences');
        setPreferences(toUIPreferences(DEFAULT_PREFERENCES));
      } finally {
        setLoading(false);
      }
    }

    fetchPreferences();
  }, [userId]);

  // Save preferences to Supabase
  const savePreferences = useCallback(
    async (newPrefs: NotificationPreferencesUI) => {
      if (!userId) {
        setError('Not authenticated');
        return;
      }

      try {
        setError(null);
        const dbPrefs = toDBPreferences(newPrefs);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const { error: upsertError } = await supabase.from('notification_preferences').upsert(
          {
            user_id: userId,
            morning_enabled: dbPrefs.morningEnabled,
            morning_time: dbPrefs.morningTime,
            evening_enabled: dbPrefs.eveningEnabled,
            evening_time: dbPrefs.eveningTime,
            timezone,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );

        if (upsertError) {
          console.error('[useNotificationPreferences] Save error:', upsertError);
          setError(upsertError.message);
          throw upsertError;
        }

        console.log('[useNotificationPreferences] Preferences saved successfully');
        // Update local state with new timezone
        setPreferences({ ...newPrefs, timezone });
      } catch (err) {
        console.error('[useNotificationPreferences] Save failed:', err);
        const message = err instanceof Error ? err.message : 'Failed to save preferences';
        setError(message);
        throw new Error(message);
      }
    },
    [userId],
  );

  return {
    preferences,
    loading,
    error,
    savePreferences,
  };
}

// Export utility functions for consumers
export { timeStringToDate, dateToTimeString };
