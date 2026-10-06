/**
 * The person's week, as the rest of the app needs to know it (the weekly
 * review): their weekly day and days off, and the review for the week they
 * are in, as its row has it. Read when the app asks for it; changed here
 * after each save, so every screen sees the same week.
 *
 * The week is worked out from the person's day (it is still yesterday for
 * them until their day ends), by dates alone (lib/week/model cycleOf).
 */
import { create } from 'zustand';
import { getDateService } from '../date/DateService';
import { useGremlyStore } from '../store/useGremlyStore';
import {
  getWeekReview,
  getWeekSettings,
  saveDaysOff,
  saveWeeklyDay,
  type WeekReviewRow,
} from '../repo/weekReviewRepo';
import { cycleOf, daysOffOf, weeklyDayOf } from './model';

export interface ThisWeekState {
  /** 0 Sunday to 6 Saturday; Sunday until their own is read */
  weeklyDay: number;
  /** The days of the week that count as days off */
  daysOff: number[];
  /** The review for the week they are in, or null when there is none */
  review: WeekReviewRow | null;
  /** The week has been read at least once */
  loaded: boolean;
  /** Read their settings and this week's review again */
  refresh: () => Promise<void>;
  /** A row the screen already has (just saved or just read) */
  setReview: (review: WeekReviewRow | null) => void;
  /**
   * Their weekly day, after it is saved. The week they are in follows it, so
   * the review held here is let go until the week is read again.
   */
  setWeeklyDay: (weekday: number) => void;
  /**
   * Their choice of weekly day, from Settings (Your week): saved, then
   * followed here, and the week it gives is read again. This is the one place
   * the setting is changed by hand. Throws when it could not be saved, and
   * nothing here changes then.
   */
  chooseWeeklyDay: (weekday: number) => Promise<void>;
  /** Their choice of days off, from Settings: saved, then held here. Throws when it could not be saved. */
  chooseDaysOff: (days: number[]) => Promise<void>;
}

// each read and each change of the weekly day takes a turn, so a read that was
// already on its way when the weekly day moved cannot put the old one back
let turn = 0;

/**
 * The habit counts read their weekly day from the main store, where it is
 * saved on the device so the counts are right from a cold start (a habit's
 * week is the seven days that end on it). Every time it is read or changed
 * here, that copy follows.
 */
function keepHabitWeek(weeklyDay: number): void {
  if (useGremlyStore.getState().weeklyDay !== weeklyDay) useGremlyStore.setState({ weeklyDay });
}

/** The first day of the week the person is in, for a weekly day. */
export function weekStartFor(weeklyDay: number): string {
  return cycleOf(getDateService().ritualDay(), weeklyDay).week_start;
}

export const useThisWeek = create<ThisWeekState>((set, get) => ({
  weeklyDay: weeklyDayOf(null),
  daysOff: daysOffOf(null),
  review: null,
  loaded: false,

  refresh: async () => {
    const userId = useGremlyStore.getState().userId;
    if (!userId) return;
    const mine = ++turn;
    try {
      const settings = await getWeekSettings(userId);
      const weeklyDay = weeklyDayOf(settings.weekly_day);
      const weekStart = weekStartFor(weeklyDay);
      const review = await getWeekReview(userId, weekStart);
      // a slower read must not replace a newer one, or a weekly day moved since
      if (mine !== turn || weekStartFor(weeklyDay) !== weekStart) return;
      set({ weeklyDay, daysOff: daysOffOf(settings.days_off), review, loaded: true });
      keepHabitWeek(weeklyDay);
    } catch (err) {
      console.warn('[Week] could not read the week:', err);
    }
  },

  setReview: (review) => {
    // a row for another week is not this week's
    if (review && review.week_start !== weekStartFor(get().weeklyDay)) return;
    set({ review });
  },

  setWeeklyDay: (weekday) => {
    turn += 1;
    const weeklyDay = weeklyDayOf(weekday);
    keepHabitWeek(weeklyDay);
    if (weeklyDay === get().weeklyDay) return;
    set({ weeklyDay, review: null });
  },

  chooseWeeklyDay: async (weekday) => {
    const userId = useGremlyStore.getState().userId;
    const weeklyDay = weeklyDayOf(weekday);
    if (!userId || weeklyDay === get().weeklyDay) return;
    await saveWeeklyDay(userId, weeklyDay);
    get().setWeeklyDay(weeklyDay);
    await get().refresh();
  },

  chooseDaysOff: async (days) => {
    const userId = useGremlyStore.getState().userId;
    if (!userId) return;
    const daysOff = daysOffOf(days);
    await saveDaysOff(userId, daysOff);
    set({ daysOff });
  },
}));
