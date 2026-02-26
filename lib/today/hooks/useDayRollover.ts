/**
 * useDayRollover - Detects calendar day changes and triggers store reset
 *
 * Two detection mechanisms:
 * 1. AppState resume: checks on every background→active transition
 * 2. Midnight timer: fires at 00:00:00 if app stays in foreground
 *
 * Mount this ONCE at the app root (App.tsx).
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useGremlyStore } from '../../store/useGremlyStore';
import { getDateService } from '../../date';

/**
 * Calculate milliseconds until the next midnight (local time).
 * Adds a 500ms buffer to avoid edge-case races right at midnight.
 */
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime() - now.getTime() + 500;
}

export function useDayRollover(): void {
  const midnightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAndRollover = useCallback(() => {
    const now = getDateService().getCurrentDate();
    const stored = useGremlyStore.getState().currentDate;

    if (now !== stored) {
      console.log(`[DayRollover] Day changed: ${stored} → ${now}`);
      useGremlyStore.getState().handleDayRollover(now);
    }
  }, []);

  useEffect(() => {
    function armMidnightTimer() {
      // Clear any existing timer
      if (midnightTimer.current) {
        clearTimeout(midnightTimer.current);
      }

      const ms = msUntilMidnight();
      console.log(`[DayRollover] Midnight timer armed: ${Math.round(ms / 1000 / 60)}min from now`);

      midnightTimer.current = setTimeout(() => {
        console.log('[DayRollover] Midnight timer fired');
        checkAndRollover();
        // Re-arm for the next midnight (handles multi-day idle)
        armMidnightTimer();
      }, ms);
    }

    // Arm the midnight timer on mount
    armMidnightTimer();

    // Listen for AppState changes (background → active)
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[DayRollover] App became active, checking date...');
        checkAndRollover();
        // Re-arm midnight timer (in case device clock drifted or timezone changed)
        armMidnightTimer();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      if (midnightTimer.current) {
        clearTimeout(midnightTimer.current);
      }
    };
  }, [checkAndRollover]);
}
