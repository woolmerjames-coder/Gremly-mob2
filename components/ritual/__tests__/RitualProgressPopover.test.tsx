/**
 * RitualProgressPopover.test.tsx
 *
 * Tests for the ritual progress popover component.
 * Shows drops/sweeps progress toward daily ritual completion.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RitualProgressPopover from '../RitualProgressPopover';

describe('RitualProgressPopover', () => {
  const defaultProps = {
    visible: true,
    onDismiss: jest.fn(),
    gremlyAge: 5,
    dropsCount: 0,
    sweepsCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Visibility
  // ─────────────────────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('renders when visible is true', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} />);
      expect(getByText('Age 5 with Gremly')).toBeTruthy();
    });

    it('does not render when visible is false', () => {
      const { queryByText } = render(<RitualProgressPopover {...defaultProps} visible={false} />);
      expect(queryByText('Age 5 with Gremly')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Title Display
  // ─────────────────────────────────────────────────────────────────────────

  describe('title display', () => {
    it('shows correct age in title', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} gremlyAge={42} />);
      expect(getByText('Age 42 with Gremly')).toBeTruthy();
    });

    it('shows day 1 correctly', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} gremlyAge={1} />);
      expect(getByText('Age 1 with Gremly')).toBeTruthy();
    });

    it('shows three-digit ages', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} gremlyAge={100} />);
      expect(getByText('Age 100 with Gremly')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Drops Progress
  // ─────────────────────────────────────────────────────────────────────────

  describe('drops progress', () => {
    it('shows 0/3 drops when none completed', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} dropsCount={0} />);
      expect(getByText('0/3 drops')).toBeTruthy();
    });

    it('shows 1/3 drops', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} dropsCount={1} />);
      expect(getByText('1/3 drops')).toBeTruthy();
    });

    it('shows 2/3 drops', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} dropsCount={2} />);
      expect(getByText('2/3 drops')).toBeTruthy();
    });

    it('shows 3/3 drops when complete', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} dropsCount={3} />);
      expect(getByText('3/3 drops')).toBeTruthy();
    });

    it('caps drops display at 3 even if count is higher', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} dropsCount={5} />);
      expect(getByText('3/3 drops')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Sweeps Progress
  // ─────────────────────────────────────────────────────────────────────────

  describe('sweeps progress', () => {
    it('shows 0/3 sweeps when none completed', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} sweepsCount={0} />);
      expect(getByText('0/3 sweeps')).toBeTruthy();
    });

    it('shows 1/3 sweeps', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} sweepsCount={1} />);
      expect(getByText('1/3 sweeps')).toBeTruthy();
    });

    it('shows 2/3 sweeps', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} sweepsCount={2} />);
      expect(getByText('2/3 sweeps')).toBeTruthy();
    });

    it('shows 3/3 sweeps when complete', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} sweepsCount={3} />);
      expect(getByText('3/3 sweeps')).toBeTruthy();
    });

    it('caps sweeps display at 3 even if count is higher', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} sweepsCount={10} />);
      expect(getByText('3/3 sweeps')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Section Label
  // ─────────────────────────────────────────────────────────────────────────

  describe('section label', () => {
    it('shows "Today\'s ritual" label', () => {
      const { getByText } = render(<RitualProgressPopover {...defaultProps} />);
      expect(getByText("Today's ritual")).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Completion State
  // ─────────────────────────────────────────────────────────────────────────

  describe('completion state', () => {
    it('shows encouragement when ritual incomplete (0 drops, 0 sweeps)', () => {
      const { getByText } = render(
        <RitualProgressPopover {...defaultProps} dropsCount={0} sweepsCount={0} />,
      );
      expect(getByText('Complete both to help Gremly grow!')).toBeTruthy();
    });

    it('shows encouragement when only drops complete', () => {
      const { getByText } = render(
        <RitualProgressPopover {...defaultProps} dropsCount={3} sweepsCount={1} />,
      );
      expect(getByText('Complete both to help Gremly grow!')).toBeTruthy();
    });

    it('shows encouragement when only sweeps complete', () => {
      const { getByText } = render(
        <RitualProgressPopover {...defaultProps} dropsCount={2} sweepsCount={3} />,
      );
      expect(getByText('Complete both to help Gremly grow!')).toBeTruthy();
    });

    it('shows completion message when both drops and sweeps complete', () => {
      const { getByText } = render(
        <RitualProgressPopover {...defaultProps} dropsCount={3} sweepsCount={3} />,
      );
      expect(getByText('Ritual complete! Gremly grew today.')).toBeTruthy();
    });

    it('shows completion when counts exceed 3', () => {
      const { getByText } = render(
        <RitualProgressPopover {...defaultProps} dropsCount={5} sweepsCount={4} />,
      );
      expect(getByText('Ritual complete! Gremly grew today.')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Dismiss Behavior
  // ─────────────────────────────────────────────────────────────────────────

  describe('dismiss behavior', () => {
    it('calls onDismiss when backdrop is pressed', () => {
      const onDismiss = jest.fn();
      const { UNSAFE_root } = render(
        <RitualProgressPopover {...defaultProps} onDismiss={onDismiss} />,
      );

      // Find the first Pressable (backdrop)
      const pressables = UNSAFE_root.findAllByType(require('react-native').Pressable);
      if (pressables.length > 0) {
        fireEvent.press(pressables[0]);
        expect(onDismiss).toHaveBeenCalled();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Combined Progress States
  // ─────────────────────────────────────────────────────────────────────────

  describe('combined progress states', () => {
    it('renders partial progress correctly (2 drops, 1 sweep)', () => {
      const { getByText } = render(
        <RitualProgressPopover {...defaultProps} dropsCount={2} sweepsCount={1} />,
      );
      expect(getByText('2/3 drops')).toBeTruthy();
      expect(getByText('1/3 sweeps')).toBeTruthy();
      expect(getByText('Complete both to help Gremly grow!')).toBeTruthy();
    });

    it('renders almost complete state (3 drops, 2 sweeps)', () => {
      const { getByText } = render(
        <RitualProgressPopover {...defaultProps} dropsCount={3} sweepsCount={2} />,
      );
      expect(getByText('3/3 drops')).toBeTruthy();
      expect(getByText('2/3 sweeps')).toBeTruthy();
      expect(getByText('Complete both to help Gremly grow!')).toBeTruthy();
    });
  });
});
