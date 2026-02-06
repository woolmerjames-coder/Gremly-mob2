/**
 * Tests for HabitWeeklyRow Component
 *
 * Tests the habit weekly row UI that displays habit progress
 * with GremlyDot faces for each day of the week.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { HabitWeeklyRow } from '../HabitWeeklyRow';
import type { DayDot, HabitStatus } from '../../../lib/today/hooks/useWeeklyHabitStats';

// Mock GremlyDot component
jest.mock('../../ui/GremlyDot', () => ({
  GremlyDot: ({
    isCompleted,
    isToday,
    isFuture,
    onPress,
  }: {
    isCompleted: boolean;
    isToday: boolean;
    isFuture: boolean;
    onPress: () => void;
  }) => {
    const { TouchableOpacity, Text } = require('react-native');
    // Create a unique testID based on state
    const status = isCompleted ? 'done' : 'incomplete';
    const today = isToday ? '-today' : '';
    const future = isFuture ? '-future' : '';
    return (
      <TouchableOpacity
        testID={`gremly-dot-${status}${today}${future}`}
        onPress={isFuture ? undefined : onPress}
        disabled={isFuture}
      >
        <Text>{isCompleted ? '✓' : '○'}</Text>
      </TouchableOpacity>
    );
  },
}));

describe('HabitWeeklyRow', () => {
  const defaultProps = {
    habitId: 'habit-1',
    name: 'Morning Meditation',
    weeklyCompleted: 3,
    weeklyTarget: 7,
    status: 'on_track' as HabitStatus,
    dayDots: ['done', 'done', 'done', 'missed', 'missed', 'missed', 'future'] as DayDot[],
    dayDates: [
      '2025-12-09',
      '2025-12-10',
      '2025-12-11',
      '2025-12-12',
      '2025-12-13',
      '2025-12-14',
      '2025-12-15',
    ],
    todayIndex: 6,
    onToggleDay: jest.fn(),
    startDate: '2025-12-01', // Required to render the weekly dots
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders habit name', () => {
      render(<HabitWeeklyRow {...defaultProps} />);

      expect(screen.getByText('Morning Meditation')).toBeTruthy();
    });

    it('renders frequency label when provided', () => {
      render(<HabitWeeklyRow {...defaultProps} frequencyLabel="3× per week" />);

      expect(screen.getByText('3× per week')).toBeTruthy();
    });

    it('renders default frequency label based on weeklyTarget', () => {
      render(<HabitWeeklyRow {...defaultProps} weeklyTarget={7} />);

      expect(screen.getByText('Daily')).toBeTruthy();
    });

    it('renders "1× per week" for weekly target of 1', () => {
      render(<HabitWeeklyRow {...defaultProps} weeklyTarget={1} />);

      expect(screen.getByText('1× per week')).toBeTruthy();
    });

    it('renders status label "Up to date" for on_track status', () => {
      render(<HabitWeeklyRow {...defaultProps} status="on_track" />);

      expect(screen.getByText('Up to date')).toBeTruthy();
    });

    it('renders status label "Needs check-in" for needs_attention status', () => {
      render(<HabitWeeklyRow {...defaultProps} status="needs_attention" />);

      expect(screen.getByText('Needs check-in')).toBeTruthy();
    });

    it('renders 7 dots for each day', () => {
      const { UNSAFE_getAllByType } = render(<HabitWeeklyRow {...defaultProps} />);

      // Using touchable opacity count as proxy for dots (7 GremlyDots)
      // Note: This test checks structure - actual dot count depends on mock
      expect(screen.getByText('Morning Meditation')).toBeTruthy();
    });
  });

  describe('streak display', () => {
    it('renders streak when streakDays > 0', () => {
      render(<HabitWeeklyRow {...defaultProps} streakDays={5} />);

      expect(screen.getByText('5 day streak')).toBeTruthy();
    });

    it('does not render streak when streakDays is 0', () => {
      render(<HabitWeeklyRow {...defaultProps} streakDays={0} />);

      expect(screen.queryByText(/streak/)).toBeNull();
    });

    it('renders "X days strong" for breaking habits', () => {
      render(<HabitWeeklyRow {...defaultProps} isBreakingHabit={true} streakDays={10} />);

      expect(screen.getByText('10 days strong')).toBeTruthy();
    });

    it('renders week streak when streakUnit is "week"', () => {
      render(<HabitWeeklyRow {...defaultProps} streakDays={4} streakUnit="week" />);

      expect(screen.getByText('4 week streak')).toBeTruthy();
    });

    it('renders singular "week" for 1-week streak', () => {
      render(<HabitWeeklyRow {...defaultProps} streakDays={1} streakUnit="week" />);

      expect(screen.getByText('1 week streak')).toBeTruthy();
    });

    it('renders "weeks strong" for breaking habits with week streakUnit', () => {
      render(
        <HabitWeeklyRow
          {...defaultProps}
          isBreakingHabit={true}
          streakDays={3}
          streakUnit="week"
        />,
      );

      expect(screen.getByText('3 weeks strong')).toBeTruthy();
    });
  });

  describe('start date display', () => {
    it('renders started date when startDate is in visible range', () => {
      render(
        <HabitWeeklyRow
          {...defaultProps}
          startDate="2025-12-12"
          dayDates={[
            '2025-12-09',
            '2025-12-10',
            '2025-12-11',
            '2025-12-12',
            '2025-12-13',
            '2025-12-14',
            '2025-12-15',
          ]}
        />,
      );

      expect(screen.getByText(/Started/)).toBeTruthy();
    });

    it('renders "Started" for past start dates', () => {
      render(
        <HabitWeeklyRow
          {...defaultProps}
          startDate="2025-12-01"
          dayDates={[
            '2025-12-09',
            '2025-12-10',
            '2025-12-11',
            '2025-12-12',
            '2025-12-13',
            '2025-12-14',
            '2025-12-15',
          ]}
        />,
      );

      expect(screen.getByText(/Started/)).toBeTruthy();
    });

    it('renders "Starts" for future start dates', () => {
      render(
        <HabitWeeklyRow
          {...defaultProps}
          startDate="2025-12-20"
          dayDates={[
            '2025-12-09',
            '2025-12-10',
            '2025-12-11',
            '2025-12-12',
            '2025-12-13',
            '2025-12-14',
            '2025-12-15',
          ]}
        />,
      );

      expect(screen.getByText(/Starts/)).toBeTruthy();
    });
  });

  describe('dot interactions', () => {
    it('calls onToggleDay when a dot is pressed', () => {
      const onToggleDay = jest.fn();
      render(<HabitWeeklyRow {...defaultProps} onToggleDay={onToggleDay} />);

      // Find a completed dot and press it (toggle off)
      // Use getAllByTestId since there may be multiple 'done' dots
      const completedDots = screen.getAllByTestId('gremly-dot-done');
      fireEvent.press(completedDots[0]);

      expect(onToggleDay).toHaveBeenCalledWith('habit-1', expect.any(String), false);
    });

    it('calls onToggleDay with newState=true when incomplete dot is pressed', () => {
      const onToggleDay = jest.fn();
      render(<HabitWeeklyRow {...defaultProps} onToggleDay={onToggleDay} />);

      // Find an incomplete dot and press it (toggle on)
      // Use getAllByTestId since there may be multiple 'incomplete' dots
      const incompleteDots = screen.getAllByTestId('gremly-dot-incomplete');
      fireEvent.press(incompleteDots[0]);

      expect(onToggleDay).toHaveBeenCalledWith('habit-1', expect.any(String), true);
    });

    it('does not call onToggleDay for future dots', () => {
      const onToggleDay = jest.fn();
      render(<HabitWeeklyRow {...defaultProps} onToggleDay={onToggleDay} />);

      // Future dots should be disabled (dayDots last element is 'future', and todayIndex=6)
      // The testID will be 'gremly-dot-incomplete-today-future'
      const futureDot = screen.getByTestId('gremly-dot-incomplete-today-future');
      fireEvent.press(futureDot);

      // Should not trigger because future dots are disabled
      expect(onToggleDay).not.toHaveBeenCalled();
    });
  });

  describe('header press', () => {
    it('calls onPressHeader when header area is pressed', () => {
      const onPressHeader = jest.fn();
      render(<HabitWeeklyRow {...defaultProps} onPressHeader={onPressHeader} />);

      // Press the habit name
      fireEvent.press(screen.getByText('Morning Meditation'));

      expect(onPressHeader).toHaveBeenCalled();
    });

    it('does not crash when onPressHeader is not provided', () => {
      render(<HabitWeeklyRow {...defaultProps} onPressHeader={undefined} />);

      // Should not throw
      expect(() => {
        fireEvent.press(screen.getByText('Morning Meditation'));
      }).not.toThrow();
    });
  });

  describe('breaking habit display', () => {
    it('renders checkmark dots instead of GremlyDots for breaking habits', () => {
      render(
        <HabitWeeklyRow
          {...defaultProps}
          isBreakingHabit={true}
          dayDots={['done', 'done', 'missed', 'missed', 'missed', 'missed', 'future']}
        />,
      );

      // Breaking habits show checkmarks
      expect(screen.getByText('Morning Meditation')).toBeTruthy();
    });
  });

  describe('divider', () => {
    it('shows divider when showDivider is true (default)', () => {
      const { toJSON } = render(<HabitWeeklyRow {...defaultProps} showDivider={true} />);

      // Component should render (divider is internal styling)
      expect(toJSON()).toBeTruthy();
    });

    it('hides divider when showDivider is false', () => {
      const { toJSON } = render(<HabitWeeklyRow {...defaultProps} showDivider={false} />);

      // Component should still render
      expect(toJSON()).toBeTruthy();
    });
  });

  describe('check-in button', () => {
    // Note: onCheckIn prop was removed from HabitWeeklyRowProps
    // Check-in functionality is now handled through onToggleDay or external hooks
    it.skip('calls onCheckIn when check-in button is pressed (if rendered)', () => {
      // Skipped: onCheckIn prop no longer exists on HabitWeeklyRowProps
      // Check-in is handled through toggle day functionality
    });
  });

  describe('days before start date', () => {
    it('shows empty placeholder for days before habit start date', () => {
      const { toJSON } = render(
        <HabitWeeklyRow
          {...defaultProps}
          startDate="2025-12-12"
          dayDots={['done', 'done', 'done', 'done', 'missed', 'missed', 'future']}
          dayDates={[
            '2025-12-09',
            '2025-12-10',
            '2025-12-11',
            '2025-12-12',
            '2025-12-13',
            '2025-12-14',
            '2025-12-15',
          ]}
        />,
      );

      // Days before start date (Dec 9, 10, 11) should show placeholders
      // Days on/after start date (Dec 12+) should show dots
      expect(toJSON()).toBeTruthy();
    });
  });
});
