/**
 * The history card in the item overlay: the latest change first, the rest
 * behind "N changes", ending with where the item began; and the label over
 * the words first written.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ChangeHistoryCard, OriginalTextLabel } from '../ChangeHistoryCard';
import type { ChangeEntry } from '../../../lib/chat/changeHistory';

jest.mock('lucide-react-native', () => {
  const icon = () => null;
  return new Proxy({}, { get: () => icon });
});

const justNow = new Date().toISOString();
const moved: ChangeEntry = {
  id: 'a',
  field: 'due_day',
  from: '2026-10-02',
  to: '2026-10-05',
  was: 'Fri 2 Oct, 10:00am',
  now: 'Mon 5 Oct, 3:00pm',
  at: justNow,
  source: 'minddrop',
};
const movedAgain: ChangeEntry = {
  ...moved,
  id: 'b',
  from: '2026-10-05',
  to: '2026-10-06',
  was: 'Mon 5 Oct, 3:00pm',
  now: 'Tue 6 Oct, 9:30am',
  source: 'chat',
};

describe('ChangeHistoryCard', () => {
  it('leads with the change and what it was', () => {
    const { getByText, queryByTestId } = render(<ChangeHistoryCard entries={[moved]} />);
    expect(getByText('Moved to Mon 5 Oct, 3:00pm')).toBeTruthy();
    expect(getByText('was Fri 2 Oct, 10:00am · from Mind Drop · just now')).toBeTruthy();
    expect(queryByTestId('change-history-toggle')).toBeNull();
  });

  it('opens the earlier changes, newest first, down to where the item began', () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <ChangeHistoryCard
        entries={[moved, movedAgain]}
        origin="catchall"
        createdAt={new Date(2026, 8, 30, 9, 12).toISOString()}
      />,
    );
    expect(getByText('Moved to Tue 6 Oct, 9:30am')).toBeTruthy();
    expect(queryByTestId('change-history-earlier')).toBeNull();
    expect(getByText('2 changes')).toBeTruthy();

    fireEvent.press(getByTestId('change-history-toggle'));
    expect(getByTestId('change-history-earlier')).toBeTruthy();
    expect(getByText('Moved to Mon 5 Oct, 3:00pm')).toBeTruthy();
    expect(getByText('Dropped into Mind Drop')).toBeTruthy();
    expect(getByText('Wed 30 Sep, 9:12am')).toBeTruthy();
    expect(getByText('Hide history')).toBeTruthy();
  });

  it('shows nothing without a change', () => {
    expect(render(<ChangeHistoryCard entries={[]} />).toJSON()).toBeNull();
  });
});

describe('OriginalTextLabel', () => {
  it('names the words and the day', () => {
    const { getByText } = render(<OriginalTextLabel label="Your original drop" day="Wed 30 Sep" />);
    expect(getByText('Your original drop')).toBeTruthy();
    expect(getByText('· Wed 30 Sep')).toBeTruthy();
  });
});
