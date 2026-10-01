import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TodayPinnedCard } from '../TodayPinnedCard';

jest.mock('../../../lib/brief/useDayCard', () => ({
  useDayCard: () => ({
    now: 465,
    meetings: [
      { id: 'a', title: 'Standup', start: 480, end: 510 },
      { id: 'b', title: 'QBR prep', start: 630, end: 795 },
    ],
    planned: [],
  }),
}));

describe('the pinned Today card', () => {
  it('says the brief is ready while it is unread', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(
      <TodayPinnedCard date="2026-10-01" unread onPress={onPress} />,
    );
    expect(getByText('Thursday 1 Oct')).toBeTruthy();
    expect(getByText('Your brief is ready')).toBeTruthy();
    expect(getByTestId('today-pinned-unread')).toBeTruthy();
    fireEvent.press(getByTestId('today-pinned-card'));
    expect(onPress).toHaveBeenCalled();
  });

  it('describes the rest of the day once read', () => {
    const { getByText, queryByTestId } = render(
      <TodayPinnedCard date="2026-10-01" unread={false} onPress={() => {}} />,
    );
    expect(getByText('Two meetings left, clear from 8:30')).toBeTruthy();
    expect(queryByTestId('today-pinned-unread')).toBeNull();
  });
});
