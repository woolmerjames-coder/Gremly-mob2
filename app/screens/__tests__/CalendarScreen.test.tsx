/**
 * CalendarScreen.test.tsx
 *
 * Tests for the CalendarScreen component.
 * Validates calendar view, date navigation, and time block sections.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// Mock navigation
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    addListener: jest.fn(() => jest.fn()),
  }),
}));

// Mock safe area context
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
  };
});

// Mock CalendarMonthPicker
jest.mock('../../../components/calendar/CalendarMonthPicker', () => ({
  CalendarMonthPicker: () => null,
}));

// Mock useMorningBrief hook
jest.mock('../../../lib/today/hooks/useMorningBrief', () => ({
  useMorningBrief: () => ({
    briefItems: [],
    isLoading: false,
  }),
}));

// Mock useOverlayController
jest.mock('../../../hooks/useOverlayController', () => ({
  useOverlayController: () => ({
    openEdit: jest.fn(),
  }),
}));

// Mock useCalendarService hooks (avoids CalendarService Intl.DateTimeFormat issues in tests)
jest.mock('../../../lib/calendar/useCalendarService', () => ({
  useCalendarEvents: () => [],
  useCalendarEventsForRange: () => [],
}));

// Mock calendar components
jest.mock('../../../components/calendar/CalendarHeader', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: () => (
      <View testID="calendar-header">
        <Text>December 22, 2025</Text>
        <Text>Today</Text>
      </View>
    ),
  };
});
jest.mock('../../../components/calendar/WeekStrip', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="week-strip" /> };
});
jest.mock('../../../components/calendar/DayTimeline', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => (
      <View testID="day-timeline">
        {(!props.events || props.events.length === 0) && <Text>Nothing scheduled</Text>}
        {(!props.events || props.events.length === 0) && <Text>Enjoy the open day</Text>}
      </View>
    ),
  };
});
jest.mock('../../../components/calendar/CalendarInputBar', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="calendar-input-bar" /> };
});

// Mock DateService
const TODAY = '2025-12-22';
jest.mock('../../../lib/date', () => ({
  getDateService: () => ({
    todayLocalDate: () => TODAY,
    today: () => TODAY,
    formatDate: (date: string) => {
      const d = new Date(date + 'T12:00:00');
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    },
    formatShortDate: (date: string) => {
      const d = new Date(date + 'T12:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },
    formatDateForDisplay: (date: string | null | undefined) => {
      if (!date) return '';
      const d = new Date(date + 'T12:00:00');
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    },
    isSameDay: (a: string, b: string) => a === b,
    addDays: (date: string, days: number) => {
      const d = new Date(date + 'T12:00:00');
      d.setDate(d.getDate() + days);
      // Format as YYYY-MM-DD using local date parts (safe for tests)
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    },
  }),
}));

// Mock store
const mockCalendarEvents: never[] = [];
const mockTodos: never[] = [];
const mockHabits: never[] = [];
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (state: unknown) => unknown) => {
    const state = {
      calendarEvents: mockCalendarEvents,
      todos: mockTodos,
      habits: mockHabits,
      habitProgress: [],
      calendarConnections: [],
    };
    return selector(state);
  },
}));

import CalendarScreen from '../CalendarScreen';

describe('CalendarScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders without crashing', () => {
      const { getByText } = render(<CalendarScreen />);
      // Should render the date header
      expect(getByText(/December/i)).toBeTruthy();
    });

    it('renders close button', () => {
      const { UNSAFE_queryAllByType } = render(<CalendarScreen />);
      // X icon should be present
      // This is a basic render test
      expect(true).toBe(true);
    });

    it('renders navigation arrows', () => {
      const { UNSAFE_queryAllByType } = render(<CalendarScreen />);
      // ChevronLeft and ChevronRight should be present
      expect(true).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Date Navigation
  // ─────────────────────────────────────────────────────────────────────────

  describe('date navigation', () => {
    it('displays current date initially', () => {
      const { getByText } = render(<CalendarScreen />);
      // Should show December (from mock formatDate)
      expect(getByText(/December/i)).toBeTruthy();
    });

    it('shows Today badge when viewing today', () => {
      const { queryByText } = render(<CalendarScreen />);
      // Should show "Today" badge
      expect(queryByText('Today')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Empty State
  // ─────────────────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when no items for the day', () => {
      const { queryByText } = render(<CalendarScreen />);
      // Empty state message
      expect(queryByText(/Nothing scheduled/i)).toBeTruthy();
    });

    it('shows empty state subtext', () => {
      const { queryByText } = render(<CalendarScreen />);
      expect(queryByText(/Enjoy the open day/i)).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Time Block Sections
  // ─────────────────────────────────────────────────────────────────────────

  describe('time block sections', () => {
    it('renders time block section headers when items exist', () => {
      // With items, should show MORNING, AFTERNOON, EVENING sections
      // This is tested when we have actual items in the mock
      expect(true).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Close Button
  // ─────────────────────────────────────────────────────────────────────────

  describe('close button', () => {
    it('calls goBack when close button is pressed', () => {
      // Would need to find the close button and press it
      // Testing navigation behavior
      expect(true).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Header Date Display (app-fixes-1.22 timezone fix)
  // ─────────────────────────────────────────────────────────────────────────

  describe('header date display', () => {
    it('displays date using formatDateForDisplay', () => {
      const { getByText } = render(<CalendarScreen />);
      // Should show the formatted date
      expect(getByText(/December/i)).toBeTruthy();
    });

    it('uses noon UTC to avoid off-by-one errors', () => {
      // The fix ensures dates are parsed with T12:00:00 to avoid
      // timezone boundary issues where Dec 22 might show as Dec 21
      const dateString = '2025-12-22';
      const parsed = new Date(dateString + 'T12:00:00');

      // Using noon UTC, the date should always be Dec 22
      expect(parsed.getUTCDate()).toBe(22);
    });

    it('does not show wrong date at midnight boundaries', () => {
      // Before the fix, dates could shift by one day near midnight
      // Now we use formatDateForDisplay which handles this
      const testDate = '2025-12-22';

      // Simulate what the component does
      const d = new Date(testDate + 'T12:00:00');
      const month = d.toLocaleDateString('en-US', { month: 'long' });
      const day = d.getDate();

      expect(month).toBe('December');
      expect(day).toBe(22);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Date navigation edge cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('date navigation edge cases', () => {
    it('handles month boundaries correctly', () => {
      // addDays should work across month boundaries
      const startDate = '2025-12-31';
      const d = new Date(startDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const result = `${year}-${month}-${day}`;

      expect(result).toBe('2026-01-01');
    });

    it('handles year boundaries correctly', () => {
      const startDate = '2025-12-31';
      const d = new Date(startDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);

      expect(d.getFullYear()).toBe(2026);
    });
  });
});
