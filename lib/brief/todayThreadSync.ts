/**
 * Keeping today's thread current (Daily brief in Chat), mounted once in App.
 * Apart from todayThread.ts so the thread's store has no imports from the
 * planner (which reads the store).
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getDateService } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import { resetStaleAssignments } from '../plan/storePlan';
import { useTodayThread } from './todayThread';

let lastResetDay: string | null = null;

/**
 * Keeps today's thread current: on start, when the app comes back to the
 * front, and when the ritual day rolls over. Mounted once, in App.
 */
export function useTodayThreadSync(): void {
  const userId = useGremlyStore((s) => s.userId);
  const ritualDay = useGremlyStore((s) => s.currentDate);

  useEffect(() => {
    if (!userId) return;
    void useTodayThread.getState().refresh();
  }, [userId, ritualDay]);

  // A new day: yesterday's planned times come off Today. The day is the
  // person's (it ends at their day end, not at midnight), so a plan still
  // shows on Today in the small hours.
  const loaded = useGremlyStore((s) => s.todos.length + s.habits.length > 0);
  useEffect(() => {
    if (!userId || !loaded) return;
    const today = getDateService().ritualDay();
    if (lastResetDay === today) return;
    lastResetDay = today;
    const n = resetStaleAssignments(today);
    if (n) console.log(`[DailyBrief] cleared ${n} planned times from earlier days`);
  }, [userId, loaded, ritualDay]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void useTodayThread.getState().refresh();
    });
    return () => sub.remove();
  }, []);
}
