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

  it('offers to wrap up in the evening, and a tap starts it', () => {
    const onPress = jest.fn();
    const onWrapUp = jest.fn();
    const { getByText, getByTestId } = render(
      <TodayPinnedCard
        date="2026-10-01"
        unread={false}
        onPress={onPress}
        phase="evening"
        wrapLine="Wrap up today: 3 things to decide"
        wrapNudge
        onWrapUp={onWrapUp}
      />,
    );
    expect(getByText('Wrap up today: 3 things to decide')).toBeTruthy();
    expect(getByTestId('today-pinned-wrap')).toBeTruthy();
    fireEvent.press(getByTestId('today-pinned-card'));
    expect(onWrapUp).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('says it is wrapped up once done, and a tap opens the thread', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId, queryByTestId } = render(
      <TodayPinnedCard
        date="2026-10-01"
        unread={false}
        onPress={onPress}
        phase="evening"
        wrapLine="Wrapped up, and Gremly is fed"
      />,
    );
    expect(getByText('Wrapped up, and Gremly is fed')).toBeTruthy();
    expect(queryByTestId('today-pinned-wrap')).toBeNull();
    fireEvent.press(getByTestId('today-pinned-card'));
    expect(onPress).toHaveBeenCalled();
  });

  it('keeps the day when there is no evening line, and the brief first while unread', () => {
    const one = render(
      <TodayPinnedCard date="2026-10-01" unread={false} onPress={() => {}} phase="evening" />,
    );
    expect(one.getByText('Two meetings left, clear from 8:30')).toBeTruthy();
    const two = render(
      <TodayPinnedCard
        date="2026-10-01"
        unread
        onPress={() => {}}
        phase="evening"
        wrapLine="Wrap up today: 1 thing to decide"
      />,
    );
    expect(two.getByText('Your brief is ready')).toBeTruthy();
  });
});
