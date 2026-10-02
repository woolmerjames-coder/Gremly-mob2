/**
 * The bell's sheet: quick picks add a reminder, the list shows and removes
 * them, and when notifications are off the one ask shows right there.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-community/datetimepicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="date-time-picker" /> };
});
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = () => <View />;
  return { Bell: Icon, Check: Icon, X: Icon };
});
jest.mock('../../../lib/notifications/ask', () => ({
  pendingAsk: jest.fn(),
  answerYes: jest.fn(),
  answerNotNow: jest.fn(),
}));
jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({ now: () => new Date(2026, 9, 1, 10, 0) }),
}));

import ReminderSheet from '../ReminderSheet';
import { pendingAsk } from '../../../lib/notifications/ask';

const pending = pendingAsk as jest.Mock;

beforeEach(() => {
  pending.mockResolvedValue(null);
});

it('a quick pick adds a reminder and says so', async () => {
  const onChange = jest.fn();
  const onClose = jest.fn();
  const { getByTestId, findByText } = render(
    <ReminderSheet visible kind="todo" reminders={[]} onChange={onChange} onClose={onClose} />,
  );
  fireEvent.press(getByTestId('reminder-pick-later'));
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ frequency: 'once', date: '2026-10-01', time: '18:00' }),
  ]);
  expect(await findByText('Done. I’ll remind you today at 6:00 PM.')).toBeTruthy();
  await waitFor(() => expect(pending).toHaveBeenCalledWith('bell'));
  await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2500 });
});

it('shows the reminders it has, and removes one', () => {
  const onChange = jest.fn();
  const { getByText, getByLabelText } = render(
    <ReminderSheet
      visible
      kind="habit"
      reminders={[{ id: 'a', frequency: 'daily', time: '07:00', notificationId: 'old' }]}
      onChange={onChange}
      onClose={jest.fn()}
    />,
  );
  expect(getByText('Every day at 7:00 AM')).toBeTruthy();
  fireEvent.press(getByLabelText('Remove reminder'));
  expect(onChange).toHaveBeenCalledWith([]);
});

it('events count back from the start', () => {
  const onChange = jest.fn();
  const { getByTestId } = render(
    <ReminderSheet
      visible
      kind="event"
      eventStart={{ date: '2026-10-03', time: '15:30' }}
      reminders={[]}
      onChange={onChange}
      onClose={jest.fn()}
    />,
  );
  fireEvent.press(getByTestId('reminder-pick-hour'));
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ kind: 'before', minutes: 60 })]);
});

it('when notifications are off, the one ask shows in the sheet', async () => {
  pending.mockResolvedValue('new');
  const { getByTestId, findByTestId, getByText } = render(
    <ReminderSheet visible kind="note" reminders={[]} onChange={jest.fn()} onClose={jest.fn()} />,
  );
  fireEvent.press(getByTestId('reminder-pick-tomorrow'));
  expect(await findByTestId('notification-ask')).toBeTruthy();
  expect(getByText('Can I send you notifications?')).toBeTruthy();
});
