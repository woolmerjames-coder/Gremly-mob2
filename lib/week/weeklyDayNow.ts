/**
 * Their weekly day, for code that cannot read the store: the worker calls in
 * lib/cortex send it with every chat turn, so a habit's count this week is
 * made in their own week whichever chat they are in (a space's, a world's,
 * Ask Gremly, today's thread). The store keeps it in step
 * (lib/store/useGremlyStore.ts followWeeklyDay).
 */
let day = 0;

/** 0 Sunday to 6 Saturday; Sunday until the store has said otherwise. */
export function weeklyDayNow(): number {
  return day;
}

export function setWeeklyDayNow(next: unknown): void {
  day = typeof next === 'number' && Number.isInteger(next) && next >= 0 && next <= 6 ? next : 0;
}
