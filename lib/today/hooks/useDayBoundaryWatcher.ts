/**
 * useDayBoundaryWatcher.ts
 *
 * This hook prevents stale ritual data when the app is reopened after crossing
 * a day boundary. It listens for app state changes and checks if the ritual day
 * has changed while the app was backgrounded. If so, it triggers a refresh of
 * ritual progress to ensure the UI reflects the correct day's state.
 */

import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getRitualDay } from '../../date/ritualDay';
import { useGremlyStore } from '../../store/useGremlyStore';

export default function useDayBoundaryWatcher(): void {
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const { todayRitualDay, dayBoundaryHour, userTimezone } = useGremlyStore.getState();

        const currentRitualDay = getRitualDay(dayBoundaryHour, userTimezone ?? undefined);

        if (todayRitualDay && todayRitualDay !== currentRitualDay) {
          console.log(
            `[DayBoundaryWatcher] Day changed from ${todayRitualDay} to ${currentRitualDay}, refreshing...`,
          );
          useGremlyStore.getState().refreshRitualProgress();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);
}
