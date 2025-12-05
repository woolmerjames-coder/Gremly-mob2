/**
 * Tests for RecentDropsSection Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RecentDropsSection } from '../../components/now/RecentDropsSection';
import type { SweepCandidate } from '../../lib/today/sweepSelectors';

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function createMockSweepCandidate(overrides: Partial<SweepCandidate> = {}): SweepCandidate {
  return {
    id: `todo-${Math.random().toString(36).slice(2, 9)}`,
    type: 'todo' as const,
    name: 'Test Todo',
    due_day: null,
    due_date: null,
    status: 'active' as const,
    carry_forward: false,
    completed_at: null,
    archived: false,
    isOverdue: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RecentDropsSection', () => {
  const mockOnPressItem = jest.fn();
  const mockOnAddToToday = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('empty state', () => {
    it('renders null when items array is empty', () => {
      const { toJSON } = render(
        <RecentDropsSection
          items={[]}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      expect(toJSON()).toBeNull();
    });
  });

  describe('with items', () => {
    it('renders the header with "Recent Drops" label', () => {
      const items = [createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' })];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      expect(screen.getByText('Recent Drops')).toBeTruthy();
    });

    it('renders the correct count in parentheses in the header', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
        createMockSweepCandidate({ id: 'todo-3', name: 'Task 3' }),
      ];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      expect(screen.getByText('(3)')).toBeTruthy();
    });

    it('renders one row per item with the item title visible', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Buy groceries' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Call dentist' }),
      ];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      expect(screen.getByText('Buy groceries')).toBeTruthy();
      expect(screen.getByText('Call dentist')).toBeTruthy();
    });

    it('renders dividers before every row for consistent alignment', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
        createMockSweepCandidate({ id: 'todo-3', name: 'Task 3' }),
      ];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Every row should have a divider before it (including the first row)
      expect(screen.getByTestId('recent-drops-divider-0')).toBeTruthy();
      expect(screen.getByTestId('recent-drops-divider-1')).toBeTruthy();
      expect(screen.getByTestId('recent-drops-divider-2')).toBeTruthy();

      // Rows should also have testIDs
      expect(screen.getByTestId('recent-drops-row-0')).toBeTruthy();
      expect(screen.getByTestId('recent-drops-row-1')).toBeTruthy();
      expect(screen.getByTestId('recent-drops-row-2')).toBeTruthy();
    });

    it('calls onPressItem with the correct item when a row is pressed', () => {
      const item1 = createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' });
      const item2 = createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' });
      const items = [item1, item2];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Press the first item's title
      fireEvent.press(screen.getByText('Task 1'));
      expect(mockOnPressItem).toHaveBeenCalledTimes(1);
      expect(mockOnPressItem).toHaveBeenCalledWith(item1);

      // Press the second item's title
      fireEvent.press(screen.getByText('Task 2'));
      expect(mockOnPressItem).toHaveBeenCalledTimes(2);
      expect(mockOnPressItem).toHaveBeenCalledWith(item2);
    });
  });

  describe('Add to Today action', () => {
    it('renders "+ Today" button for each item', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Should have two "+ Today" buttons
      const addButtons = screen.getAllByText('+ Today');
      expect(addButtons).toHaveLength(2);
    });

    it('triggers animation and will call onAddToToday when "+ Today" is pressed', () => {
      const item1 = createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' });
      const item2 = createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' });
      const items = [item1, item2];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Press the first "+ Today" button
      const addButtons = screen.getAllByText('+ Today');
      fireEvent.press(addButtons[0]);

      // Animation starts immediately - callback is called after animation completes
      // The animated row wrapper should exist
      expect(screen.getByTestId('recent-drop-animated-row-0')).toBeTruthy();

      // onPressItem should NOT have been called
      expect(mockOnPressItem).not.toHaveBeenCalled();
    });

    it('does not trigger onPressItem when "+ Today" is pressed', () => {
      const item = createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' });

      render(
        <RecentDropsSection
          items={[item]}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Press the "+ Today" button
      const addButton = screen.getByText('+ Today');
      fireEvent.press(addButton);

      // onPressItem should NOT be called when pressing "+ Today"
      expect(mockOnPressItem).not.toHaveBeenCalled();
    });
  });

  describe('maxVisible and Show more', () => {
    it('shows only maxVisible items by default (default 5)', () => {
      const items = Array.from({ length: 8 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // First 5 should be visible
      expect(screen.getByText('Task 1')).toBeTruthy();
      expect(screen.getByText('Task 2')).toBeTruthy();
      expect(screen.getByText('Task 3')).toBeTruthy();
      expect(screen.getByText('Task 4')).toBeTruthy();
      expect(screen.getByText('Task 5')).toBeTruthy();

      // Items 6-8 should NOT be visible yet
      expect(screen.queryByText('Task 6')).toBeNull();
      expect(screen.queryByText('Task 7')).toBeNull();
      expect(screen.queryByText('Task 8')).toBeNull();
    });

    it('respects custom maxVisible prop', () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
          maxVisible={3}
        />,
      );

      // First 3 should be visible
      expect(screen.getByText('Task 1')).toBeTruthy();
      expect(screen.getByText('Task 2')).toBeTruthy();
      expect(screen.getByText('Task 3')).toBeTruthy();

      // Items 4-5 should NOT be visible yet
      expect(screen.queryByText('Task 4')).toBeNull();
      expect(screen.queryByText('Task 5')).toBeNull();
    });

    it('shows "Show X more" button when there are more items than maxVisible', () => {
      const items = Array.from({ length: 8 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Should show "Show 3 more" (8 - 5 = 3)
      expect(screen.getByText('Show 3 more')).toBeTruthy();
    });

    it('does not show "Show more" button when items <= maxVisible', () => {
      const items = Array.from({ length: 3 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      expect(screen.queryByText(/Show .* more/)).toBeNull();
    });

    it('reveals all items when "Show more" is pressed', () => {
      const items = Array.from({ length: 8 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Initially, items 6-8 are hidden
      expect(screen.queryByText('Task 6')).toBeNull();

      // Press "Show more"
      fireEvent.press(screen.getByText('Show 3 more'));

      // Now all items should be visible
      expect(screen.getByText('Task 6')).toBeTruthy();
      expect(screen.getByText('Task 7')).toBeTruthy();
      expect(screen.getByText('Task 8')).toBeTruthy();

      // "Show more" button should be gone
      expect(screen.queryByText(/Show .* more/)).toBeNull();
    });
  });

  describe('chevron behavior', () => {
    it('shows chevron in expanded state by default', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Header text should be present
      expect(screen.getByText('Recent Drops')).toBeTruthy();
      // Expanded chevron should be visible
      expect(screen.getByText('v')).toBeTruthy();
      // Collapsed chevron should NOT be rendered
      expect(screen.queryByText('>')).toBeNull();
    });

    it('toggles chevron icon when collapsing', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Initially expanded
      expect(screen.getByText('v')).toBeTruthy();
      expect(screen.queryByText('>')).toBeNull();

      // Press header to collapse
      fireEvent.press(screen.getByTestId('recent-drops-section-header'));

      // Collapsed chevron should be visible, expanded should not
      expect(screen.getByText('>')).toBeTruthy();
      expect(screen.queryByText('v')).toBeNull();

      // Press header to expand again
      fireEvent.press(screen.getByTestId('recent-drops-section-header'));

      // Back to expanded state
      expect(screen.getByText('v')).toBeTruthy();
      expect(screen.queryByText('>')).toBeNull();
    });
  });

  describe('collapse/expand rows', () => {
    it('rows are hidden when collapsed', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Confirm item titles are visible initially
      expect(screen.getByText('Task 1')).toBeTruthy();
      expect(screen.getByText('Task 2')).toBeTruthy();

      // Press the header to collapse
      fireEvent.press(screen.getByTestId('recent-drops-section-header'));

      // Assert the item titles are no longer in the tree
      expect(screen.queryByText('Task 1')).toBeNull();
      expect(screen.queryByText('Task 2')).toBeNull();
    });

    it('rows become visible again when expanded', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Collapse
      fireEvent.press(screen.getByTestId('recent-drops-section-header'));
      expect(screen.queryByText('Task 1')).toBeNull();
      expect(screen.queryByText('Task 2')).toBeNull();

      // Expand again
      fireEvent.press(screen.getByTestId('recent-drops-section-header'));

      // Assert item titles are visible again
      expect(screen.getByText('Task 1')).toBeTruthy();
      expect(screen.getByText('Task 2')).toBeTruthy();
    });
  });

  describe('Show X more behavior', () => {
    const MAX_VISIBLE = 5;

    it('shows "Show X more" when more than MAX_VISIBLE items', () => {
      const items = Array.from({ length: MAX_VISIBLE + 2 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Exactly MAX_VISIBLE item titles should be visible
      for (let i = 1; i <= MAX_VISIBLE; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeTruthy();
      }
      // Items beyond MAX_VISIBLE should NOT be visible
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 1}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 2}`)).toBeNull();

      // "Show X more" row should be visible with correct count
      expect(screen.getByText('Show 2 more')).toBeTruthy();
    });

    it('expands to show all items when "Show X more" is pressed', () => {
      const items = Array.from({ length: MAX_VISIBLE + 3 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Initially hidden items
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 1}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 2}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 3}`)).toBeNull();

      // Press "Show X more"
      fireEvent.press(screen.getByText('Show 3 more'));

      // All item titles should now be rendered
      for (let i = 1; i <= MAX_VISIBLE + 3; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeTruthy();
      }

      // "Show X more" row should no longer be present
      expect(screen.queryByText(/Show \d+ more/)).toBeNull();
    });

    it('does not show "Show more" when items length <= MAX_VISIBLE', () => {
      const items = Array.from({ length: MAX_VISIBLE }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // All items should be shown
      for (let i = 1; i <= MAX_VISIBLE; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeTruthy();
      }

      // No "Show X more" row should exist
      expect(screen.queryByText(/Show \d+ more/)).toBeNull();
    });

    it('respects custom maxVisible prop', () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
          maxVisible={3}
        />,
      );

      // First 3 should be visible
      expect(screen.getByText('Task 1')).toBeTruthy();
      expect(screen.getByText('Task 2')).toBeTruthy();
      expect(screen.getByText('Task 3')).toBeTruthy();

      // Items 4-5 should NOT be visible yet
      expect(screen.queryByText('Task 4')).toBeNull();
      expect(screen.queryByText('Task 5')).toBeNull();

      // Should show "Show 2 more"
      expect(screen.getByText('Show 2 more')).toBeTruthy();
    });

    it('hides "Show more" button when collapsed', () => {
      const items = Array.from({ length: MAX_VISIBLE + 3 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RecentDropsSection
          items={items}
          onPressItem={mockOnPressItem}
          onAddToToday={mockOnAddToToday}
        />,
      );

      // Show more should be visible when expanded
      expect(screen.getByText('Show 3 more')).toBeTruthy();

      // Collapse
      fireEvent.press(screen.getByTestId('recent-drops-section-header'));

      // Show more should be hidden
      expect(screen.queryByText('Show 3 more')).toBeNull();
    });
  });
});
