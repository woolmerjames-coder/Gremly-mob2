/**
 * The person's week in the app (lib/week/thisWeek): their weekly day and days
 * off, and the review for the week they are in, worked out from their day.
 */
const mockState: any = { userId: 'u1' };
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockState,
    // the copy of their weekly day the habit counts read
    setState: (patch: any) => Object.assign(mockState, patch),
  },
}));
jest.mock('../../repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  saveDaysOff: jest.fn(),
  saveWeeklyDay: jest.fn(),
}));

import { useThisWeek, weekStartFor } from '../thisWeek';
import {
  getWeekReview,
  getWeekSettings,
  saveDaysOff,
  saveWeeklyDay,
} from '../../repo/weekReviewRepo';
import { getDateService } from '../../date/DateService';

const row = (weekStart: string) => ({
  id: `r-${weekStart}`,
  week_start: weekStart,
  answers: {},
  checkins: [],
});

beforeEach(() => {
  // Wednesday 7 October 2026, midday
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
  mockState.userId = 'u1';
  mockState.weeklyDay = 0;
  useThisWeek.setState({ weeklyDay: 0, daysOff: [0, 6], review: null, loaded: false });
  (getWeekSettings as jest.Mock).mockResolvedValue({ weekly_day: null, days_off: null });
  (getWeekReview as jest.Mock).mockImplementation(async (_user: string, weekStart: string) =>
    row(weekStart),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the week they are in', () => {
  it('starts the day after their weekly day', () => {
    expect(weekStartFor(0)).toBe('2026-10-05');
    // a Wednesday weekly day: today ends last week, and the new one starts tomorrow
    expect(weekStartFor(3)).toBe('2026-10-08');
    expect(weekStartFor(5)).toBe('2026-10-03');
  });

  it('counts from their day, which is still yesterday until their day ends', () => {
    getDateService().setDayBoundaryHour(3);
    // 1:30am on Monday 12 October: for them it is still Sunday, the weekly day
    jest.setSystemTime(new Date(2026, 9, 12, 1, 30, 0));
    expect(weekStartFor(0)).toBe('2026-10-12');
    jest.setSystemTime(new Date(2026, 9, 12, 9, 0, 0));
    expect(weekStartFor(0)).toBe('2026-10-12');
    jest.setSystemTime(new Date(2026, 9, 11, 1, 30, 0));
    expect(weekStartFor(0)).toBe('2026-10-05');
  });
});

describe('reading the week', () => {
  it('falls back to Sunday with Saturday and Sunday off, and reads that week', async () => {
    await useThisWeek.getState().refresh();
    expect(getWeekReview).toHaveBeenCalledWith('u1', '2026-10-05');
    expect(useThisWeek.getState()).toMatchObject({
      weeklyDay: 0,
      daysOff: [0, 6],
      review: { id: 'r-2026-10-05' },
      loaded: true,
    });
  });

  it('follows their own weekly day and days off', async () => {
    (getWeekSettings as jest.Mock).mockResolvedValue({ weekly_day: 5, days_off: [4, 5] });
    await useThisWeek.getState().refresh();
    expect(getWeekReview).toHaveBeenCalledWith('u1', '2026-10-03');
    expect(useThisWeek.getState()).toMatchObject({ weeklyDay: 5, daysOff: [4, 5] });
  });

  it('keeps what it had when the read fails, and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    useThisWeek.setState({ weeklyDay: 2, review: row('2026-10-07') as never, loaded: true });
    (getWeekSettings as jest.Mock).mockRejectedValue(new Error('offline'));
    await useThisWeek.getState().refresh();
    expect(useThisWeek.getState()).toMatchObject({ weeklyDay: 2, review: { id: 'r-2026-10-07' } });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reads nothing when nobody is signed in', async () => {
    mockState.userId = null;
    await useThisWeek.getState().refresh();
    expect(getWeekSettings).not.toHaveBeenCalled();
    expect(useThisWeek.getState().loaded).toBe(false);
  });
});

