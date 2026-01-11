/**
 * Tests for FirstTodayVisitBubble component
 *
 * This component shows a speech bubble on first visit to the Today page.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import FirstTodayVisitBubble from '../FirstTodayVisitBubble';

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.View = require('react-native').View;
  return Reanimated;
});

describe('FirstTodayVisitBubble', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('visibility', () => {
    it('renders when visible is true', () => {
      const { getByText } = render(<FirstTodayVisitBubble visible={true} onDismiss={jest.fn()} />);

      expect(getByText(/daily game plan/i)).toBeTruthy();
    });

    it('does not render when visible is false', () => {
      const { queryByText } = render(
        <FirstTodayVisitBubble visible={false} onDismiss={jest.fn()} />,
      );

      expect(queryByText(/daily game plan/i)).toBeNull();
    });
  });

  describe('dismissal', () => {
    it('calls onDismiss when bubble is pressed', () => {
      const mockDismiss = jest.fn();
      const { getByText } = render(
        <FirstTodayVisitBubble visible={true} onDismiss={mockDismiss} />,
      );

      fireEvent.press(getByText(/daily game plan/i));

      expect(mockDismiss).toHaveBeenCalledTimes(1);
    });

    it('auto-dismisses after 5 seconds', () => {
      const mockDismiss = jest.fn();
      render(<FirstTodayVisitBubble visible={true} onDismiss={mockDismiss} />);

      expect(mockDismiss).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not auto-dismiss if not visible', () => {
      const mockDismiss = jest.fn();
      render(<FirstTodayVisitBubble visible={false} onDismiss={mockDismiss} />);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockDismiss).not.toHaveBeenCalled();
    });

    it('clears timeout when unmounted', () => {
      const mockDismiss = jest.fn();
      const { unmount } = render(<FirstTodayVisitBubble visible={true} onDismiss={mockDismiss} />);

      unmount();

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockDismiss).not.toHaveBeenCalled();
    });
  });

  describe('content', () => {
    it('displays the correct message text', () => {
      const { getByText } = render(<FirstTodayVisitBubble visible={true} onDismiss={jest.fn()} />);

      expect(getByText("Your daily game plan. It'll fill up as you drop and sweep!")).toBeTruthy();
    });
  });
});
