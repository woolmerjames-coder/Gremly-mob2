/**
 * Keeping today's thread current (Daily brief in Chat), mounted once in App.
 * Apart from todayThread.ts so the thread's store has no imports from the
 * planner (which reads the store).
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getDateService } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import { briefInChatOn } from './flag';
import { expireOldLockIns, resetStaleAssignments } from '../plan/storePlan';
import { useTodayThread } from './todayThread';

let lastResetDay: string | null = null;

/**
 * Keeps today's thread current: on start, when the app comes back to the
 * front, and when the ritual day rolls over. Mounted once, in App.
 */
export function useTodayThreadSync(): void {
  const userId = useGremlyStore((s) => s.userId);
  const ritualDay = useGremlyStore((s) => s.currentDate);
  const stored = useGremlyStore((s) => s.briefInChat);
  const on = briefInChatOn(stored);

  useEffect(() => {
    if (!on || !userId) return;
    void useTodayThread.getState().refresh();
  }, [on, userId, ritualDay]);

  // A new day: yesterday's planned times come off Today (the old brief did
  // this when it opened; with the brief in Chat nothing else would)
  const loaded = useGremlyStore((s) => s.todos.length + s.habits.length > 0);
  useEffect(() => {
    if (!on || !userId || !loaded) return;
    const today = getDateService().today();
    if (lastResetDay === today) return;
    lastResetDay = today;
    const n = resetStaleAssignments(today);
    if (n) console.log(`[DailyBrief] cleared ${n} planned times from earlier days`);
    const locks = expireOldLockIns(today);
    if (locks) console.log(`[DailyBrief] ended ${locks} Lock Ins from earlier days`);
  }, [on, userId, loaded, ritualDay]);

  useEffect(() => {
    if (!on) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void useTodayThread.getState().refresh();
    });
    return () => sub.remove();
  }, [on]);
}
