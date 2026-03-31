/**
 * HabitSummaryCard Tests
 *
 * Tests for the habit summary card component rendered during
 * the Habit Builder flow. Covers:
 * - formatStartDate edge cases
 * - hasSubstantiveFields gating (notes/break only show when name + one field)
 * - Metadata chip rendering
 * - Collapsed vs expanded states
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return {
    ...Reanimated,
    FadeIn: { duration: () => ({ delay: () => ({}) }) },
    useSharedValue: jest.fn((v) => ({ value: v })),
    useAnimatedStyle: jest.fn((fn) => fn()),
    withTiming: jest.fn((v) => v),
    withSequence: jest.fn((...args) => args[args.length - 1]),
    Easing: { out: jest.fn((e) => e), ease: 'ease' },
  };
});

// Mock lucide icons
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = (name: string) => {
    const Component = (props: any) => <Text>{name}</Text>;
    Component.displayName = name;
    return Component;
  };
  return {
    ArrowUp: icon('ArrowUp'),
    X: icon('X'),
    Repeat: icon('Repeat'),
    Calendar: icon('Calendar'),
    Sunrise: icon('Sunrise'),
    Sun: icon('Sun'),
    Moon: icon('Moon'),
    Clock: icon('Clock'),
    Check: icon('Check'),
    ChevronDown: icon('ChevronDown'),
    ChevronUp: icon('ChevronUp'),
  };
});

// Mock design tokens
jest.mock('../../../design/tokens', () => ({
  lightTokens: {
    typography: {
      fontFamily: { regular: 'DMSans-Regular', medium: 'DMSans-Medium', bold: 'DMSans-Bold' },
    },
  },
}));

// Mock frequency utils
jest.mock('../../../lib/habits/frequencyUtils', () => ({
  getFrequencyDisplayLabel: (cadence: string | null, _: any) => {
    if (cadence === 'daily') return 'Every day';
    if (cadence === 'weekly') return 'Weekly';
    return null;
  },
}));

// Mock DateService — anchor to a fixed date
const MOCK_TODAY = '2026-03-30';
const MOCK_TOMORROW = '2026-03-31';
const MOCK_NOW = new Date('2026-03-30T12:00:00');
jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({
    today: () => MOCK_TODAY,
    tomorrow: () => MOCK_TOMORROW,
    now: () => MOCK_NOW,
  }),
}));

// Mock Text component
jest.mock('../../../ui/Text', () => {
  const { Text } = require('react-native');
  return { Text };
});

import { HabitSummaryCard } from '../HabitSummaryCard';
import type { HabitBuilderResolvedFields } from '../../../lib/types';

// ── Helpers ──────────────────────────────────────────────────────

function makeResolved(
  overrides: Partial<HabitBuilderResolvedFields> = {},
): HabitBuilderResolvedFields {
  return {
    habit_type: null,
    name: null,
    cadence: null,
    target: null,
    time_window: null,
    start_date: null,
    notes: null,
    trigger: null,
    replacement_behavior: null,
    readiness: 'exploring',
    ...overrides,
  } as HabitBuilderResolvedFields;
}

const defaultProps = {
  mode: 'SHAPING' as const,
  isCollapsed: false,
  onToggle: jest.fn(),
  keyboardActive: false,
  messageCount: 3,
};

// ── Tests ────────────────────────────────────────────────────────

describe('HabitSummaryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Collapsed state ───────────────────────────────────────────

  describe('collapsed state', () => {
    it('renders habit name in collapsed view', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ name: 'Morning run', readiness: 'shaping' })}
          isCollapsed={true}
        />,
      );
      expect(getByText(/Morning run/)).toBeTruthy();
    });

    it('shows placeholder when no name in collapsed view', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ readiness: 'shaping' })}
          isCollapsed={true}
        />,
      );
      expect(getByText('Shaping your habit...')).toBeTruthy();
    });

    it('shows frequency after name when available', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ name: 'Meditate', cadence: 'daily', readiness: 'shaping' })}
          isCollapsed={true}
        />,
      );
      expect(getByText(/Every day/)).toBeTruthy();
    });
  });

  // ── Hiding in exploring + keyboard ────────────────────────────

  describe('visibility', () => {
    it('returns null when exploring and keyboard is active', () => {
      const { toJSON } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ readiness: 'exploring' })}
          keyboardActive={true}
        />,
      );
      expect(toJSON()).toBeNull();
    });

    it('renders when exploring but keyboard is not active', () => {
      const { toJSON } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ readiness: 'exploring' })}
          keyboardActive={false}
        />,
      );
      expect(toJSON()).not.toBeNull();
    });
  });

  // ── Metadata chips ────────────────────────────────────────────

  describe('metadata chips', () => {
    it('renders Build chip for build habits', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ habit_type: 'build', name: 'Run', readiness: 'shaping' })}
        />,
      );
      expect(getByText('Build')).toBeTruthy();
      expect(getByText('ArrowUp')).toBeTruthy();
    });

    it('renders Break chip for break habits', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            habit_type: 'break',
            name: 'Stop snacking',
            readiness: 'shaping',
          })}
        />,
      );
      expect(getByText('Break')).toBeTruthy();
    });

    it('renders frequency chip', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ name: 'Run', cadence: 'daily', readiness: 'shaping' })}
        />,
      );
      expect(getByText('Every day')).toBeTruthy();
      expect(getByText('Repeat')).toBeTruthy();
    });

    it('renders morning time window chip', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            name: 'Meditate',
            time_window: 'morning',
            readiness: 'shaping',
          })}
        />,
      );
      expect(getByText('Morning')).toBeTruthy();
      expect(getByText('Sunrise')).toBeTruthy();
    });

    it('renders afternoon time window chip', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ name: 'Walk', time_window: 'afternoon', readiness: 'shaping' })}
        />,
      );
      expect(getByText('Afternoon')).toBeTruthy();
      expect(getByText('Sun')).toBeTruthy();
    });

    it('renders evening time window chip', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ name: 'Read', time_window: 'evening', readiness: 'shaping' })}
        />,
      );
      expect(getByText('Evening')).toBeTruthy();
      expect(getByText('Moon')).toBeTruthy();
    });

    it('does not render anytime time window chip', () => {
      const { queryByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ name: 'Read', time_window: 'anytime', readiness: 'shaping' })}
        />,
      );
      expect(queryByText('Anytime')).toBeNull();
    });

    it('renders start date chip for today', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            name: 'Read',
            start_date: MOCK_TODAY,
            readiness: 'confirmable',
          })}
        />,
      );
      expect(getByText('today')).toBeTruthy();
      expect(getByText('Calendar')).toBeTruthy();
    });

    it('renders start date chip for tomorrow', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            name: 'Read',
            start_date: MOCK_TOMORROW,
            readiness: 'confirmable',
          })}
        />,
      );
      expect(getByText('tomorrow')).toBeTruthy();
    });

    it('renders start date chip with day name within 7 days', () => {
      // 2026-04-03 is a Friday (3 days from mock today)
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            name: 'Read',
            start_date: '2026-04-03',
            readiness: 'confirmable',
          })}
        />,
      );
      expect(getByText('Fri')).toBeTruthy();
    });

    it('renders start date chip with month+day beyond 7 days', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            name: 'Read',
            start_date: '2026-04-15',
            readiness: 'confirmable',
          })}
        />,
      );
      expect(getByText('Apr 15')).toBeTruthy();
    });
  });

  // ── Notes / break gating ──────────────────────────────────────

  describe('hasSubstantiveFields gating', () => {
    it('shows notes when name + frequency exist', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            name: 'Run',
            cadence: 'daily',
            notes: 'I want to feel alive',
            readiness: 'shaping',
          })}
        />,
      );
      expect(getByText('I want to feel alive')).toBeTruthy();
    });

    it('hides notes when only name exists (no freq/time/date)', () => {
      const { queryByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            name: 'Run',
            notes: 'I want to feel alive',
            readiness: 'shaping',
          })}
        />,
      );
      expect(queryByText('I want to feel alive')).toBeNull();
    });

    it('hides notes when no name exists', () => {
      const { queryByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            cadence: 'daily',
            notes: 'I want to feel alive',
            readiness: 'shaping',
          })}
        />,
      );
      expect(queryByText('I want to feel alive')).toBeNull();
    });

    it('shows break line when name + frequency + trigger + replacement exist', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({
            name: 'Stop snacking',
            habit_type: 'break',
            cadence: 'daily',
            trigger: 'boredom',
            replacement_behavior: 'drink water',
            readiness: 'shaping',
          })}
        />,
      );
      expect(getByText('When boredom → drink water')).toBeTruthy();
    });
  });

  // ── Toggle ────────────────────────────────────────────────────

  describe('toggle', () => {
    it('calls onToggle when collapsed card is pressed', () => {
      const onToggle = jest.fn();
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ name: 'Run', readiness: 'shaping' })}
          isCollapsed={true}
          onToggle={onToggle}
        />,
      );
      fireEvent.press(getByText(/Run/));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  // ── Locked state ──────────────────────────────────────────────

  describe('locked state', () => {
    it('shows check icon when locked', () => {
      const { getByText } = render(
        <HabitSummaryCard
          {...defaultProps}
          resolved={makeResolved({ name: 'Run', readiness: 'locked' })}
          isCollapsed={true}
        />,
      );
      expect(getByText('Check')).toBeTruthy();
    });
  });
});
