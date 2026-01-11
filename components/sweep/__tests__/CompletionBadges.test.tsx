/**
 * CompletionBadges.test.tsx
 *
 * Tests for the sweep summary completion badges component.
 * Shows lock-in, habits, and journal completion status.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { CompletionBadges } from '../CompletionBadges';

describe('CompletionBadges', () => {
  const defaultProps = {
    lockInCompleted: 0,
    lockInTotal: 0,
    habitsChecked: 0,
    journalWritten: false,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Null rendering
  // ─────────────────────────────────────────────────────────────────────────

  describe('null rendering', () => {
    it('returns null when no badges apply', () => {
      const { toJSON } = render(<CompletionBadges {...defaultProps} />);
      expect(toJSON()).toBeNull();
    });

    it('returns null when lockInTotal is 0 and no habits or journal', () => {
      const { toJSON } = render(
        <CompletionBadges
          lockInCompleted={0}
          lockInTotal={0}
          habitsChecked={0}
          journalWritten={false}
        />,
      );
      expect(toJSON()).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Lock-in Badge
  // ─────────────────────────────────────────────────────────────────────────

  describe('lock-in badge', () => {
    it('shows lock-in badge when lockInTotal > 0', () => {
      const { getByText } = render(
        <CompletionBadges {...defaultProps} lockInCompleted={2} lockInTotal={3} />,
      );
      expect(getByText('Lock-in')).toBeTruthy();
      expect(getByText('2/3')).toBeTruthy();
    });

    it('shows 0/X format when none completed', () => {
      const { getByText } = render(
        <CompletionBadges {...defaultProps} lockInCompleted={0} lockInTotal={2} />,
      );
      expect(getByText('Lock-in')).toBeTruthy();
      expect(getByText('0/2')).toBeTruthy();
    });

    it('shows X/X format when all completed', () => {
      const { getByText } = render(
        <CompletionBadges {...defaultProps} lockInCompleted={5} lockInTotal={5} />,
      );
      expect(getByText('Lock-in')).toBeTruthy();
      expect(getByText('5/5')).toBeTruthy();
    });

    it('does not show lock-in badge when lockInTotal is 0', () => {
      const { queryByText } = render(
        <CompletionBadges {...defaultProps} lockInTotal={0} habitsChecked={1} />,
      );
      expect(queryByText('Lock-in')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Habits Badge
  // ─────────────────────────────────────────────────────────────────────────

  describe('habits badge', () => {
    it('shows habits badge when habitsChecked > 0', () => {
      const { getByText } = render(<CompletionBadges {...defaultProps} habitsChecked={3} />);
      expect(getByText('Habits')).toBeTruthy();
      expect(getByText('3')).toBeTruthy();
    });

    it('shows count of 1', () => {
      const { getByText } = render(<CompletionBadges {...defaultProps} habitsChecked={1} />);
      expect(getByText('Habits')).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
    });

    it('shows high counts', () => {
      const { getByText } = render(<CompletionBadges {...defaultProps} habitsChecked={10} />);
      expect(getByText('Habits')).toBeTruthy();
      expect(getByText('10')).toBeTruthy();
    });

    it('does not show habits badge when habitsChecked is 0', () => {
      const { queryByText } = render(
        <CompletionBadges {...defaultProps} habitsChecked={0} journalWritten={true} />,
      );
      expect(queryByText('Habits')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Journal Badge
  // ─────────────────────────────────────────────────────────────────────────

  describe('journal badge', () => {
    it('shows journal badge when journalWritten is true', () => {
      const { getByText } = render(<CompletionBadges {...defaultProps} journalWritten={true} />);
      expect(getByText('Journal')).toBeTruthy();
      expect(getByText('✓')).toBeTruthy();
    });

    it('does not show journal badge when journalWritten is false', () => {
      const { queryByText } = render(
        <CompletionBadges {...defaultProps} journalWritten={false} habitsChecked={1} />,
      );
      expect(queryByText('Journal')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Multiple Badges
  // ─────────────────────────────────────────────────────────────────────────

  describe('multiple badges', () => {
    it('shows all three badges when all apply', () => {
      const { getByText } = render(
        <CompletionBadges
          lockInCompleted={2}
          lockInTotal={3}
          habitsChecked={5}
          journalWritten={true}
        />,
      );
      expect(getByText('Lock-in')).toBeTruthy();
      expect(getByText('2/3')).toBeTruthy();
      expect(getByText('Habits')).toBeTruthy();
      expect(getByText('5')).toBeTruthy();
      expect(getByText('Journal')).toBeTruthy();
      expect(getByText('✓')).toBeTruthy();
    });

    it('shows lock-in and habits badges only', () => {
      const { getByText, queryByText } = render(
        <CompletionBadges
          lockInCompleted={1}
          lockInTotal={2}
          habitsChecked={3}
          journalWritten={false}
        />,
      );
      expect(getByText('Lock-in')).toBeTruthy();
      expect(getByText('Habits')).toBeTruthy();
      expect(queryByText('Journal')).toBeNull();
    });

    it('shows habits and journal badges only', () => {
      const { getByText, queryByText } = render(
        <CompletionBadges
          lockInCompleted={0}
          lockInTotal={0}
          habitsChecked={2}
          journalWritten={true}
        />,
      );
      expect(queryByText('Lock-in')).toBeNull();
      expect(getByText('Habits')).toBeTruthy();
      expect(getByText('Journal')).toBeTruthy();
    });

    it('shows only journal badge', () => {
      const { getByText, queryByText } = render(
        <CompletionBadges
          lockInCompleted={0}
          lockInTotal={0}
          habitsChecked={0}
          journalWritten={true}
        />,
      );
      expect(queryByText('Lock-in')).toBeNull();
      expect(queryByText('Habits')).toBeNull();
      expect(getByText('Journal')).toBeTruthy();
    });

    it('shows only habits badge', () => {
      const { getByText, queryByText } = render(
        <CompletionBadges
          lockInCompleted={0}
          lockInTotal={0}
          habitsChecked={4}
          journalWritten={false}
        />,
      );
      expect(queryByText('Lock-in')).toBeNull();
      expect(getByText('Habits')).toBeTruthy();
      expect(queryByText('Journal')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles lockInCompleted > lockInTotal gracefully', () => {
      // This shouldn't happen in practice, but ensure it doesn't crash
      const { getByText } = render(
        <CompletionBadges {...defaultProps} lockInCompleted={5} lockInTotal={3} />,
      );
      expect(getByText('5/3')).toBeTruthy();
    });

    it('handles very high habit counts', () => {
      const { getByText } = render(<CompletionBadges {...defaultProps} habitsChecked={99} />);
      expect(getByText('99')).toBeTruthy();
    });
  });
});
