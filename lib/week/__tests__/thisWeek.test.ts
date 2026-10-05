/**
 * The person's week in the app (lib/week/thisWeek): their weekly day and days
 * off, and the review for the week they are in, worked out from their day.
 */
const mockState: any = { userId: 'u1' };
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockState },
}));
jest.mock('../../repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
}));

import { useThisWeek, weekStartFor } from '../thisWeek';
import { getWeekReview, getWeekSettings } from '../../repo/weekReviewRepo';
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
});
