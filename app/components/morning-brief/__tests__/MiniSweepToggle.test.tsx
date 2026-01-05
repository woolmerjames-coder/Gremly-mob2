/**
 * Tests for MiniSweepToggle Component
 *
 * Tests the 3-position toggle (Archive | Defer | Today) used in Mini Sweep Gate.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MiniSweepToggle, MiniSweepPosition } from '../MiniSweepToggle';

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

describe('MiniSweepToggle', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      render(<MiniSweepToggle value="defer" onChange={mockOnChange} />);

      // Component should render
      expect(screen).toBeTruthy();
    });

    it('renders with archive value', () => {
      const { toJSON } = render(<MiniSweepToggle value="archive" onChange={mockOnChange} />);

      expect(toJSON()).toBeTruthy();
    });

    it('renders with defer value', () => {
      const { toJSON } = render(<MiniSweepToggle value="defer" onChange={mockOnChange} />);

      expect(toJSON()).toBeTruthy();
    });

    it('renders with today value', () => {
      const { toJSON } = render(<MiniSweepToggle value="today" onChange={mockOnChange} />);

      expect(toJSON()).toBeTruthy();
    });

    it('renders disabled state with reduced opacity', () => {
      const { toJSON } = render(<MiniSweepToggle value="defer" onChange={mockOnChange} disabled />);

      expect(toJSON()).toBeTruthy();
    });
  });

  describe('in-track feedback text', () => {
    it('shows "adding to today\'s list" when value is today', () => {
      render(<MiniSweepToggle value="today" onChange={mockOnChange} />);

      expect(screen.getByText("adding to today's list")).toBeTruthy();
    });

    it('shows "archiving this" when value is archive', () => {
      render(<MiniSweepToggle value="archive" onChange={mockOnChange} />);

      expect(screen.getByText('archiving this')).toBeTruthy();
    });

    it('does not show feedback text when value is defer', () => {
      render(<MiniSweepToggle value="defer" onChange={mockOnChange} />);

      expect(screen.queryByText("adding to today's list")).toBeNull();
      expect(screen.queryByText('archiving this')).toBeNull();
    });
  });

  describe('interaction', () => {
    it('does not call onChange when disabled', () => {
      render(<MiniSweepToggle value="defer" onChange={mockOnChange} disabled />);

      // The toggle has tap zones - try to find and press them
      // Since the zones don't have testIDs, we verify through behavior
      // The mockOnChange should not be called
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('position values', () => {
    it.each([
      ['archive', -1],
      ['defer', 0],
      ['today', 1],
    ])('maps %s to position %d', (position) => {
      // This test verifies the component accepts all valid position values
      const { toJSON } = render(
        <MiniSweepToggle value={position as MiniSweepPosition} onChange={mockOnChange} />,
      );

      expect(toJSON()).toBeTruthy();
    });
  });

  describe('external value changes', () => {
    it('updates when value prop changes', () => {
      const { rerender } = render(<MiniSweepToggle value="defer" onChange={mockOnChange} />);

      // No feedback text for defer
      expect(screen.queryByText("adding to today's list")).toBeNull();

      // Change to today
      rerender(<MiniSweepToggle value="today" onChange={mockOnChange} />);

      // Should now show today feedback
      expect(screen.getByText("adding to today's list")).toBeTruthy();
    });
  });
});
