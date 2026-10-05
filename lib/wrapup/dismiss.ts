/**
 * Putting away Gremly's wrap up line (the speech bubble on Drop and Today, and
 * the dot on CHAT). It is kept with today's thread, so it goes on every
 * screen and every device at once, and comes back with the next day. The way
 * in stays: the chip, the Today button and the pinned card still start it.
 */
import { ensureDailyThread, patchDailyThreadMeta } from '../repo/dailyThreadRepo';
import { useTodayThread } from '../brief/todayThread';
import { getDateService, nowTimestamp } from '../date/DateService';

export async function dismissWrapNudge(): Promise<void> {
  const at = nowTimestamp();
  const store = useTodayThread.getState();
  let thread = store.thread;
  if (!thread) {
    // no thread yet today (no brief): today's is made to keep it
    try {
      thread = await ensureDailyThread(getDateService().ritualDay());
      if (thread) store.setThread(thread);
    } catch (err) {
      console.warn('[WrapUp] could not keep the line put away:', err);
      return;
    }
  }
  if (!thread) return;
  useTodayThread.getState().patchMeta(thread.id, { wrap_nudge_dismissed_at: at });
  await patchDailyThreadMeta(thread.id, { wrap_nudge_dismissed_at: at }).catch((err) =>
    console.warn('[WrapUp] could not keep the line put away:', err),
  );
}
