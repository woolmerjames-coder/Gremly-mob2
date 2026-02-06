/**
 * MultiSplitModal Tests
 *
 * Tests for the multi-entity split modal component.
 * Covers rendering, selection state, button actions, and dynamic labels.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { MultiSplitModal, MultiSplitModalProps } from '../MultiSplitModal';
import type { MultiDropItem } from '../../../../lib/minddrop/types';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

const mockItems: MultiDropItem[] = [
  {
    text: 'buy milk',
    bucket: 'todo',
    subtype: null,
    habitSubtype: null,
    preview_title: 'Buy milk',
  },
  {
    text: 'start running every morning',
    bucket: 'habit',
    subtype: null,
    habitSubtype: 'start_habit',
    preview_title: 'Morning running habit',
  },
  {
    text: 'feeling anxious about work',
    bucket: 'log',
    subtype: 'journal',
    habitSubtype: null,
    preview_title: 'Work anxiety reflection',
  },
];

const defaultProps: MultiSplitModalProps = {
  visible: true,
  items: mockItems,
  summaryTitle: 'Groceries + Running + Reflection',
  onClose: jest.fn(),
  onKeepAsNote: jest.fn(),
  onSplitSelected: jest.fn(),
};

function renderModal(overrides: Partial<MultiSplitModalProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<MultiSplitModal {...props} />);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('MultiSplitModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders header text correctly', () => {
      const { getByText } = renderModal();
      expect(getByText(/Looks like multiple things/)).toBeTruthy();
    });

    it('renders original text in quotes when provided', () => {
      const { getByText } = renderModal({
        originalText: 'buy milk and start running',
      });
      expect(getByText('"buy milk and start running"')).toBeTruthy();
    });

    it('does not render original text when not provided', () => {
      const { queryByText } = renderModal({ originalText: undefined });
      expect(queryByText(/^"/)).toBeNull();
    });

    it('renders all items with preview titles', () => {
      const { getByText } = renderModal();
      expect(getByText('Buy milk')).toBeTruthy();
      expect(getByText('Morning running habit')).toBeTruthy();
      expect(getByText('Work anxiety reflection')).toBeTruthy();
    });

    it('renders bucket labels for each item', () => {
      const { getAllByText } = renderModal();
      expect(getAllByText('Todo').length).toBeGreaterThanOrEqual(1);
      expect(getAllByText('Habit').length).toBeGreaterThanOrEqual(1);
      expect(getAllByText('Note').length).toBeGreaterThanOrEqual(1);
    });

    it('renders split button with count', () => {
      const { getByText } = renderModal();
      expect(getByText('Split (3)')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Selection Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('selection state', () => {
    it('all items selected by default', () => {
      const { getByText } = renderModal();
      // All items selected means Split (3)
      expect(getByText('Split (3)')).toBeTruthy();
    });

    it('toggles item selection on press', () => {
      const { getByText } = renderModal();

      // Deselect first item
      fireEvent.press(getByText('Buy milk'));

      // Should now show Split (2)
      expect(getByText('Split (2)')).toBeTruthy();
    });

    it('can deselect all items', () => {
      const { getByText } = renderModal();

      // Deselect all items
      fireEvent.press(getByText('Buy milk'));
      fireEvent.press(getByText('Morning running habit'));
      fireEvent.press(getByText('Work anxiety reflection'));

      // Should show Split (no count) or disabled state
      expect(getByText('Split')).toBeTruthy();
    });

    it('can reselect deselected item', () => {
      const { getByText } = renderModal();

      // Deselect then reselect first item
      fireEvent.press(getByText('Buy milk'));
      expect(getByText('Split (2)')).toBeTruthy();

      fireEvent.press(getByText('Buy milk'));
      expect(getByText('Split (3)')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Button Action Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('button actions', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls onSplitSelected with selected items', () => {
      const onSplitSelected = jest.fn();
      const { getByText } = renderModal({ onSplitSelected });

      fireEvent.press(getByText('Split (3)'));

      // Callback fires after FADE_IN + HOLD delay (200 + 800 = 1000ms)
      act(() => {
        jest.advanceTimersByTime(1100);
      });

      expect(onSplitSelected).toHaveBeenCalledTimes(1);
      expect(onSplitSelected).toHaveBeenCalledWith(mockItems);
    });

    it('calls onSplitSelected with partial selection', () => {
      const onSplitSelected = jest.fn();
      const { getByText } = renderModal({ onSplitSelected });

      // Deselect first item
      fireEvent.press(getByText('Buy milk'));

      fireEvent.press(getByText('Split (2)'));

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      expect(onSplitSelected).toHaveBeenCalledTimes(1);
      expect(onSplitSelected).toHaveBeenCalledWith([mockItems[1], mockItems[2]]);
    });

    it('does not call onSplitSelected when no items selected', () => {
      const onSplitSelected = jest.fn();
      const { getByText } = renderModal({ onSplitSelected });

      // Deselect all items
      fireEvent.press(getByText('Buy milk'));
      fireEvent.press(getByText('Morning running habit'));
      fireEvent.press(getByText('Work anxiety reflection'));

      fireEvent.press(getByText('Split'));

      expect(onSplitSelected).not.toHaveBeenCalled();
    });

    it('calls onKeepAsNote when keep button pressed', () => {
      const onKeepAsNote = jest.fn();
      const { getByText } = renderModal({ onKeepAsNote });

      fireEvent.press(getByText('One Item'));

      act(() => {
        jest.advanceTimersByTime(1100);
      });

      expect(onKeepAsNote).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when modal requests close', () => {
      const onClose = jest.fn();
      // Modal onRequestClose is triggered by back button/gesture
      // We test that the prop is passed correctly
      const { UNSAFE_root } = renderModal({ onClose });
      const modal = UNSAFE_root.findByType('Modal' as any);
      expect(modal.props.onRequestClose).toBe(onClose);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Dynamic Label Tests (getKeepTogetherLabel)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('getKeepTogetherLabel', () => {
    it('returns "One Task" for dominantBucket=todo', () => {
      const { getByText } = renderModal({ dominantBucket: 'todo' });
      expect(getByText('One Task')).toBeTruthy();
    });

    it('returns "One Habit" for dominantBucket=habit', () => {
      const { getByText } = renderModal({ dominantBucket: 'habit' });
      expect(getByText('One Habit')).toBeTruthy();
    });

    it('returns "Just Venting" for dominantBucket=log, dominantSubtype=journal', () => {
      const { getByText } = renderModal({
        dominantBucket: 'log',
        dominantSubtype: 'journal',
      });
      expect(getByText('Just Venting')).toBeTruthy();
    });

    it('returns "Just Brainstorming" for dominantBucket=log, dominantSubtype=idea', () => {
      const { getByText } = renderModal({
        dominantBucket: 'log',
        dominantSubtype: 'idea',
      });
      expect(getByText('Just Brainstorming')).toBeTruthy();
    });

    it('returns "One Item" as fallback', () => {
      const { getByText } = renderModal({
        dominantBucket: null,
        dominantSubtype: null,
      });
      expect(getByText('One Item')).toBeTruthy();
    });

    it('returns "One Item" for log without subtype', () => {
      const { getByText } = renderModal({
        dominantBucket: 'log',
        dominantSubtype: null,
      });
      expect(getByText('One Item')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty items array', () => {
      const { getByText } = renderModal({ items: [] });
      expect(getByText('Split')).toBeTruthy();
    });

    it('handles single item', () => {
      const { getByText } = renderModal({ items: [mockItems[0]] });
      expect(getByText('Split (1)')).toBeTruthy();
      expect(getByText('Buy milk')).toBeTruthy();
    });

    it('uses text as fallback when preview_title missing', () => {
      const itemsWithoutTitles: MultiDropItem[] = [
        {
          text: 'buy groceries',
          bucket: 'todo',
          subtype: null,
          habitSubtype: null,
          preview_title: '', // Empty
        },
      ];
      const { getByText } = renderModal({ items: itemsWithoutTitles });
      expect(getByText('buy groceries')).toBeTruthy();
    });

    it('does not render when visible is false', () => {
      const { queryByText } = renderModal({ visible: false });
      // Modal content should not be accessible when not visible
      expect(queryByText(/Looks like multiple things/)).toBeFalsy();
    });
  });
});
