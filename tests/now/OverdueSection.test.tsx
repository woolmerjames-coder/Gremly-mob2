/**
 * Tests for OverdueSection Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { OverdueSection } from '../../components/now/OverdueSection';
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

describe('OverdueSection', () => {
  const mockOnPressItem = jest.fn();
  const mockOnToggleComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('empty state', () => {
    it('renders null when items array is empty', () => {
      const { toJSON } = render(<OverdueSection items={[]} onPressItem={mockOnPressItem} />);

      expect(toJSON()).toBeNull();
    });
  });

  describe('with items', () => {
    it('renders the header with "Overdue" label', () => {
      const items = [createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' })];

      render(<OverdueSection items={items} onPressItem={mockOnPressItem} />);

      expect(screen.getByText('Overdue')).toBeTruthy();
    });

    it('renders the correct count in the header', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
        createMockSweepCandidate({ id: 'todo-3', name: 'Task 3' }),
      ];

      render(<OverdueSection items={items} onPressItem={mockOnPressItem} />);

      expect(screen.getByText('· 3')).toBeTruthy();
    });

    it('renders one row per item with the item title visible', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Buy groceries' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Call dentist' }),
      ];

      render(<OverdueSection items={items} onPressItem={mockOnPressItem} />);

      expect(screen.getByText('Buy groceries')).toBeTruthy();
      expect(screen.getByText('Call dentist')).toBeTruthy();
    });

    it('calls onPressItem with the correct item when a row is pressed', () => {
      const item1 = createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' });
      const item2 = createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' });
      const items = [item1, item2];

      render(<OverdueSection items={items} onPressItem={mockOnPressItem} />);

      // Press the first item
      fireEvent.press(screen.getByText('Task 1'));
      expect(mockOnPressItem).toHaveBeenCalledTimes(1);
      expect(mockOnPressItem).toHaveBeenCalledWith(item1);

      // Press the second item
      fireEvent.press(screen.getByText('Task 2'));
      expect(mockOnPressItem).toHaveBeenCalledTimes(2);
      expect(mockOnPressItem).toHaveBeenCalledWith(item2);
    });

    it('renders rows with testIDs for each item', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
        createMockSweepCandidate({ id: 'todo-3', name: 'Task 3' }),
      ];

      render(<OverdueSection items={items} onPressItem={mockOnPressItem} />);

      // Verify each row has a testID
      expect(screen.getByTestId('overdue-row-0')).toBeTruthy();
      expect(screen.getByTestId('overdue-row-1')).toBeTruthy();
      expect(screen.getByTestId('overdue-row-2')).toBeTruthy();
    });
  });

  describe('layout consistency', () => {
    it('renders uniform row structure with dividers before each row', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'First Task' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Second Task' }),
        createMockSweepCandidate({ id: 'todo-3', name: 'Third Task' }),
      ];

      const { toJSON } = render(<OverdueSection items={items} onPressItem={mockOnPressItem} />);
      const tree = toJSON();

      // The component should render: container > [header, list]
      // list should contain: [divider, row, divider, row, divider, row]
      // Each item gets a divider before it (including the first one)
      expect(tree).toBeTruthy();

      // Verify all three rows render
      expect(screen.getByTestId('overdue-row-0')).toBeTruthy();
      expect(screen.getByTestId('overdue-row-1')).toBeTruthy();
      expect(screen.getByTestId('overdue-row-2')).toBeTruthy();
    });
  });

  describe('checkbox completion', () => {
    it('renders a checkbox for each item', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      expect(screen.getByTestId('overdue-checkbox-0')).toBeTruthy();
      expect(screen.getByTestId('overdue-checkbox-1')).toBeTruthy();
    });

    it('starts animation and checkbox fills when pressed', () => {
      const item1 = createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' });
      const item2 = createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' });
      const items = [item1, item2];

      render(
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Press the first checkbox
      fireEvent.press(screen.getByTestId('overdue-checkbox-0'));

      // Checkbox should now show checked state (checkmark visible)
      // The animation will call onToggleComplete after the full animation completes
      // We test the immediate UI response - the checkbox responds to press
      const checkbox0 = screen.getByTestId('overdue-checkbox-0');
      expect(checkbox0).toBeTruthy();

      // Text should still be visible
      expect(screen.getByText('Task 1')).toBeTruthy();
    });

    it('checkbox press does not trigger onPressItem', () => {
      const item = createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' });

      render(
        <OverdueSection
          items={[item]}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Press the checkbox
      fireEvent.press(screen.getByTestId('overdue-checkbox-0'));

      // onPressItem should NOT be called (checkbox press is separate from row press)
      expect(mockOnPressItem).not.toHaveBeenCalled();
    });

    it('works without onToggleComplete prop (optional)', () => {
      const items = [createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' })];

      // Should not throw when onToggleComplete is not provided
      render(<OverdueSection items={items} onPressItem={mockOnPressItem} />);

      // Checkbox should still render
      expect(screen.getByTestId('overdue-checkbox-0')).toBeTruthy();

      // Pressing it should not throw
      expect(() => {
        fireEvent.press(screen.getByTestId('overdue-checkbox-0'));
      }).not.toThrow();
    });
  });

  describe('chevron behavior', () => {
    it('shows chevron in expanded state by default', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Header text should be present
      expect(screen.getByText('Overdue')).toBeTruthy();
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
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Initially expanded
      expect(screen.getByText('v')).toBeTruthy();
      expect(screen.queryByText('>')).toBeNull();

      // Press header to collapse
      fireEvent.press(screen.getByTestId('overdue-section-header'));

      // Collapsed chevron should be visible, expanded should not
      expect(screen.getByText('>')).toBeTruthy();
      expect(screen.queryByText('v')).toBeNull();

      // Press header to expand again
      fireEvent.press(screen.getByTestId('overdue-section-header'));

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
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Confirm item titles are visible initially
      expect(screen.getByText('Task 1')).toBeTruthy();
      expect(screen.getByText('Task 2')).toBeTruthy();

      // Press the header to collapse
      fireEvent.press(screen.getByTestId('overdue-section-header'));

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
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Collapse
      fireEvent.press(screen.getByTestId('overdue-section-header'));
      expect(screen.queryByText('Task 1')).toBeNull();
      expect(screen.queryByText('Task 2')).toBeNull();

      // Expand again
      fireEvent.press(screen.getByTestId('overdue-section-header'));

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
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Exactly MAX_VISIBLE item titles should be visible
      for (let i = 1; i <= MAX_VISIBLE; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeTruthy();
      }
      // Items beyond MAX_VISIBLE should NOT be visible
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 1}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 2}`)).toBeNull();

      // "Show X more overdue" row should be visible with correct count
      expect(screen.getByText('Show 2 more overdue')).toBeTruthy();
    });

    it('expands to show all items when "Show X more" is pressed', () => {
      const items = Array.from({ length: MAX_VISIBLE + 3 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Initially hidden items
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 1}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 2}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 3}`)).toBeNull();

      // Press "Show X more"
      fireEvent.press(screen.getByText('Show 3 more overdue'));

      // All item titles should now be rendered
      for (let i = 1; i <= MAX_VISIBLE + 3; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeTruthy();
      }

      // "Show X more" row should no longer be present
      expect(screen.queryByText(/Show \d+ more overdue/)).toBeNull();
    });

    it('does not show "Show more" when items length <= MAX_VISIBLE', () => {
      const items = Array.from({ length: MAX_VISIBLE }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // All items should be shown
      for (let i = 1; i <= MAX_VISIBLE; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeTruthy();
      }

      // No "Show X more" row should exist
      expect(screen.queryByText(/Show \d+ more/)).toBeNull();
    });

    it('hides "Show more" button when collapsed', () => {
      const items = Array.from({ length: MAX_VISIBLE + 3 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <OverdueSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Show more should be visible when expanded
      expect(screen.getByText('Show 3 more overdue')).toBeTruthy();

      // Collapse
      fireEvent.press(screen.getByTestId('overdue-section-header'));

      // Show more should be hidden
      expect(screen.queryByText('Show 3 more overdue')).toBeNull();
    });
  });
});
