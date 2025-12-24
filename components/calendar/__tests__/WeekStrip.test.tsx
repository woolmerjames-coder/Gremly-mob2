/**
 * Tests for components/calendar/WeekStrip.tsx
 * Tests horizontal date navigation component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WeekStrip from '../WeekStrip';
import { resetDateService, createDateService } from '../../../lib/date';
import { useDatesWithItems } from '../../../lib/store/calendarSelectors';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const TODAY = '2025-12-24'; // Tuesday (current date for stable tests)

jest.mock('../../../lib/store/calendarSelectors', () => ({
  useDatesWithItems: jest.fn(),
}));
const mockUseDatesWithItems = useDatesWithItems as jest.MockedFunction<typeof useDatesWithItems>;

beforeEach(() => {
  resetDateService();
  createDateService({
    clock: () => new Date(`${TODAY}T10:00:00`),
  });
  mockUseDatesWithItems.mockReturnValue(new Set());
  jest.clearAllMocks();
});

afterEach(() => {
  resetDateService();
});

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('WeekStrip', () => {
  describe('rendering', () => {
    it('renders 7 days centered on selected date', () => {
      const { getByText } = render(<WeekStrip selectedDate={TODAY} onSelectDate={jest.fn()} />);

      // Dec 24, 2025 is Tuesday
      // 3 days before: Dec 21 (Sun), Dec 22 (Mon), Dec 23 (Tue)
      // Selected: Dec 24 (Wed)
      // 3 days after: Dec 25 (Thu), Dec 26 (Fri), Dec 27 (Sat)
      expect(getByText('Sun')).toBeTruthy();
      expect(getByText('Mon')).toBeTruthy();
      expect(getByText('Tue')).toBeTruthy();
      expect(getByText('Wed')).toBeTruthy();
      expect(getByText('Thu')).toBeTruthy();
      expect(getByText('Fri')).toBeTruthy();
      expect(getByText('Sat')).toBeTruthy();
    });

    it('shows day numbers correctly', () => {
      const { getByText } = render(<WeekStrip selectedDate={TODAY} onSelectDate={jest.fn()} />);

      // Dec 21-27
      expect(getByText('21')).toBeTruthy();
      expect(getByText('22')).toBeTruthy();
      expect(getByText('23')).toBeTruthy();
      expect(getByText('24')).toBeTruthy();
      expect(getByText('25')).toBeTruthy();
      expect(getByText('26')).toBeTruthy();
      expect(getByText('27')).toBeTruthy();
    });

    it('renders Today button', () => {
      const { getByText } = render(<WeekStrip selectedDate={TODAY} onSelectDate={jest.fn()} />);

      expect(getByText('Today')).toBeTruthy();
    });

    it('renders navigation chevrons', () => {
      const { UNSAFE_getAllByType } = render(
        <WeekStrip selectedDate={TODAY} onSelectDate={jest.fn()} />,
      );

      // ChevronLeft and ChevronRight are lucide-react-native icons
      // We can verify there are touchable navigation buttons
      const touchables = UNSAFE_getAllByType(require('react-native').TouchableOpacity);
      // Should have: prev week, today, next week, and 7 day pills = 10 touchables
      expect(touchables.length).toBe(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // NAVIGATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('navigation', () => {
    it('calls onSelectDate with selected day when day is pressed', () => {
      const onSelectDate = jest.fn();
      const { getByText } = render(<WeekStrip selectedDate={TODAY} onSelectDate={onSelectDate} />);

      // Press Dec 23 (Tue)
      fireEvent.press(getByText('23'));

      expect(onSelectDate).toHaveBeenCalledWith('2025-12-23');
    });

    it('calls onSelectDate with today when Today button is pressed', () => {
      const onSelectDate = jest.fn();
      // Start on a different date
      const { getByText } = render(
        <WeekStrip selectedDate="2025-12-25" onSelectDate={onSelectDate} />,
      );

      fireEvent.press(getByText('Today'));

      expect(onSelectDate).toHaveBeenCalledWith(TODAY);
    });

    it('navigates back one week when left chevron is pressed', () => {
      const onSelectDate = jest.fn();
      const { UNSAFE_getAllByType } = render(
        <WeekStrip selectedDate={TODAY} onSelectDate={onSelectDate} />,
      );

      // First touchable is the left chevron
      const touchables = UNSAFE_getAllByType(require('react-native').TouchableOpacity);
      fireEvent.press(touchables[0]);

      // Dec 24 - 7 = Dec 17
      expect(onSelectDate).toHaveBeenCalledWith('2025-12-17');
    });

    it('navigates forward one week when right chevron is pressed', () => {
      const onSelectDate = jest.fn();
      const { UNSAFE_getAllByType } = render(
        <WeekStrip selectedDate={TODAY} onSelectDate={onSelectDate} />,
      );

      // Third touchable (after left chevron and today button) is right chevron
      const touchables = UNSAFE_getAllByType(require('react-native').TouchableOpacity);
      fireEvent.press(touchables[2]);

      // Dec 24 + 7 = Dec 31
      expect(onSelectDate).toHaveBeenCalledWith('2025-12-31');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DOT INDICATOR TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('dot indicators', () => {
    it('shows dots for dates that have items', () => {
      mockUseDatesWithItems.mockReturnValue(new Set(['2025-12-22', '2025-12-24']));

      const { UNSAFE_getAllByType } = render(
        <WeekStrip selectedDate={TODAY} onSelectDate={jest.fn()} />,
      );

      // Check that dots are rendered (this is a View with specific style)
      const views = UNSAFE_getAllByType(require('react-native').View);
      // Count views with dot style (width: 4, height: 4)
      const dots = views.filter((v: any) => {
        const style = v.props.style;
        if (Array.isArray(style)) {
          return style.some((s: any) => s && s.width === 4 && s.height === 4);
        }
        return style && style.width === 4 && style.height === 4;
      });

      // Should have 2 dots (for Dec 22 and Dec 24)
      expect(dots.length).toBe(2);
    });

    it('does not show dots for dates without items', () => {
      mockUseDatesWithItems.mockReturnValue(new Set()); // No dates with items

      const { UNSAFE_getAllByType } = render(
        <WeekStrip selectedDate={TODAY} onSelectDate={jest.fn()} />,
      );

      const views = UNSAFE_getAllByType(require('react-native').View);
      const dots = views.filter((v: any) => {
        const style = v.props.style;
        if (Array.isArray(style)) {
          return style.some((s: any) => s && s.width === 4 && s.height === 4);
        }
        return style && style.width === 4 && style.height === 4;
      });

      expect(dots.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DATE RANGE QUERY TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('date range queries', () => {
    it('queries useDatesWithItems with correct date range', () => {
      render(<WeekStrip selectedDate={TODAY} onSelectDate={jest.fn()} />);

      // Should query for 3 days before to 3 days after (Dec 24 center → Dec 21 to Dec 27)
      expect(mockUseDatesWithItems).toHaveBeenCalledWith('2025-12-21', '2025-12-27');
    });

    it('updates date range when selected date changes', () => {
      const { rerender } = render(<WeekStrip selectedDate={TODAY} onSelectDate={jest.fn()} />);

      mockUseDatesWithItems.mockClear();

      // Change selected date to Dec 25
      rerender(<WeekStrip selectedDate="2025-12-25" onSelectDate={jest.fn()} />);

      // Should query for Dec 22-28
      expect(mockUseDatesWithItems).toHaveBeenCalledWith('2025-12-22', '2025-12-28');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // MONTH BOUNDARY TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('month boundaries', () => {
    it('handles crossing month boundary correctly', () => {
      // Dec 31 - should show Dec 28-Jan 3
      const { getByText } = render(
        <WeekStrip selectedDate="2025-12-31" onSelectDate={jest.fn()} />,
      );

      expect(getByText('28')).toBeTruthy(); // Dec 28
      expect(getByText('31')).toBeTruthy(); // Dec 31
      expect(getByText('1')).toBeTruthy(); // Jan 1
      expect(getByText('3')).toBeTruthy(); // Jan 3
    });

    it('handles year boundary correctly', () => {
      // Jan 1, 2026 - should show Dec 29-Jan 4
      resetDateService();
      createDateService({
        clock: () => new Date('2026-01-01T10:00:00'),
      });

      const { getByText } = render(
        <WeekStrip selectedDate="2026-01-01" onSelectDate={jest.fn()} />,
      );

      expect(getByText('29')).toBeTruthy(); // Dec 29
      expect(getByText('30')).toBeTruthy(); // Dec 30
      expect(getByText('1')).toBeTruthy(); // Jan 1
      expect(getByText('4')).toBeTruthy(); // Jan 4
    });
  });
});
