/**
 * Feeding from the brief (Daily brief in Chat), with the same store actions
 * and weights as before:
 * - the day's first reply to the brief (any button, a day card row or a
 *   typed message): 25%, once a day, Not today included. It also writes the
 *   day's daily_briefs row, which training readiness counts.
 * - Lock it in: 5% an item, three a day (lib/plan/storePlan.ts).
 * - Sweep: unchanged; Sweep credits itself.
 * Gremly plays his drop animation as his colour rises, or the fed animation
 * when a credit crosses 100%.
 */

import { useGremlyStore } from '../store/useGremlyStore';
import { useMascotStore } from '../store/useMascotStore';
import { getDateService, nowTimestamp } from '../date/DateService';
import { markDailyThreadOnce } from '../repo/dailyThreadRepo';

/** Run a credit and play the matching animation. */
export async function withFeedAnimation(credit: () => Promise<unknown>): Promise<void> {
  const before = useGremlyStore.getState().isFedToday;
  const gaugeBefore = useGremlyStore.getState().feedingGaugeValue;
  await credit();
  const after = useGremlyStore.getState();
  if (!before && after.isFedToday) useMascotStore.getState().requestMode('fed');
  else if (after.feedingGaugeValue > gaugeBefore) useMascotStore.getState().requestMode('drop');
}

/** The day's first reply to the brief: the thread notes it, Gremly is fed once. */
export async function creditFirstReply(threadId: string | null): Promise<boolean> {
  if (!threadId) return false;
  const stamp = await markDailyThreadOnce(threadId, 'answered_at').catch(() => null);
  if (!stamp?.fresh) return false;
  const store = useGremlyStore.getState();
  const today = getDateService().today();
  if (store.dailyBrief?.date !== today) {
    await store
      .saveBrief({ date: today, completed_at: nowTimestamp() })
      .catch((err: unknown) => console.warn('[DailyBrief] could not write the day row', err));
  }
  await withFeedAnimation(() => store.completeMorningBrief()).catch((err) =>
    console.warn('[DailyBrief] could not credit the reply', err),
  );
  return true;
}
