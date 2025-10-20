/**
 * Tests for HabitFrequency component
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HabitFrequency, type FrequencyValue } from '../components/overlay/fields/HabitFrequency';

describe('HabitFrequency', () => {
  describe('Preset Frequencies', () => {
    it('should render preset chips (Daily, Weekly, Monthly, Custom)', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'daily' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      expect(getByTestId('freq-chip-daily')).toBeTruthy();
      expect(getByTestId('freq-chip-weekly')).toBeTruthy();
      expect(getByTestId('freq-chip-monthly')).toBeTruthy();
      expect(getByTestId('freq-chip-custom')).toBeTruthy();
    });

    it('should select Daily preset', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'weekly' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('freq-chip-daily'));

      expect(onChange).toHaveBeenCalledWith({ kind: 'daily' });
    });

    it('should select Weekly preset', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'daily' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('freq-chip-weekly'));

      expect(onChange).toHaveBeenCalledWith({ kind: 'weekly' });
    });

    it('should select Monthly preset', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'daily' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('freq-chip-monthly'));

      expect(onChange).toHaveBeenCalledWith({ kind: 'monthly' });
    });
  });

  describe('Custom Builder - Specific Days', () => {
    it('should show custom builder when Custom preset is selected', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'daily' };

      const { getByTestId, queryByTestId } = render(
        <HabitFrequency value={value} onChange={onChange} />,
      );

      // Initially, custom builder should not be visible
      expect(queryByTestId('freq-custom-days')).toBeFalsy();

      // Select Custom
      fireEvent.press(getByTestId('freq-chip-custom'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'custom_days',
        days: [],
      });
    });

    it('should render day chips (S M T W T F S)', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'custom_days', days: [] };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      expect(getByTestId('freq-custom-days')).toBeTruthy();
      expect(getByTestId('day-chip-0')).toBeTruthy(); // Sunday
      expect(getByTestId('day-chip-1')).toBeTruthy(); // Monday
      expect(getByTestId('day-chip-2')).toBeTruthy(); // Tuesday
      expect(getByTestId('day-chip-3')).toBeTruthy(); // Wednesday
      expect(getByTestId('day-chip-4')).toBeTruthy(); // Thursday
      expect(getByTestId('day-chip-5')).toBeTruthy(); // Friday
      expect(getByTestId('day-chip-6')).toBeTruthy(); // Saturday
    });

    it('should toggle specific days', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'custom_days', days: [] };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      // Select Monday (index 1)
      fireEvent.press(getByTestId('day-chip-1'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'custom_days',
        days: [1],
      });
    });

    it('should toggle multiple days and keep them sorted', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'custom_days', days: [1] };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      // Select Friday (index 5)
      fireEvent.press(getByTestId('day-chip-5'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'custom_days',
        days: [1, 5],
      });
    });

    it('should deselect a day', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'custom_days', days: [1, 3, 5] };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      // Deselect Wednesday (index 3)
      fireEvent.press(getByTestId('day-chip-3'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'custom_days',
        days: [1, 5],
      });
    });

    it('should show time picker toggle', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'custom_days', days: [1] };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      expect(getByTestId('time-picker-toggle')).toBeTruthy();
    });

    it('should show time window toggle', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'custom_days', days: [1] };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      expect(getByTestId('time-window-toggle')).toBeTruthy();
    });
  });

  describe('Custom Builder - N per Period', () => {
    it('should show N per period tab', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'custom_days', days: [] };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      expect(getByTestId('freq-custom-nper')).toBeTruthy();
    });

    it('should switch to N per period mode', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'custom_days', days: [1] };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('freq-custom-nper'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'n_per_period',
        n: 3,
        period: 'week',
      });
    });

    it('should render stepper for n value', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 3, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      expect(getByTestId('n-stepper-minus')).toBeTruthy();
      expect(getByTestId('n-stepper-value')).toBeTruthy();
      expect(getByTestId('n-stepper-plus')).toBeTruthy();
    });

    it('should increment n value', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 3, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('n-stepper-plus'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'n_per_period',
        n: 4,
        period: 'week',
      });
    });

    it('should decrement n value', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 3, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('n-stepper-minus'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'n_per_period',
        n: 2,
        period: 'week',
      });
    });

    it('should not decrement n below 1', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 1, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('n-stepper-minus'));

      // Should not call onChange when trying to go below 1
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should render period chips (Week, Month)', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 3, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      expect(getByTestId('period-chip-week')).toBeTruthy();
      expect(getByTestId('period-chip-month')).toBeTruthy();
    });

    it('should switch period to Month', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 3, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('period-chip-month'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'n_per_period',
        n: 3,
        period: 'month',
      });
    });

    it('should render constraint chips (Spread out, Any day)', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 3, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      expect(getByTestId('constraint-chip-spread')).toBeTruthy();
      expect(getByTestId('constraint-chip-any')).toBeTruthy();
    });

    it('should toggle Spread out constraint', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 3, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('constraint-chip-spread'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'n_per_period',
        n: 3,
        period: 'week',
        constraint: 'spread_out',
      });
    });

    it('should toggle Any day constraint', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = { kind: 'n_per_period', n: 3, period: 'week' };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('constraint-chip-any'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'n_per_period',
        n: 3,
        period: 'week',
        constraint: 'any',
      });
    });

    it('should deselect constraint when clicking again', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = {
        kind: 'n_per_period',
        n: 3,
        period: 'week',
        constraint: 'spread_out',
      };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      fireEvent.press(getByTestId('constraint-chip-spread'));

      expect(onChange).toHaveBeenCalledWith({
        kind: 'n_per_period',
        n: 3,
        period: 'week',
      });
    });
  });

  describe('Integration', () => {
    it('should maintain full custom_days state with time', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = {
        kind: 'custom_days',
        days: [1, 3, 5],
        time: '09:00',
      };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      // Verify all selected days are showing
      expect(getByTestId('day-chip-1')).toBeTruthy();
      expect(getByTestId('day-chip-3')).toBeTruthy();
      expect(getByTestId('day-chip-5')).toBeTruthy();
    });

    it('should maintain full n_per_period state', () => {
      const onChange = jest.fn();
      const value: FrequencyValue = {
        kind: 'n_per_period',
        n: 5,
        period: 'month',
        constraint: 'spread_out',
        time: '14:30',
      };

      const { getByTestId } = render(<HabitFrequency value={value} onChange={onChange} />);

      // Switch to n_per_period tab
      fireEvent.press(getByTestId('freq-custom-nper'));

      // Verify n value is displayed
      expect(getByTestId('n-stepper-value')).toBeTruthy();
    });
  });
});
