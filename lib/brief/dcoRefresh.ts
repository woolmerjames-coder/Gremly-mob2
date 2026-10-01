/**
 * After an answer or a correction in today's thread, the context pipeline
 * rewrites what it changed within a minute or so (the DCO included). The day
 * card's countdown chip reads the DCO, so it is read again twice: once when
 * most corrections have landed, and once more for slower ones.
 */

import { useGremlyStore } from '../store/useGremlyStore';

const AFTER_MS = [40_000, 90_000];
let timers: ReturnType<typeof setTimeout>[] = [];

export function scheduleDcoRefresh(): void {
  timers.forEach(clearTimeout);
  timers = AFTER_MS.map((ms) =>
    setTimeout(() => {
      void useGremlyStore.getState().fetchTodayDco();
    }, ms),
  );
}
