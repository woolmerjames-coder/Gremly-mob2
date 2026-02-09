/**
 * BreakHabitCard.test.tsx
 *
 * Tests for the BreakHabitCard component.
 * Validates empty returns null, "Stay mindful:" prefix, MAX_VISIBLE=3,
 * overflow "+ N more" label, and expand/collapse toggle.
 *
 * Break Habit feature (Feb 2026)
 */

import React from 'react';
import { LayoutAnimation } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { BreakHabitCard } from '../BreakHabitCard';

// Stub LayoutAnimation.configureNext — it's undefined in jsdom
beforeEach(() => {
  LayoutAnimation.configureNext = jest.fn();
  (LayoutAnimation as any).Presets = { easeInEaseOut: {} };
});

describe('BreakHabitCard', () => {
  describe('empty state', () => {
    it('returns null when names is empty', () => {
      const { toJSON } = render(<BreakHabitCard names={[]} />);
      expect(toJSON()).toBeNull();
    });
  });

  describe('rendering with names', () => {
    it('shows "Stay mindful:" prefix', () => {
      const { getByText } = render(<BreakHabitCard names={['Smoking']} />);
      expect(getByText('Stay mindful:')).toBeTruthy();
    });

    it('shows a single habit name', () => {
      const { getByText } = render(<BreakHabitCard names={['Smoking']} />);
      expect(getByText('Smoking')).toBeTruthy();
    });

    it('shows comma-separated names for multiple habits', () => {
      const { getByText } = render(
        <BreakHabitCard names={['Smoking', 'Nail biting', 'Sugar']} />,
      );
      expect(getByText('Smoking, Nail biting, Sugar')).toBeTruthy();
    });
  });

  describe('MAX_VISIBLE overflow', () => {
    const fiveNames = ['Smoking', 'Nail biting', 'Sugar', 'Doom scrolling', 'Snacking'];

    it('shows only the first 3 names when there are more than MAX_VISIBLE', () => {
      const { getByText, queryByText } = render(<BreakHabitCard names={fiveNames} />);
      expect(getByText('Smoking, Nail biting, Sugar')).toBeTruthy();
      // The 4th and 5th names should NOT appear in collapsed state
      expect(queryByText(/Doom scrolling/)).toBeNull();
    });

    it('shows "+N more" label for overflow', () => {
      const { getByText } = render(<BreakHabitCard names={fiveNames} />);
      expect(getByText('+ 2 more')).toBeTruthy();
    });

    it('shows all names after tapping to expand', () => {
      const { getByText } = render(<BreakHabitCard names={fiveNames} />);
      // Tap to expand
      fireEvent.press(getByText('Stay mindful:').parent!.parent!);
      // All 5 names should now be visible
      expect(
        getByText('Smoking, Nail biting, Sugar, Doom scrolling, Snacking'),
      ).toBeTruthy();
    });

    it('hides "+N more" label after expanding', () => {
      const { getByText, queryByText } = render(<BreakHabitCard names={fiveNames} />);
      fireEvent.press(getByText('Stay mindful:').parent!.parent!);
      expect(queryByText('+ 2 more')).toBeNull();
    });
  });

  describe('3 or fewer names', () => {
    it('does NOT show overflow label when exactly at MAX_VISIBLE', () => {
      const { queryByText } = render(
        <BreakHabitCard names={['Smoking', 'Nail biting', 'Sugar']} />,
      );
      expect(queryByText(/more/)).toBeNull();
    });

    it('does NOT show overflow label for 2 names', () => {
      const { queryByText } = render(
        <BreakHabitCard names={['Smoking', 'Nail biting']} />,
      );
      expect(queryByText(/more/)).toBeNull();
    });
  });
});
