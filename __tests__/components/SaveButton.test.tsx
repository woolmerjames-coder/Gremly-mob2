/**
 * Unit tests for SaveButton component
 *
 * SaveButton has three visual states:
 * - initial: "Save this" with save icon (no Edit/X buttons)
 * - loading: "Saving..." with spinner
 * - confirmed: "Saved as [Type] ✓" with [Edit] and [X] buttons
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SaveButton from '../../components/chat/SaveButton';

describe('SaveButton', () => {
  const defaultProps = {
    suggestedType: 'log-general' as const,
    onSave: jest.fn(),
    onEdit: jest.fn(),
    onDismiss: jest.fn(),
    visible: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    test('renders when visible is true', () => {
      const { getByText } = render(<SaveButton {...defaultProps} />);
      expect(getByText('Save this')).toBeTruthy();
    });

    test('returns null when visible is false', () => {
      const { queryByText } = render(<SaveButton {...defaultProps} visible={false} />);
      expect(queryByText('Save this')).toBeNull();
    });

    test('shows "Save this" for initial state regardless of type', () => {
      const { getByText } = render(<SaveButton {...defaultProps} state="initial" />);
      expect(getByText('Save this')).toBeTruthy();
    });

    test('shows "Saving..." in loading state', () => {
      const { getByText } = render(<SaveButton {...defaultProps} state="loading" />);
      expect(getByText('Saving...')).toBeTruthy();
    });

    test('shows "Saved as To-Do ✓" in confirmed state for todo', () => {
      const { getByText } = render(
        <SaveButton {...defaultProps} suggestedType="todo" state="confirmed" />,
      );
      expect(getByText(/saved as to-do/i)).toBeTruthy();
    });

    test('shows "Saved as Habit ✓" in confirmed state for habit', () => {
      const { getByText } = render(
        <SaveButton {...defaultProps} suggestedType="habit" state="confirmed" />,
      );
      expect(getByText(/saved as habit/i)).toBeTruthy();
    });

    test('shows "Saved as Note ✓" in confirmed state for log-general', () => {
      const { getByText } = render(
        <SaveButton {...defaultProps} suggestedType="log-general" state="confirmed" />,
      );
      expect(getByText(/saved as note/i)).toBeTruthy();
    });

    test('shows "Saved as Idea ✓" in confirmed state for log-idea', () => {
      const { getByText } = render(
        <SaveButton {...defaultProps} suggestedType="log-idea" state="confirmed" />,
      );
      expect(getByText(/saved as idea/i)).toBeTruthy();
    });

    test('shows "Saved as Journal ✓" in confirmed state for log-journal', () => {
      const { getByText } = render(
        <SaveButton {...defaultProps} suggestedType="log-journal" state="confirmed" />,
      );
      expect(getByText(/saved as journal/i)).toBeTruthy();
    });

    test('uses savedType prop over suggestedType when provided', () => {
      const { getByText } = render(
        <SaveButton
          {...defaultProps}
          suggestedType="log-general"
          savedType="habit"
          state="confirmed"
        />,
      );
      expect(getByText(/saved as habit/i)).toBeTruthy();
    });

    test('shows correct labels for savedType prop values', () => {
      const { getByText: getTodo } = render(
        <SaveButton {...defaultProps} savedType="todo" state="confirmed" />,
      );
      expect(getTodo(/saved as to-do/i)).toBeTruthy();

      const { getByText: getHabit } = render(
        <SaveButton {...defaultProps} savedType="habit" state="confirmed" />,
      );
      expect(getHabit(/saved as habit/i)).toBeTruthy();

      const { getByText: getLog } = render(
        <SaveButton {...defaultProps} savedType="log" state="confirmed" />,
      );
      expect(getLog(/saved as note/i)).toBeTruthy();
    });

    test('Edit and X buttons only appear in confirmed state', () => {
      const { queryByLabelText: queryInitial } = render(
        <SaveButton {...defaultProps} state="initial" />,
      );
      expect(queryInitial(/edit/i)).toBeNull();
      expect(queryInitial(/dismiss/i)).toBeNull();

      const { getByLabelText: getConfirmed } = render(
        <SaveButton {...defaultProps} state="confirmed" />,
      );
      expect(getConfirmed(/edit/i)).toBeTruthy();
      expect(getConfirmed(/dismiss/i)).toBeTruthy();
    });
  });

  describe('interactions', () => {
    test('calls onSave when Save this button pressed in initial state', () => {
      const onSave = jest.fn();
      const { getByText } = render(
        <SaveButton {...defaultProps} onSave={onSave} state="initial" />,
      );

      fireEvent.press(getByText('Save this'));
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    test('calls onEdit when Edit pressed in confirmed state', () => {
      const onEdit = jest.fn();
      const { getByLabelText } = render(
        <SaveButton {...defaultProps} onEdit={onEdit} state="confirmed" />,
      );

      fireEvent.press(getByLabelText(/edit/i));
      expect(onEdit).toHaveBeenCalledTimes(1);
    });

    test('calls onDismiss when X pressed in confirmed state', () => {
      const onDismiss = jest.fn();
      const { getByLabelText } = render(
        <SaveButton {...defaultProps} onDismiss={onDismiss} state="confirmed" />,
      );

      fireEvent.press(getByLabelText(/dismiss/i));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test('Save this button is disabled when disabled prop is true', () => {
      const onSave = jest.fn();
      const { getByText } = render(
        <SaveButton {...defaultProps} onSave={onSave} disabled={true} state="initial" />,
      );

      fireEvent.press(getByText('Save this'));
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    test('Save this button has correct accessibility role', () => {
      const { getAllByRole } = render(<SaveButton {...defaultProps} state="initial" />);
      const buttons = getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    test('has accessibility label for save this action', () => {
      const { getByLabelText } = render(<SaveButton {...defaultProps} state="initial" />);
      expect(getByLabelText(/save this content/i)).toBeTruthy();
    });

    test('has edit accessibility label in confirmed state', () => {
      const { getByLabelText } = render(<SaveButton {...defaultProps} state="confirmed" />);
      expect(getByLabelText(/edit saved item/i)).toBeTruthy();
    });

    test('has dismiss accessibility label in confirmed state', () => {
      const { getByLabelText } = render(<SaveButton {...defaultProps} state="confirmed" />);
      expect(getByLabelText(/dismiss/i)).toBeTruthy();
    });

    test('indicates disabled state for accessibility', () => {
      const { getByLabelText } = render(
        <SaveButton {...defaultProps} disabled={true} state="initial" />,
      );
      const saveButton = getByLabelText(/save this content/i);
      expect(saveButton.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
