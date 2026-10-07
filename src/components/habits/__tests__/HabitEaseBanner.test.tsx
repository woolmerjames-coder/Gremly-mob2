/**
 * A habit's pause or lighter version on its own screen
 * (src/components/habits/HabitEaseBanner): the days it runs, and the way back
 * to usual. Wednesday 7 October 2026.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockState: any = {};
jest.mock('../../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (pick: (s: any) => unknown) => pick(mockState),
}));
jest.mock('../../../../lib/date', () => ({
  getDateService: () => ({ today: () => '2026-10-07' }),
}));
jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  const icon = (name: string) => () => <View testID={`icon-${name}`} />;
  return { Pause: icon('pause'), Feather: icon('feather') };
});

import { HabitEaseBanner } from '../HabitEaseBanner';

const row = (mode: string, first: string, last: string, note: string | null = null) => ({
  id: `${mode}-${first}`,
  habit_id: 'run',
  mode,
  period_start: first,
  period_end: last,
  floor_note: note,
});

beforeEach(() => {
  mockState.habitAdaptations = [];
  mockState.easeHabit = jest.fn(async () => async () => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the banner on a habit that is eased', () => {
  it('shows nothing for a habit that is as usual', () => {
    const { queryByTestId } = render(<HabitEaseBanner habitId="run" />);
    expect(queryByTestId('habit-ease-banner')).toBeNull();
  });

  it('says a pause with the day it runs to, and what it means', () => {
    mockState.habitAdaptations = [row('pause', '2026-10-05', '2026-10-11')];
    const { getByText, getByTestId } = render(<HabitEaseBanner habitId="run" />);
    expect(getByText('Paused until Sun 11 Oct')).toBeTruthy();
    expect(
      getByText("It's off Today and I won't ask about it. If you do it anyway, it still counts."),
    ).toBeTruthy();
    expect(getByTestId('icon-pause')).toBeTruthy();
  });

  it('says a lighter version with what it is', () => {
    mockState.habitAdaptations = [row('floor', '2026-10-05', '2026-10-11', 'Ten minute walk')];
    const { getByText } = render(<HabitEaseBanner habitId="run" />);
    expect(getByText('Lighter version until Sun 11 Oct: Ten minute walk')).toBeTruthy();
    expect(getByText('The lighter version counts in full.')).toBeTruthy();
  });

  it('sets the one shown back to usual from today, and leaves one set for later as it is', async () => {
    mockState.habitAdaptations = [
      row('pause', '2026-10-05', '2026-10-11'),
      row('floor', '2026-10-12', '2026-10-18'),
    ];
    const { getByTestId, getByText } = render(<HabitEaseBanner habitId="run" />);
    expect(getByText('Back to usual')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('habit-ease-end'));
    });
    expect(mockState.easeHabit).toHaveBeenCalledWith('run', {
      mode: 'usual',
      first: '2026-10-07',
      last: '2026-10-11',
      note: '',
    });
  });

  it('shows one that has not started with its days and a way to remove it, and no more', async () => {
    mockState.habitAdaptations = [row('pause', '2026-10-12', '2026-10-18')];
    const { getByTestId, getByText, queryByText } = render(<HabitEaseBanner habitId="run" />);
    expect(getByText('Paused from Mon 12 Oct to Sun 18 Oct')).toBeTruthy();
    // it is still on Today, so nothing says it is off it
    expect(
      queryByText("It's off Today and I won't ask about it. If you do it anyway, it still counts."),
    ).toBeNull();
    expect(getByText('Remove')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('habit-ease-end'));
    });
    expect(mockState.easeHabit).toHaveBeenCalledWith('run', {
      mode: 'usual',
      first: '2026-10-12',
      last: '2026-10-18',
      note: '',
    });
  });

  it('says so when it could not be changed', async () => {
    mockState.habitAdaptations = [row('pause', '2026-10-05', '2026-10-11')];
    mockState.easeHabit = jest.fn(async () => {
      throw new Error('offline');
    });
    const { getByTestId, getByText } = render(<HabitEaseBanner habitId="run" />);
    await act(async () => {
      fireEvent.press(getByTestId('habit-ease-end'));
    });
    expect(getByText("I couldn't change that. Try it again.")).toBeTruthy();
  });
});
