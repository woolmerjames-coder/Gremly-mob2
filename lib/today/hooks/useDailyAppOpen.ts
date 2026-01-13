/**
 * useDailyAppOpen - First-open detection for Morning Brief prompt
 *
 * Tracks last app open date in AsyncStorage.
 * Returns true once per ritual day (respects user's day boundary setting).
 */

import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRitualDay } from '../../date/ritualDay';
import { useGremlyStore } from '../../store/useGremlyStore';

// v2: Now uses ritual day instead of calendar day
const STORAGE_KEY = '@gremly/last_app_open_date_v2';

interface UseDailyAppOpenReturn {
  /** True if this is the first open of the ritual day */
  isFirstOpenToday: boolean;
  /** Loading state while checking AsyncStorage */
  isChecking: boolean;
  /** Mark today as opened (call after showing prompt) */
  markTodayOpened: () => Promise<void>;
  /** Reset for testing */
  resetForTesting: () => Promise<void>;
}

/**
 * Get today's ritual day string in YYYY-MM-DD format
 * Respects user's day boundary hour setting
 */
function getRitualDateString(): string {
  const { dayBoundaryHour, userTimezone } = useGremlyStore.getState();
  const timezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const boundaryHour = dayBoundaryHour ?? 0;
  return getRitualDay(boundaryHour, timezone);
}

export function useDailyAppOpen(): UseDailyAppOpenReturn {
  const [isFirstOpenToday, setIsFirstOpenToday] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Check on mount
  useEffect(() => {
    let mounted = true;

    const checkLastOpen = async () => {
      try {
        const lastOpenDate = await AsyncStorage.getItem(STORAGE_KEY);
        const todayDate = getRitualDateString();

        if (mounted) {
          // First open if no record or different day
          const isFirst = lastOpenDate !== todayDate;
          setIsFirstOpenToday(isFirst);
          setIsChecking(false);

          if (__DEV__) {
            console.log('[DailyAppOpen] Check:', {
              lastOpenDate,
              todayDate,
              isFirstOpenToday: isFirst,
            });
          }
        }
      } catch (error) {
        console.error('[DailyAppOpen] Failed to check:', error);
        if (mounted) {
          setIsFirstOpenToday(false);
          setIsChecking(false);
        }
      }
    };

    void checkLastOpen();

    return () => {
      mounted = false;
    };
  }, []);

  // Mark today as opened
  const markTodayOpened = useCallback(async () => {
    try {
      const todayDate = getRitualDateString();
      await AsyncStorage.setItem(STORAGE_KEY, todayDate);
      setIsFirstOpenToday(false);

      if (__DEV__) {
        console.log('[DailyAppOpen] Marked opened:', todayDate);
      }
    } catch (error) {
      console.error('[DailyAppOpen] Failed to mark:', error);
    }
  }, []);

  // Reset for testing
  const resetForTesting = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setIsFirstOpenToday(true);

      if (__DEV__) {
        console.log('[DailyAppOpen] Reset for testing');
      }
    } catch (error) {
      console.error('[DailyAppOpen] Failed to reset:', error);
    }
  }, []);

  return {
    isFirstOpenToday,
    isChecking,
    markTodayOpened,
    resetForTesting,
  };
}