describe('after a save', () => {
  it("takes this week's row, and leaves out a row for another week", () => {
    useThisWeek.getState().setReview(row('2026-10-05') as never);
    expect(useThisWeek.getState().review?.id).toBe('r-2026-10-05');
    useThisWeek.getState().setReview(row('2026-10-12') as never);
    expect(useThisWeek.getState().review?.id).toBe('r-2026-10-05');
    useThisWeek.getState().setReview(null);
    expect(useThisWeek.getState().review).toBeNull();
  });

  it('keeps the weekly day as a weekday', () => {
    useThisWeek.getState().setWeeklyDay(3);
    expect(useThisWeek.getState().weeklyDay).toBe(3);
    useThisWeek.getState().setWeeklyDay(12);
    expect(useThisWeek.getState().weeklyDay).toBe(0);
  });

  it('keeps the main store’s copy in step, which the habit counts read', async () => {
    // moved here
    useThisWeek.getState().setWeeklyDay(3);
    expect(mockState.weeklyDay).toBe(3);
    // and read from their settings
    (getWeekSettings as jest.Mock).mockResolvedValue({ weekly_day: 5, days_off: null });
    await useThisWeek.getState().refresh();
    expect(useThisWeek.getState().weeklyDay).toBe(5);
    expect(mockState.weeklyDay).toBe(5);
    // a copy left behind by another screen is put right by the next read
    mockState.weeklyDay = 1;
    await useThisWeek.getState().refresh();
    expect(mockState.weeklyDay).toBe(5);
  });

  it('lets go of the review when the weekly day moves: the week they are in has moved with it', () => {
    useThisWeek.getState().setReview(row('2026-10-05') as never);
    useThisWeek.getState().setWeeklyDay(0);
    // the same day: nothing has moved
    expect(useThisWeek.getState().review?.id).toBe('r-2026-10-05');
    useThisWeek.getState().setWeeklyDay(3);
    expect(useThisWeek.getState().review).toBeNull();
  });

  it('a read already on its way when the weekly day moved does not put the old one back', async () => {
    let answer: (v: unknown) => void = () => undefined;
    (getWeekSettings as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const reading = useThisWeek.getState().refresh();
    useThisWeek.getState().setWeeklyDay(3);
    answer({ weekly_day: 0, days_off: null });
    await reading;
    expect(useThisWeek.getState().weeklyDay).toBe(3);
    expect(useThisWeek.getState().review).toBeNull();
  });
});

describe('their own choices, from Settings', () => {
  it('saves a new weekly day, follows it, and reads the week it gives', async () => {
    useThisWeek.setState({ loaded: true });
    (getWeekSettings as jest.Mock).mockResolvedValue({ weekly_day: 3, days_off: null });
    await useThisWeek.getState().chooseWeeklyDay(3);
    expect(saveWeeklyDay).toHaveBeenCalledWith('u1', 3);
    expect(useThisWeek.getState().weeklyDay).toBe(3);
    // Wednesday 7 October is now their weekly day: the week it plans starts on Thursday
    expect(useThisWeek.getState().review?.id).toBe('r-2026-10-08');
  });

  it('saves nothing when the day is the one they have', async () => {
    await useThisWeek.getState().chooseWeeklyDay(0);
    expect(saveWeeklyDay).not.toHaveBeenCalled();
  });

  it('keeps the day they had when the new one could not be saved, and says so', async () => {
    (saveWeeklyDay as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(useThisWeek.getState().chooseWeeklyDay(5)).rejects.toThrow('offline');
    expect(useThisWeek.getState().weeklyDay).toBe(0);
  });

  it('saves their days off in order, without repeats, and holds them', async () => {
    await useThisWeek.getState().chooseDaysOff([6, 5, 5]);
    expect(saveDaysOff).toHaveBeenCalledWith('u1', [5, 6]);
    expect(useThisWeek.getState().daysOff).toEqual([5, 6]);
    (saveDaysOff as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(useThisWeek.getState().chooseDaysOff([1])).rejects.toThrow('offline');
    expect(useThisWeek.getState().daysOff).toEqual([5, 6]);
  });
});
