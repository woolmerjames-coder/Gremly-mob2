/**
 * Tests for components/calendar/WeekStrip.tsx
 * Tests horizontal week navigation component (Monday–Sunday)
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WeekStrip from '../WeekStrip';
import { resetDateService, createDateService } from '../../../lib/date';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const TODAY = '2025-12-24'; // Wednesday

beforeEach(() => {
  resetDateService();
  createDateService({
    clock: () => new Date(`${TODAY}T10:00:00`),
  });
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
    it('renders 7 day letters M–S for Monday-based week', () => {
      const { getAllByText, getByText } = render(
        <WeekStrip selectedDate={TODAY} onDateSelect={jest.fn()} />,
      );

      // M, T, W, T, F appear; M and T each appear twice
      expect(getAllByText('M').length).toBe(1);
      expect(getAllByText('T').length).toBe(2); // Tue + Thu
      expect(getByText('W')).toBeTruthy();
      expect(getByText('F')).toBeTruthy();
      expect(getAllByText('S').length).toBe(2); // Sat + Sun
    });

    it('shows day numbers for the Monday–Sunday week containing selected date', () => {
      const { getByText } = render(<WeekStrip selectedDate={TODAY} onDateSelect={jest.fn()} />);

      // Dec 24, 2025 is Wednesday → Monday = Dec 22
      // Week: Dec 22, 23, 24, 25, 26, 27, 28
      expect(getByText('22')).toBeTruthy();
      expect(getByText('23')).toBeTruthy();
      expect(getByText('24')).toBeTruthy();
      expect(getByText('25')).toBeTruthy();
      expect(getByText('26')).toBeTruthy();
      expect(getByText('27')).toBeTruthy();
      expect(getByText('28')).toBeTruthy();
    });

    it('shows month and year above the strip', () => {
      const { getByText } = render(<WeekStrip selectedDate={TODAY} onDateSelect={jest.fn()} />);

      expect(getByText('December 2025')).toBeTruthy();
    });

    it('renders navigation chevrons', () => {
      const { UNSAFE_getAllByType } = render(
        <WeekStrip selectedDate={TODAY} onDateSelect={jest.fn()} />,
      );

      const touchables = UNSAFE_getAllByType(require('react-native').TouchableOpacity);
      // 2 arrows + 7 day cells = 9 touchables
      expect(touchables.length).toBe(9);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // NAVIGATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('navigation', () => {
    it('calls onDateSelect with tapped day', () => {
      const onDateSelect = jest.fn();
      const { getByText } = render(<WeekStrip selectedDate={TODAY} onDateSelect={onDateSelect} />);

      // Press Dec 23 (Tue)
      fireEvent.press(getByText('23'));

      expect(onDateSelect).toHaveBeenCalledWith('2025-12-23');
    });

    it('navigates back one week when left chevron is pressed', () => {
      const onDateSelect = jest.fn();
      const { UNSAFE_getAllByType } = render(
        <WeekStrip selectedDate={TODAY} onDateSelect={onDateSelect} />,
      );

      // First touchable is the left arrow
      const touchables = UNSAFE_getAllByType(require('react-native').TouchableOpacity);
      fireEvent.press(touchables[0]);

      // Dec 24 - 7 = Dec 17
      expect(onDateSelect).toHaveBeenCalledWith('2025-12-17');
    });

    it('navigates forward one week when right chevron is pressed', () => {
      const onDateSelect = jest.fn();
      const { UNSAFE_getAllByType } = render(
        <WeekStrip selectedDate={TODAY} onDateSelect={onDateSelect} />,
      );

      // Last touchable is the right arrow (index 8)
      const touchables = UNSAFE_getAllByType(require('react-native').TouchableOpacity);
      fireEvent.press(touchables[touchables.length - 1]);

      // Dec 24 + 7 = Dec 31
      expect(onDateSelect).toHaveBeenCalledWith('2025-12-31');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // WEEK ALIGNMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('week alignment', () => {
    it('starts week on Monday when selected date is Sunday', () => {
      // Dec 28, 2025 is Sunday → Monday = Dec 22
      const { getByText } = render(
        <WeekStrip selectedDate="2025-12-28" onDateSelect={jest.fn()} />,
      );

      expect(getByText('22')).toBeTruthy(); // Monday
      expect(getByText('28')).toBeTruthy(); // Sunday
    });

    it('starts week on Monday when selected date is Monday', () => {
      // Dec 22, 2025 is Monday → Monday = Dec 22
      const { getByText } = render(
        <WeekStrip selectedDate="2025-12-22" onDateSelect={jest.fn()} />,
      );

      expect(getByText('22')).toBeTruthy(); // Monday
      expect(getByText('28')).toBeTruthy(); // Sunday
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // MONTH BOUNDARY TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('month boundaries', () => {
    it('handles crossing month boundary correctly', () => {
      // Dec 31, 2025 is Wednesday → Monday = Dec 29
      // Week: Dec 29, 30, 31, Jan 1, 2, 3, 4
      const { getByText } = render(
        <WeekStrip selectedDate="2025-12-31" onDateSelect={jest.fn()} />,
      );

      expect(getByText('29')).toBeTruthy(); // Dec 29 (Mon)
      expect(getByText('31')).toBeTruthy(); // Dec 31 (Wed)
      expect(getByText('1')).toBeTruthy(); // Jan 1 (Thu)
      expect(getByText('4')).toBeTruthy(); // Jan 4 (Sun)
    });

    it('handles year boundary correctly', () => {
      resetDateService();
      createDateService({
        clock: () => new Date('2026-01-01T10:00:00'),
      });

      // Jan 1, 2026 is Thursday → Monday = Dec 29, 2025
      const { getByText } = render(
        <WeekStrip selectedDate="2026-01-01" onDateSelect={jest.fn()} />,
      );

      expect(getByText('29')).toBeTruthy(); // Dec 29
      expect(getByText('1')).toBeTruthy(); // Jan 1
      expect(getByText('4')).toBeTruthy(); // Jan 4
      expect(getByText('January 2026')).toBeTruthy();
    });
  });
});
