/**
 * Your week (Settings): the weekly day and the days off, each saved through
 * the one place the app holds them (lib/week/thisWeek).
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, setOptions: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SafeAreaView: ({ children }: any) => children,
}));
jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  return { ChevronLeft: () => <View testID="icon-chevron-left" /> };
});
const mockState: { userId: string | null } = { userId: 'maya' };
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockState,
    // the copy of their weekly day the habit counts read
    setState: (patch: any) => Object.assign(mockState, patch),
  },
}));
jest.mock('../../../lib/repo/weekReviewRepo', () => ({
  getWeekReview: jest.fn(),
  getWeekSettings: jest.fn(),
  saveDaysOff: jest.fn(),
  saveWeeklyDay: jest.fn(),
}));

import YourWeekSettingsScreen, { YOUR_WEEK_COPY } from '../YourWeekSettingsScreen';
import { useThisWeek } from '../../../lib/week/thisWeek';
import {
  getWeekReview,
  getWeekSettings,
  saveDaysOff,
  saveWeeklyDay,
} from '../../../lib/repo/weekReviewRepo';

let kept: { weekly_day: number | null; days_off: number[] | null };

beforeEach(() => {
  kept = { weekly_day: 3, days_off: [5, 6] };
  mockState.userId = 'maya';
  useThisWeek.setState({ weeklyDay: 0, daysOff: [0, 6], review: null, loaded: false });
  (getWeekSettings as jest.Mock).mockImplementation(async () => kept);
  (getWeekReview as jest.Mock).mockResolvedValue(null);
  (saveWeeklyDay as jest.Mock).mockImplementation(async (_user: string, day: number) => {
    kept = { ...kept, weekly_day: day };
  });
  (saveDaysOff as jest.Mock).mockImplementation(async (_user: string, days: number[]) => {
    kept = { ...kept, days_off: days };
  });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

async function open() {
  const screen = render(<YourWeekSettingsScreen />);
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  return screen;
}

const selected = (el: { props: { accessibilityState?: { selected?: boolean } } }) =>
  el.props.accessibilityState?.selected === true;

describe('Your week', () => {
  it('shows their own weekly day and days off, read when it opens', async () => {
    const { getByTestId, getByText } = await open();
    expect(getByText(YOUR_WEEK_COPY.title)).toBeTruthy();
    expect(getByText('Wednesday')).toBeTruthy();
    expect(selected(getByTestId('weekly-day-3'))).toBe(true);
    expect(selected(getByTestId('weekly-day-0'))).toBe(false);
    expect(selected(getByTestId('day-off-5'))).toBe(true);
    expect(selected(getByTestId('day-off-6'))).toBe(true);
    expect(selected(getByTestId('day-off-0'))).toBe(false);
  });

  it('marks no day as theirs until their settings are read', () => {
    (getWeekSettings as jest.Mock).mockImplementation(() => new Promise(() => undefined));
    const { getByTestId, queryByText } = render(<YourWeekSettingsScreen />);
    // Sunday is only the default: it is not shown as their choice
    expect(selected(getByTestId('weekly-day-0'))).toBe(false);
    expect(queryByText('Sunday')).toBeNull();
  });

  it('saves a new weekly day straight away, and every screen follows it', async () => {
    const { getByTestId, getByText } = await open();
    await act(async () => {
      fireEvent.press(getByTestId('weekly-day-5'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(saveWeeklyDay).toHaveBeenCalledWith('maya', 5);
    expect(useThisWeek.getState().weeklyDay).toBe(5);
    expect(selected(getByTestId('weekly-day-5'))).toBe(true);
    expect(getByText('Friday')).toBeTruthy();
  });

  it('adds and takes away a day off', async () => {
    const { getByTestId } = await open();
    await act(async () => {
      fireEvent.press(getByTestId('day-off-0'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(saveDaysOff).toHaveBeenLastCalledWith('maya', [0, 5, 6]);
    await act(async () => {
      fireEvent.press(getByTestId('day-off-5'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(saveDaysOff).toHaveBeenLastCalledWith('maya', [0, 6]);
    expect(useThisWeek.getState().daysOff).toEqual([0, 6]);
    expect(selected(getByTestId('day-off-5'))).toBe(false);
  });

  it('says so when a choice could not be saved, and keeps what was there', async () => {
    const { getByTestId, queryByTestId } = await open();
    (saveWeeklyDay as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      fireEvent.press(getByTestId('weekly-day-1'));
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    expect(queryByTestId('your-week-failed')).not.toBeNull();
    expect(useThisWeek.getState().weeklyDay).toBe(3);
    expect(selected(getByTestId('weekly-day-3'))).toBe(true);
  });
});
