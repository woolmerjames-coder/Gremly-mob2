/**
 * A habit's week under Gremly's reply to the check in, and the week's
 * intention above the day card.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { HabitWeekDots } from '../HabitWeekDots';
import { ThisWeekCard } from '../ThisWeekCard';

const mockStore: Record<string, any> = {
  habitPlans: [
    { habit_id: 'h1', planned_date: '2026-10-08', status: 'planned' },
    { habit_id: 'h1', planned_date: '2026-10-10', status: 'planned' },
  ],
  habitProgress: [{ habit_id: 'h1', occurred_day: '2026-10-05' }],
};
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (pick: (s: any) => unknown) => pick(mockStore),
}));
const mockWeek = { weeklyDay: 0, loaded: true };
jest.mock('../../../lib/week/thisWeek', () => ({
  useThisWeek: (pick: (w: any) => unknown) => pick(mockWeek),
}));
jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({ ritualDay: () => '2026-10-08' }),
}));

describe('HabitWeekDots', () => {
  it('draws a dot for each day of their week, by where the habit stands', () => {
    const r = render(<HabitWeekDots habitId="h1" day="2026-10-08" />);
    for (const id of [
      'habit-week-2026-10-05-done',
      'habit-week-2026-10-06-none',
      'habit-week-2026-10-07-none',
      'habit-week-2026-10-08-today',
      'habit-week-2026-10-09-none',
      'habit-week-2026-10-10-planned',
      'habit-week-2026-10-11-none',
    ]) {
      expect(r.getByTestId(id)).toBeTruthy();
    }
    expect(r.getByText('Mon')).toBeTruthy();
    expect(r.getByText('Sun')).toBeTruthy();
    expect(r.getByTestId('brief-habit-week').props.accessibilityLabel).toBe(
      'Mon done, Tue not planned, Wed not planned, Thu today, Fri not planned, Sat planned, Sun not planned',
    );
  });
});

describe('HabitWeekDots, before their week is read', () => {
  afterEach(() => {
    mockWeek.loaded = true;
  });

  it('draws nothing: which seven days are their week is not known yet', () => {
    mockWeek.loaded = false;
    const r = render(<HabitWeekDots habitId="h1" day="2026-10-08" />);
    expect(r.queryByTestId('brief-habit-week')).toBeNull();
  });
});

describe('ThisWeekCard', () => {
  it('shows their intention in their own words', () => {
    const r = render(<ThisWeekCard text="Ship the submissions, and keep my body in it" />);
    expect(r.getByText('THIS WEEK')).toBeTruthy();
    expect(r.getByText('“Ship the submissions, and keep my body in it”')).toBeTruthy();
    expect(r.getByTestId('brief-this-week').props.accessibilityLabel).toBe(
      'This week: Ship the submissions, and keep my body in it',
    );
  });
});
