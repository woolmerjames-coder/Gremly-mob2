/**
 * The week's board as it sits in today's thread (components/week/BoardCard):
 * what it says while Gremly is spreading the week, what it offers when the
 * spread did not come back, and the rings and the button once it is ready.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { BoardCard, type BoardCardProps } from '../BoardCard';

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View } = require('react-native');
  return { ChevronRight: () => <View testID="icon-chevron-right" /> };
});

const DAYS: BoardCardProps['days'] = [
  { day: '2026-10-05', short: 'Mon', count: 3, fraction: 0.6, tone: 'ok' },
  { day: '2026-10-06', short: 'Tue', count: 1, fraction: 0.9, tone: 'busy' },
  { day: '2026-10-07', short: 'Wed', count: 5, fraction: 1.2, tone: 'over' },
];

function card(over: Partial<BoardCardProps> = {}) {
  const onOpen = jest.fn();
  const onRetry = jest.fn();
  const view = render(
    <BoardCard
      intro="Now the week itself."
      state="ready"
      days={DAYS}
      cta="Plan my week"
      live
      onOpen={onOpen}
      onRetry={onRetry}
      {...over}
    />,
  );
  return { ...view, onOpen, onRetry };
}

describe('the board’s card in the thread', () => {
  it('shows Gremly’s line, a ring and a count for each day, and opens the board', () => {
    const { getByText, getByTestId, queryByTestId, onOpen } = card();
    expect(getByText('GREMLY')).toBeTruthy();
    expect(getByText('Now the week itself.')).toBeTruthy();
    for (const d of DAYS) {
      expect(getByText(d.short)).toBeTruthy();
      expect(getByText(String(d.count))).toBeTruthy();
    }
    expect(getByText('Plan my week')).toBeTruthy();
    expect(queryByTestId('week-board-fitting')).toBeNull();
    expect(queryByTestId('week-board-retry')).toBeNull();
    fireEvent.press(getByTestId('week-board-open'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('says the week is being fitted while the spread is made, with nothing to open yet', () => {
    const { getByTestId, getByText, queryByTestId, queryByText } = card({
      state: 'fitting',
      intro: null,
    });
    expect(getByTestId('week-board-fitting')).toBeTruthy();
    expect(getByText('Gremly is fitting your week')).toBeTruthy();
    expect(queryByText('GREMLY')).toBeNull();
    expect(queryByTestId('week-board-open')).toBeNull();
  });

  it('offers to try again when the spread did not come back, and the board by hand all the same', () => {
    const { getByTestId, onOpen, onRetry } = card({ state: 'failed' });
    fireEvent.press(getByTestId('week-board-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('week-board-open'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('keeps the rings and drops the buttons once the review has moved on from it', () => {
    const { getByText, queryByTestId } = card({ live: false, state: 'ready' });
    expect(getByText('Mon')).toBeTruthy();
    expect(queryByTestId('week-board-open')).toBeNull();
    expect(queryByTestId('week-board-retry')).toBeNull();
  });

  it('takes no tap while the review is busy', () => {
    const { getByTestId, onOpen, onRetry } = card({ state: 'failed', disabled: true });
    fireEvent.press(getByTestId('week-board-open'));
    fireEvent.press(getByTestId('week-board-retry'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
