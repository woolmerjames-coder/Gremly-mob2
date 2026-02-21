/**
 * DaySummaryToggle Tests
 *
 * Tests the tab toggle between calendar and tasks views.
 * Two side-by-side cards — each pressable, with icon + title + subtitle.
 *
 * Covers:
 * - Both cards render
 * - Active/inactive styling behavior
 * - onTabChange callback wiring
 * - Subtitle text (event count, free time, todo/habit counts)
 * - Singular/plural handling
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.View = require('react-native').View;
  return Reanimated;
});

import { DaySummaryToggle } from '../DaySummaryToggle';

describe('DaySummaryToggle', () => {
  const defaultProps = {
    eventCount: 3,
    freeMinutes: 300,
    todoCount: 5,
    habitCount: 2,
    activeTab: 'tasks' as const,
    onTabChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders both cards — Calendar and Tasks', () => {
      const { getByText } = render(<DaySummaryToggle {...defaultProps} />);
      expect(getByText('Calendar')).toBeTruthy();
      expect(getByText('Tasks')).toBeTruthy();
    });

    it('renders calendar subtitle with event count and free time', () => {
      const { getByText } = render(<DaySummaryToggle {...defaultProps} />);
      expect(getByText('3 events · 5h free')).toBeTruthy();
    });

    it('renders tasks subtitle with todo and habit counts', () => {
      const { getByText } = render(<DaySummaryToggle {...defaultProps} />);
      expect(getByText('5 todos, 2 habits')).toBeTruthy();
    });
  });

  describe('singular/plural handling', () => {
    it('uses singular "event" for 1 event', () => {
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} eventCount={1} freeMinutes={60} />,
      );
      expect(getByText('1 event · 1h free')).toBeTruthy();
    });

    it('uses singular "todo" and "habit" for 1 each', () => {
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} todoCount={1} habitCount={1} />,
      );
      expect(getByText('1 todo, 1 habit')).toBeTruthy();
    });

    it('uses plural for zero counts', () => {
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} todoCount={0} habitCount={0} />,
      );
      expect(getByText('0 todos, 0 habits')).toBeTruthy();
    });
  });

  describe('free time formatting', () => {
    it('formats minutes only when < 60', () => {
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} freeMinutes={45} />,
      );
      expect(getByText('3 events · 45m free')).toBeTruthy();
    });

    it('formats hours only when exact hours', () => {
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} freeMinutes={120} />,
      );
      expect(getByText('3 events · 2h free')).toBeTruthy();
    });

    it('formats hours and minutes', () => {
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} freeMinutes={150} />,
      );
      expect(getByText('3 events · 2h 30m free')).toBeTruthy();
    });
  });

  describe('tab switching', () => {
    it('calls onTabChange("calendar") when calendar card is pressed', () => {
      const onTabChange = jest.fn();
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} activeTab="tasks" onTabChange={onTabChange} />,
      );
      fireEvent.press(getByText('Calendar'));
      expect(onTabChange).toHaveBeenCalledWith('calendar');
    });

    it('calls onTabChange("tasks") when tasks card is pressed', () => {
      const onTabChange = jest.fn();
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} activeTab="calendar" onTabChange={onTabChange} />,
      );
      fireEvent.press(getByText('Tasks'));
      expect(onTabChange).toHaveBeenCalledWith('tasks');
    });

    it('still calls onTabChange when pressing the already-active card', () => {
      const onTabChange = jest.fn();
      const { getByText } = render(
        <DaySummaryToggle {...defaultProps} activeTab="tasks" onTabChange={onTabChange} />,
      );
      fireEvent.press(getByText('Tasks'));
      expect(onTabChange).toHaveBeenCalledWith('tasks');
    });
  });

  describe('renders without crashing', () => {
    it('handles zero events and zero free minutes', () => {
      const { toJSON } = render(
        <DaySummaryToggle {...defaultProps} eventCount={0} freeMinutes={0} />,
      );
      expect(toJSON()).not.toBeNull();
    });

    it('handles large numbers', () => {
      const { getByText } = render(
        <DaySummaryToggle
          {...defaultProps}
          eventCount={99}
          freeMinutes={960}
          todoCount={50}
          habitCount={20}
        />,
      );
      expect(getByText('99 events · 16h free')).toBeTruthy();
      expect(getByText('50 todos, 20 habits')).toBeTruthy();
    });
  });
});
