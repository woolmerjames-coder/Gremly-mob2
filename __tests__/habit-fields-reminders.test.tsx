/**
 * Integration tests for HabitFields with Reminders
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HabitFields } from '../components/overlay/fields/HabitFields';
import type { ReminderRow } from '../components/overlay/fields/RemindersList';

describe('HabitFields with Reminders', () => {
  it('should render reminders section when onRemindersChange is provided', () => {
    const onRemindersChange = jest.fn();
    const reminders: ReminderRow[] = [];

    const { getByTestId, getByText } = render(
      <HabitFields
        name="Test Habit"
        onNameChange={jest.fn()}
        frequency="daily"
        onFrequencyChange={jest.fn()}
        reminders={reminders}
        onRemindersChange={onRemindersChange}
      />,
    );

    expect(getByText('Reminders')).toBeTruthy();
    expect(getByTestId('reminders-add')).toBeTruthy();
  });

  it('should not render reminders section when onRemindersChange is not provided', () => {
    const { queryByText } = render(
      <HabitFields
        name="Test Habit"
        onNameChange={jest.fn()}
        frequency="daily"
        onFrequencyChange={jest.fn()}
      />,
    );

    expect(queryByText('Reminders')).toBeFalsy();
  });

  it('should add reminders for Start Habit', () => {
    const onRemindersChange = jest.fn();
    const reminders: ReminderRow[] = [];

    const { getByTestId } = render(
      <HabitFields
        name="Morning Meditation"
        onNameChange={jest.fn()}
        frequency="daily"
        onFrequencyChange={jest.fn()}
        subtype="start_habit"
        reminders={reminders}
        onRemindersChange={onRemindersChange}
      />,
    );

    fireEvent.press(getByTestId('reminders-add'));

    expect(onRemindersChange).toHaveBeenCalledWith([
      expect.objectContaining({
        time: '09:00',
        days: 'every',
      }),
    ]);
  });

  it('should add reminders for Break Habit', () => {
    const onRemindersChange = jest.fn();
    const reminders: ReminderRow[] = [];

    const { getByTestId } = render(
      <HabitFields
        name="Stop Smoking"
        onNameChange={jest.fn()}
        frequency="daily"
        onFrequencyChange={jest.fn()}
        subtype="break_habit"
        reminders={reminders}
        onRemindersChange={onRemindersChange}
      />,
    );

    fireEvent.press(getByTestId('reminders-add'));

    expect(onRemindersChange).toHaveBeenCalledWith([
      expect.objectContaining({
        time: '09:00',
        days: 'every',
      }),
    ]);
  });

  it('should display existing reminders', () => {
    const onRemindersChange = jest.fn();
    const reminders: ReminderRow[] = [
      { id: '1', time: '09:00', days: 'every' },
      { id: '2', time: '14:30', days: [1, 3, 5] },
    ];

    const { getByTestId } = render(
      <HabitFields
        name="Test Habit"
        onNameChange={jest.fn()}
        frequency="daily"
        onFrequencyChange={jest.fn()}
        reminders={reminders}
        onRemindersChange={onRemindersChange}
      />,
    );

    expect(getByTestId('reminder-row-1')).toBeTruthy();
    expect(getByTestId('reminder-row-2')).toBeTruthy();
  });

  it('should edit reminder time', () => {
    const onRemindersChange = jest.fn();
    const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

    const { getByTestId } = render(
      <HabitFields
        name="Test Habit"
        onNameChange={jest.fn()}
        frequency="daily"
        onFrequencyChange={jest.fn()}
        reminders={reminders}
        onRemindersChange={onRemindersChange}
      />,
    );

    fireEvent.changeText(getByTestId('reminder-time-1'), '10:30');

    expect(onRemindersChange).toHaveBeenCalledWith([{ id: '1', time: '10:30', days: 'every' }]);
  });

  it('should delete a reminder', () => {
    const onRemindersChange = jest.fn();
    const reminders: ReminderRow[] = [
      { id: '1', time: '09:00', days: 'every' },
      { id: '2', time: '14:30', days: [1, 3, 5] },
    ];

    const { getByTestId } = render(
      <HabitFields
        name="Test Habit"
        onNameChange={jest.fn()}
        frequency="daily"
        onFrequencyChange={jest.fn()}
        reminders={reminders}
        onRemindersChange={onRemindersChange}
      />,
    );

    fireEvent.press(getByTestId('reminder-delete-1'));

    expect(onRemindersChange).toHaveBeenCalledWith([{ id: '2', time: '14:30', days: [1, 3, 5] }]);
  });

  it('should work with Start Habit frequency builder and reminders together', () => {
    const onRemindersChange = jest.fn();
    const onFrequencyValueChange = jest.fn();
    const reminders: ReminderRow[] = [];

    const { getByTestId } = render(
      <HabitFields
        name="Morning Run"
        onNameChange={jest.fn()}
        frequency="daily"
        onFrequencyChange={jest.fn()}
        subtype="start_habit"
        frequencyValue={{ kind: 'daily' }}
        onFrequencyValueChange={onFrequencyValueChange}
        reminders={reminders}
        onRemindersChange={onRemindersChange}
      />,
    );

    // Should show new frequency builder
    expect(getByTestId('freq-chip-daily')).toBeTruthy();

    // Should show reminders
    expect(getByTestId('reminders-add')).toBeTruthy();
  });
});
