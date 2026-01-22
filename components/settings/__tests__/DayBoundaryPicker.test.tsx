/**
 * DayBoundaryPicker.test.tsx
 *
 * Tests for the day boundary picker component.
 * Allows users to select when their "day" starts for ritual tracking.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DayBoundaryPicker from '../DayBoundaryPicker';

describe('DayBoundaryPicker', () => {
  const defaultProps = {
    value: 5,
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders all boundary options', () => {
      const { getByText } = render(<DayBoundaryPicker {...defaultProps} />);
      expect(getByText('Midnight')).toBeTruthy();
      expect(getByText('3:00 AM')).toBeTruthy();
      expect(getByText('5:00 AM')).toBeTruthy();
    });

    it('renders exactly 3 options', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} />);
      // Each option has accessibilityRole="radio"
      const radioButtons = getAllByRole('radio');
      expect(radioButtons).toHaveLength(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Selection State
  // ─────────────────────────────────────────────────────────────────────────

  describe('selection state', () => {
    it('marks the current value as selected', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} value={5} />);
      const radioButtons = getAllByRole('radio');

      // Find the 5:00 AM option (index 2 in the options array)
      const selectedOption = radioButtons.find(
        (btn) => btn.props.accessibilityState?.selected === true,
      );
      expect(selectedOption).toBeTruthy();
      expect(selectedOption?.props.accessibilityLabel).toBe('Day starts at 5:00 AM');
    });

    it('marks midnight as selected when value is 0', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} value={0} />);
      const radioButtons = getAllByRole('radio');

      const selectedOption = radioButtons.find(
        (btn) => btn.props.accessibilityState?.selected === true,
      );
      expect(selectedOption?.props.accessibilityLabel).toBe('Day starts at Midnight');
    });

    it('marks 3:00 AM as selected when value is 3', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} value={3} />);
      const radioButtons = getAllByRole('radio');

      const selectedOption = radioButtons.find(
        (btn) => btn.props.accessibilityState?.selected === true,
      );
      expect(selectedOption?.props.accessibilityLabel).toBe('Day starts at 3:00 AM');
    });

    it('marks 5:00 AM as selected when value is 5', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} value={5} />);
      const radioButtons = getAllByRole('radio');

      const selectedOption = radioButtons.find(
        (btn) => btn.props.accessibilityState?.selected === true,
      );
      expect(selectedOption?.props.accessibilityLabel).toBe('Day starts at 5:00 AM');
    });

    it('only one option is selected at a time', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} value={5} />);
      const radioButtons = getAllByRole('radio');

      const selectedOptions = radioButtons.filter(
        (btn) => btn.props.accessibilityState?.selected === true,
      );
      expect(selectedOptions).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // onChange Callback
  // ─────────────────────────────────────────────────────────────────────────

  describe('onChange callback', () => {
    it('calls onChange when an option is pressed', () => {
      const onChange = jest.fn();
      const { getByText } = render(<DayBoundaryPicker {...defaultProps} onChange={onChange} />);

      fireEvent.press(getByText('Midnight'));
      expect(onChange).toHaveBeenCalledWith(0);
    });

    it('calls onChange with correct value for each option', () => {
      const onChange = jest.fn();
      const { getByText } = render(<DayBoundaryPicker {...defaultProps} onChange={onChange} />);

      fireEvent.press(getByText('Midnight'));
      expect(onChange).toHaveBeenLastCalledWith(0);

      fireEvent.press(getByText('3:00 AM'));
      expect(onChange).toHaveBeenLastCalledWith(3);

      fireEvent.press(getByText('5:00 AM'));
      expect(onChange).toHaveBeenLastCalledWith(5);
    });

    it('calls onChange even when pressing already selected option', () => {
      const onChange = jest.fn();
      const { getByText } = render(<DayBoundaryPicker value={5} onChange={onChange} />);

      fireEvent.press(getByText('5:00 AM'));
      expect(onChange).toHaveBeenCalledWith(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Disabled State
  // ─────────────────────────────────────────────────────────────────────────

  describe('disabled state', () => {
    it('does not call onChange when disabled', () => {
      const onChange = jest.fn();
      const { getByText } = render(
        <DayBoundaryPicker {...defaultProps} onChange={onChange} disabled={true} />,
      );

      fireEvent.press(getByText('Midnight'));
      expect(onChange).not.toHaveBeenCalled();

      fireEvent.press(getByText('3:00 AM'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('marks options as disabled in accessibility state', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} disabled={true} />);
      const radioButtons = getAllByRole('radio');

      radioButtons.forEach((btn) => {
        expect(btn.props.accessibilityState?.disabled).toBe(true);
      });
    });

    it('options are not disabled by default', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} />);
      const radioButtons = getAllByRole('radio');

      radioButtons.forEach((btn) => {
        expect(btn.props.accessibilityState?.disabled).toBeFalsy();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Accessibility
  // ─────────────────────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('has correct accessibility labels', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} />);
      const radioButtons = getAllByRole('radio');

      const labels = radioButtons.map((btn) => btn.props.accessibilityLabel);
      expect(labels).toContain('Day starts at Midnight');
      expect(labels).toContain('Day starts at 3:00 AM');
      expect(labels).toContain('Day starts at 5:00 AM');
    });

    it('uses radio role for options', () => {
      const { getAllByRole } = render(<DayBoundaryPicker {...defaultProps} />);
      const radioButtons = getAllByRole('radio');
      expect(radioButtons.length).toBeGreaterThan(0);
    });
  });
});
