/**
 * StepGlance Tests
 *
 * SKIPPED: StepGlance is no longer rendered in production flow.
 * The 'glance' step was removed from stepsNeeded and its calendar view
 * was merged into StepPrioritize as a tab toggle (activeTab === 'calendar').
 *
 * The component still exists for backward compatibility but is dead code.
 * These tests are preserved but skipped to document the original contract.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.View = require('react-native').View;
  return Reanimated;
});

// Mock store
jest.mock('../../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: any) =>
    selector({
      timeBlockPreferences: {
        morning: { startHour: 6, endHour: 12 },
        day: { startHour: 12, endHour: 17 },
        evening: { startHour: 17, endHour: 22 },
      },
      eventTimeOverrides: {},
    }),
}));

// Mock date service
jest.mock('../../../../lib/date', () => ({
  getDateService: () => ({
    now: () => new Date('2025-12-15T09:00:00'),
    getCurrentDate: () => '2025-12-15',
    getHour: () => 9,
  }),
}));

import { StepGlance } from '../StepGlance';

describe.skip('StepGlance (dead code — glance merged into StepPrioritize)', () => {
  const defaultProps = {
    events: [],
    calendarEvents: [],
    hiddenEventIds: [],
    freeMinutes: 420,
    totalEventCount: 0,
    eventMinutes: 0,
    isReady: true,
    onEventQuickAction: jest.fn(),
    onCalendarEventAction: jest.fn(),
    onContinue: jest.fn(),
    onSkipToEnd: jest.fn(),
  };

  it('renders free time stats', () => {
    const { queryAllByText } = render(<StepGlance {...defaultProps} />);
    // Should show the formatted free time somewhere in the component
    const timeMatches = queryAllByText(/\d+h|\d+m/);
    expect(timeMatches.length).toBeGreaterThan(0);
  });

  it('renders with events showing event minutes', () => {
    const { toJSON } = render(
      <StepGlance {...defaultProps} freeMinutes={300} eventMinutes={120} totalEventCount={3} />,
    );
    expect(toJSON()).not.toBeNull();
  });

  it('calls onContinue when continue button is pressed', () => {
    const onContinue = jest.fn();
    const { getByText } = render(<StepGlance {...defaultProps} onContinue={onContinue} />);
    const continueBtn = getByText(/continue/i);
    fireEvent.press(continueBtn);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipToEnd when skip button is pressed', () => {
    const onSkipToEnd = jest.fn();
    const { getByText } = render(<StepGlance {...defaultProps} onSkipToEnd={onSkipToEnd} />);
    const skipBtn = getByText(/skip/i);
    fireEvent.press(skipBtn);
    expect(onSkipToEnd).toHaveBeenCalledTimes(1);
  });

  it('renders without calendar events', () => {
    const { toJSON } = render(<StepGlance {...defaultProps} />);
    expect(toJSON()).not.toBeNull();
  });
});
