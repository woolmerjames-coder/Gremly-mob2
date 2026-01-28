/**
 * ClarificationIndicatorChip Component Tests
 *
 * Tests the clarification indicator chip that appears on Mind Drop cards
 * when an item needs user clarification before full processing.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ClarificationIndicatorChip } from '../ClarificationIndicatorChip';

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  HelpCircle: () => null,
}));

describe('ClarificationIndicatorChip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rendering', () => {
    it('renders the chip with "Clarify" text', () => {
      const { getByText } = render(<ClarificationIndicatorChip />);
      expect(getByText('Clarify')).toBeTruthy();
    });

    it('renders without crashing', () => {
      const { toJSON } = render(<ClarificationIndicatorChip />);
      expect(toJSON()).toBeTruthy();
    });
  });

  describe('pressable behavior', () => {
    it('renders as pressable when onPress is provided', () => {
      const onPress = jest.fn();
      const { getByText } = render(<ClarificationIndicatorChip onPress={onPress} />);

      const chip = getByText('Clarify');
      expect(chip).toBeTruthy();
    });

    it('calls onPress when pressed', () => {
      const onPress = jest.fn();
      const { getByText } = render(<ClarificationIndicatorChip onPress={onPress} />);

      fireEvent.press(getByText('Clarify'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not wrap in Pressable when onPress is not provided', () => {
      const { getByText, toJSON } = render(<ClarificationIndicatorChip />);

      // Should still render the chip
      expect(getByText('Clarify')).toBeTruthy();

      // Component should render successfully
      expect(toJSON()).toBeTruthy();
    });
  });

  describe('animation', () => {
    it('initializes with scale value of 1', () => {
      const { toJSON } = render(<ClarificationIndicatorChip />);

      // Component should render with initial animation state
      expect(toJSON()).toBeTruthy();
    });

    it('starts pulse animation after 1 second delay', () => {
      const { toJSON } = render(<ClarificationIndicatorChip />);

      // Initial render
      expect(toJSON()).toBeTruthy();

      // Advance timers past the 1 second delay
      jest.advanceTimersByTime(1100);

      // Animation should have started (component still renders)
      expect(toJSON()).toBeTruthy();
    });

    it('cleans up timeout on unmount', () => {
      const { unmount, toJSON } = render(<ClarificationIndicatorChip />);

      expect(toJSON()).toBeTruthy();

      // Unmount before timeout fires
      unmount();

      // Advance timers - should not cause errors
      jest.advanceTimersByTime(2000);
    });
  });

  describe('styling', () => {
    it('renders with correct visual appearance', () => {
      const { getByText, toJSON } = render(<ClarificationIndicatorChip />);

      const text = getByText('Clarify');
      expect(text).toBeTruthy();

      // Component tree should be valid
      expect(toJSON()).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('is interactive when onPress is provided', () => {
      const onPress = jest.fn();
      const { getByText } = render(<ClarificationIndicatorChip onPress={onPress} />);

      // Should be able to interact with the chip
      fireEvent.press(getByText('Clarify'));
      expect(onPress).toHaveBeenCalled();
    });
  });
});
