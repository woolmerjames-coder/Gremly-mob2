/**
 * useDayRollover - Detects ritual-day changes and triggers store reset
 *
 * Two detection mechanisms:
 * 1. AppState resume: checks on every background→active transition
 * 2. Day-boundary timer: fires at the user's configured boundary hour
 *    (default midnight, but respects dayBoundaryHour from DateService)
 *
 * Mount this ONCE at the app root (App.tsx).
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useGremlyStore } from '../../store/useGremlyStore';
import { getDateService } from '../../date';

/**
 * Calculate milliseconds until the next day boundary (local time).
 * Respects the user's configured dayBoundaryHour (e.g. 3 = 3 AM).
 * Adds a 500ms buffer to avoid edge-case races right at the boundary.
 */
function msUntilDayBoundary(): number {
  const ds = getDateService();
  const now = ds.now();
  const boundaryHour = ds.getDayBoundaryHour();
  const currentHour = ds.getHour();

  // Calculate next boundary time
  const target = new Date(now.getTime());
  if (currentHour >= boundaryHour) {
    // Boundary is tomorrow
    target.setDate(target.getDate() + 1);
  }
  target.setHours(boundaryHour, 0, 0, 0);

  return target.getTime() - now.getTime() + 500;
}

export function useDayRollover(): void {
  const boundaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAndRollover = useCallback(() => {
    const now = getDateService().ritualDay();
    const stored = useGremlyStore.getState().currentDate;

    if (now !== stored) {
      console.log(`[DayRollover] Day changed: ${stored} → ${now}`);
      useGremlyStore.getState().handleDayRollover(now);
    }
  }, []);

  useEffect(() => {
    function armBoundaryTimer() {
      // Clear any existing timer
      if (boundaryTimer.current) {
        clearTimeout(boundaryTimer.current);
      }

      const ms = msUntilDayBoundary();
      console.log(`[DayRollover] Boundary timer armed: ${Math.round(ms / 1000 / 60)}min from now`);

      boundaryTimer.current = setTimeout(() => {
        console.log('[DayRollover] Boundary timer fired');
        checkAndRollover();
        // Re-arm for the next boundary (handles multi-day idle)
        armBoundaryTimer();
      }, ms);
    }

    // Arm the boundary timer on mount
    armBoundaryTimer();

    // Listen for AppState changes (background → active)
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[DayRollover] App became active, checking date...');
        checkAndRollover();
        // Re-arm boundary timer (in case device clock drifted or timezone changed)
        armBoundaryTimer();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      if (boundaryTimer.current) {
        clearTimeout(boundaryTimer.current);
      }
    };
  }, [checkAndRollover]);
}
