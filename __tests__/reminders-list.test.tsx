/**
 * Tests for RemindersList component
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RemindersList, type ReminderRow } from '../components/overlay/fields/RemindersList';

describe('RemindersList', () => {
  describe('Basic Rendering', () => {
    it('should render section header and add button', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [];

      const { getByText, getByTestId } = render(
        <RemindersList reminders={reminders} onChange={onChange} />,
      );

      expect(getByText('Reminders')).toBeTruthy();
      expect(getByTestId('reminders-add')).toBeTruthy();
    });

    it('should show empty state when no reminders', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [];

      const { getByText } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      expect(getByText(/No reminders set/)).toBeTruthy();
    });

    it('should render reminder rows', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [
        { id: '1', time: '09:00', days: 'every' },
        { id: '2', time: '14:30', days: [1, 3, 5] },
      ];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      expect(getByTestId('reminder-row-1')).toBeTruthy();
      expect(getByTestId('reminder-row-2')).toBeTruthy();
    });
  });

  describe('Adding Reminders', () => {
    it('should add a new reminder with default values', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      fireEvent.press(getByTestId('reminders-add'));

      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({
          time: '09:00',
          days: 'every',
        }),
      ]);
    });

    it('should add multiple reminders', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      fireEvent.press(getByTestId('reminders-add'));

      expect(onChange).toHaveBeenCalledWith([
        { id: '1', time: '09:00', days: 'every' },
        expect.objectContaining({
          time: '09:00',
          days: 'every',
        }),
      ]);
    });
  });

  describe('Editing Time', () => {
    it('should render time input with correct testID', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      expect(getByTestId('reminder-time-1')).toBeTruthy();
    });

    it('should update time when changed', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      fireEvent.changeText(getByTestId('reminder-time-1'), '14:30');

      expect(onChange).toHaveBeenCalledWith([{ id: '1', time: '14:30', days: 'every' }]);
    });
  });

  describe('Days Configuration', () => {
    it('should render days section with testID', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      expect(getByTestId('reminder-days-1')).toBeTruthy();
    });

    it('should render days preset options', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      expect(getByTestId('reminder-days-every-1')).toBeTruthy();
      expect(getByTestId('reminder-days-per-occurrence-1')).toBeTruthy();
      expect(getByTestId('reminder-days-specific-1')).toBeTruthy();
    });

    it('should select "Every day" preset', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: [1, 3] }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      fireEvent.press(getByTestId('reminder-days-every-1'));

      expect(onChange).toHaveBeenCalledWith([{ id: '1', time: '09:00', days: 'every' }]);
    });

    it('should select "Per occurrence" preset', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      fireEvent.press(getByTestId('reminder-days-per-occurrence-1'));

      expect(onChange).toHaveBeenCalledWith([{ id: '1', time: '09:00', days: 'per_occurrence' }]);
    });

    it('should switch to specific days mode', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      fireEvent.press(getByTestId('reminder-days-specific-1'));

      expect(onChange).toHaveBeenCalledWith([{ id: '1', time: '09:00', days: [] }]);
    });
  });

  describe('Specific Days Selection', () => {
    it('should render day chips when specific days mode is active', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: [] }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      // Check all 7 day chips (0-6 for Sun-Sat)
      for (let i = 0; i < 7; i++) {
        expect(getByTestId(`reminder-day-chip-1-${i}`)).toBeTruthy();
      }
    });

    it('should not render day chips when "Every day" is selected', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { queryByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      expect(queryByTestId('reminder-day-chip-1-0')).toBeFalsy();
    });

    it('should toggle a specific day on', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: [] }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      // Select Monday (index 1)
      fireEvent.press(getByTestId('reminder-day-chip-1-1'));

      expect(onChange).toHaveBeenCalledWith([{ id: '1', time: '09:00', days: [1] }]);
    });

    it('should toggle multiple days and keep them sorted', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: [1] }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      // Select Friday (index 5)
      fireEvent.press(getByTestId('reminder-day-chip-1-5'));

      expect(onChange).toHaveBeenCalledWith([{ id: '1', time: '09:00', days: [1, 5] }]);
    });

    it('should toggle a day off', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: [1, 3, 5] }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      // Deselect Wednesday (index 3)
      fireEvent.press(getByTestId('reminder-day-chip-1-3'));

      expect(onChange).toHaveBeenCalledWith([{ id: '1', time: '09:00', days: [1, 5] }]);
    });

    it('should switch from preset to specific days when clicking a day chip', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      // First switch to specific days mode
      fireEvent.press(getByTestId('reminder-days-specific-1'));

      expect(onChange).toHaveBeenCalledWith([{ id: '1', time: '09:00', days: [] }]);
    });
  });

  describe('Deleting Reminders', () => {
    it('should render delete button with correct testID', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      expect(getByTestId('reminder-delete-1')).toBeTruthy();
    });

    it('should delete a reminder', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [
        { id: '1', time: '09:00', days: 'every' },
        { id: '2', time: '14:30', days: [1, 3, 5] },
      ];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      fireEvent.press(getByTestId('reminder-delete-1'));

      expect(onChange).toHaveBeenCalledWith([{ id: '2', time: '14:30', days: [1, 3, 5] }]);
    });

    it('should delete the last reminder', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      fireEvent.press(getByTestId('reminder-delete-1'));

      expect(onChange).toHaveBeenCalledWith([]);
    });
  });

  describe('Multiple Reminders', () => {
    it('should handle 2+ reminders with different configurations', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [
        { id: '1', time: '09:00', days: 'every' },
        { id: '2', time: '12:00', days: 'per_occurrence' },
        { id: '3', time: '18:00', days: [1, 3, 5] },
      ];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      expect(getByTestId('reminder-row-1')).toBeTruthy();
      expect(getByTestId('reminder-row-2')).toBeTruthy();
      expect(getByTestId('reminder-row-3')).toBeTruthy();
    });

    it('should update a specific reminder without affecting others', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [
        { id: '1', time: '09:00', days: 'every' },
        { id: '2', time: '14:30', days: [1, 3, 5] },
      ];

      const { getByTestId } = render(<RemindersList reminders={reminders} onChange={onChange} />);

      // Update time of second reminder
      fireEvent.changeText(getByTestId('reminder-time-2'), '15:00');

      expect(onChange).toHaveBeenCalledWith([
        { id: '1', time: '09:00', days: 'every' },
        { id: '2', time: '15:00', days: [1, 3, 5] },
      ]);
    });
  });

  describe('Disabled State', () => {
    it('should disable add button when disabled prop is true', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [];

      const { getByTestId } = render(
        <RemindersList reminders={reminders} onChange={onChange} disabled={true} />,
      );

      fireEvent.press(getByTestId('reminders-add'));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should disable time input when disabled', () => {
      const onChange = jest.fn();
      const reminders: ReminderRow[] = [{ id: '1', time: '09:00', days: 'every' }];

      const { getByTestId } = render(
        <RemindersList reminders={reminders} onChange={onChange} disabled={true} />,
      );

      const timeInput = getByTestId('reminder-time-1');
      expect(timeInput.props.editable).toBe(false);
    });
  });
});
