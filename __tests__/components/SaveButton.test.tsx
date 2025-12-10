/**
 * Unit tests for SaveButton component
 *
 * Note: SaveButton was updated to use Lucide icons and simplified labels:
 * - todo: "Save as To-Do"
 * - habit: "Save as Habit"
 * - log-*: "Save for Later"
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SaveButton from '../../components/chat/SaveButton';

describe('SaveButton', () => {
  const defaultProps = {
    suggestedType: 'log-general' as const,
    onSave: jest.fn(),
    onDismiss: jest.fn(),
    visible: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    test('renders when visible is true', () => {
      const { getByText } = render(<SaveButton {...defaultProps} />);
      expect(getByText('Save')).toBeTruthy();
    });

    test('returns null when visible is false', () => {
      const { queryByText } = render(<SaveButton {...defaultProps} visible={false} />);
      expect(queryByText('Save')).toBeNull();
    });

    test('shows correct label for log-general', () => {
      const { getByText } = render(<SaveButton {...defaultProps} suggestedType="log-general" />);
      expect(getByText(/save for later/i)).toBeTruthy();
    });

    test('shows correct label for todo', () => {
      const { getByText } = render(<SaveButton {...defaultProps} suggestedType="todo" />);
      expect(getByText(/save as to-do/i)).toBeTruthy();
    });

    test('shows correct label for habit', () => {
      const { getByText } = render(<SaveButton {...defaultProps} suggestedType="habit" />);
      expect(getByText(/save as habit/i)).toBeTruthy();
    });

    test('shows correct label for log-list', () => {
      const { getByText } = render(<SaveButton {...defaultProps} suggestedType="log-list" />);
      expect(getByText(/save for later/i)).toBeTruthy();
    });

    test('shows correct label for log-idea', () => {
      const { getByText } = render(<SaveButton {...defaultProps} suggestedType="log-idea" />);
      expect(getByText(/save for later/i)).toBeTruthy();
    });

    // Icons are now Lucide components (CheckSquare, Repeat, Bookmark)
    // Instead of emojis, we verify the labels are correct
    test('renders todo with appropriate UI', () => {
      const { getByText } = render(<SaveButton {...defaultProps} suggestedType="todo" />);
      expect(getByText(/save as to-do/i)).toBeTruthy();
      expect(getByText('Save')).toBeTruthy();
    });

    test('renders habit with appropriate UI', () => {
      const { getByText } = render(<SaveButton {...defaultProps} suggestedType="habit" />);
      expect(getByText(/save as habit/i)).toBeTruthy();
      expect(getByText('Save')).toBeTruthy();
    });

    test('renders log-idea with appropriate UI', () => {
      const { getByText } = render(<SaveButton {...defaultProps} suggestedType="log-idea" />);
      expect(getByText(/save for later/i)).toBeTruthy();
      expect(getByText('Save')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    test('calls onSave when Save button pressed', () => {
      const onSave = jest.fn();
      const { getByText } = render(<SaveButton {...defaultProps} onSave={onSave} />);

      fireEvent.press(getByText('Save'));
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    test('calls onDismiss when X pressed', () => {
      const onDismiss = jest.fn();
      const { getByLabelText } = render(<SaveButton {...defaultProps} onDismiss={onDismiss} />);

      fireEvent.press(getByLabelText(/dismiss/i));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test('Save button is disabled when disabled prop is true', () => {
      const onSave = jest.fn();
      const { getByText } = render(
        <SaveButton {...defaultProps} onSave={onSave} disabled={true} />,
      );

      fireEvent.press(getByText('Save'));
      expect(onSave).not.toHaveBeenCalled();
    });

    test('Dismiss button is disabled when disabled prop is true', () => {
      const onDismiss = jest.fn();
      const { getByLabelText } = render(
        <SaveButton {...defaultProps} onDismiss={onDismiss} disabled={true} />,
      );

      fireEvent.press(getByLabelText(/dismiss/i));
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    test('Save button has correct accessibility role', () => {
      const { getAllByRole } = render(<SaveButton {...defaultProps} />);
      const buttons = getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    test('has accessibility label for save action (log-general)', () => {
      const { getByLabelText } = render(
        <SaveButton {...defaultProps} suggestedType="log-general" />,
      );
      expect(getByLabelText(/save for later/i)).toBeTruthy();
    });

    test('has accessibility label for todo type', () => {
      const { getByLabelText } = render(<SaveButton {...defaultProps} suggestedType="todo" />);
      expect(getByLabelText(/save as to-do/i)).toBeTruthy();
    });

    test('has accessibility label for habit type', () => {
      const { getByLabelText } = render(<SaveButton {...defaultProps} suggestedType="habit" />);
      expect(getByLabelText(/save as habit/i)).toBeTruthy();
    });

    test('has dismiss accessibility label', () => {
      const { getByLabelText } = render(<SaveButton {...defaultProps} />);
      expect(getByLabelText(/dismiss save suggestion/i)).toBeTruthy();
    });

    test('indicates disabled state for accessibility', () => {
      const { getByLabelText } = render(<SaveButton {...defaultProps} disabled={true} />);
      const saveButton = getByLabelText(/save for later/i);
      expect(saveButton.props.accessibilityState?.disabled).toBe(true);
    });
  });
});
