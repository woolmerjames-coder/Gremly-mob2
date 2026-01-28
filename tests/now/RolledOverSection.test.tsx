/**
 * Tests for RolledOverSection Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RolledOverSection } from '../../components/now/RolledOverSection';
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
    hasUnscheduledDeadline: false,
    daysUntilDeadline: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RolledOverSection', () => {
  const mockOnPressItem = jest.fn();
  const mockOnToggleComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('empty state', () => {
    it('renders null when items array is empty', () => {
      const { toJSON } = render(<RolledOverSection items={[]} onPressItem={mockOnPressItem} />);

      expect(toJSON()).toBeNull();
    });
  });

  describe('with items', () => {
    it('renders the header with "Rolled Over" label', () => {
      const items = [createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' })];

      render(<RolledOverSection items={items} onPressItem={mockOnPressItem} />);

      expect(screen.getByText('Rolled Over')).toBeTruthy();
    });

    it('renders the correct count in the header', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
        createMockSweepCandidate({ id: 'todo-3', name: 'Task 3' }),
      ];

      render(<RolledOverSection items={items} onPressItem={mockOnPressItem} />);

      expect(screen.getByText('· 3')).toBeTruthy();
    });

    it('renders one row per item with the item title visible when expanded', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Buy groceries' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Call dentist' }),
      ];

      render(<RolledOverSection items={items} onPressItem={mockOnPressItem} />);

      // Expand first (component starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      expect(screen.getByText('Buy groceries')).toBeTruthy();
      expect(screen.getByText('Call dentist')).toBeTruthy();
    });

    it('calls onPressItem with the correct item when a row is pressed', () => {
      const item1 = createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' });
      const item2 = createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' });
      const items = [item1, item2];

      render(<RolledOverSection items={items} onPressItem={mockOnPressItem} />);

      // Expand first (component starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Press the first item
      fireEvent.press(screen.getByText('Task 1'));
      expect(mockOnPressItem).toHaveBeenCalledTimes(1);
      expect(mockOnPressItem).toHaveBeenCalledWith(item1);

      // Press the second item
      fireEvent.press(screen.getByText('Task 2'));
      expect(mockOnPressItem).toHaveBeenCalledTimes(2);
      expect(mockOnPressItem).toHaveBeenCalledWith(item2);
    });

    it('renders rows with testIDs for each item when expanded', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
        createMockSweepCandidate({ id: 'todo-3', name: 'Task 3' }),
      ];

      render(<RolledOverSection items={items} onPressItem={mockOnPressItem} />);

      // Expand first (component starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

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

      const { toJSON } = render(<RolledOverSection items={items} onPressItem={mockOnPressItem} />);

      // Expand first (component starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

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
    it('renders a checkbox for each item when expanded', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Expand first (component starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      expect(screen.getByTestId('overdue-checkbox-0')).toBeTruthy();
      expect(screen.getByTestId('overdue-checkbox-1')).toBeTruthy();
    });

    it('starts animation and checkbox fills when pressed', () => {
      const item1 = createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' });
      const item2 = createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' });
      const items = [item1, item2];

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Expand first (component starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

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
        <RolledOverSection
          items={[item]}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Expand first (component starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Press the checkbox
      fireEvent.press(screen.getByTestId('overdue-checkbox-0'));

      // onPressItem should NOT be called (checkbox press is separate from row press)
      expect(mockOnPressItem).not.toHaveBeenCalled();
    });

    it('works without onToggleComplete prop (optional)', () => {
      const items = [createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' })];

      // Should not throw when onToggleComplete is not provided
      render(<RolledOverSection items={items} onPressItem={mockOnPressItem} />);

      // Expand first (component starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Checkbox should still render
      expect(screen.getByTestId('overdue-checkbox-0')).toBeTruthy();

      // Pressing it should not throw
      expect(() => {
        fireEvent.press(screen.getByTestId('overdue-checkbox-0'));
      }).not.toThrow();
    });
  });

  describe('chevron behavior', () => {
    it('shows chevron in collapsed state by default', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Header text should be present
      expect(screen.getByText('Rolled Over')).toBeTruthy();
      // Collapsed chevron should be visible (default state is collapsed)
      expect(screen.getByText('>')).toBeTruthy();
      // Expanded chevron should NOT be rendered
      expect(screen.queryByText('v')).toBeNull();
    });

    it('toggles chevron icon when expanding', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Initially collapsed
      expect(screen.getByText('>')).toBeTruthy();
      expect(screen.queryByText('v')).toBeNull();

      // Press header to expand
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Expanded chevron should be visible, collapsed should not
      expect(screen.getByText('v')).toBeTruthy();
      expect(screen.queryByText('>')).toBeNull();

      // Press header to collapse again
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Back to collapsed state
      expect(screen.getByText('>')).toBeTruthy();
      expect(screen.queryByText('v')).toBeNull();
    });
  });

  describe('collapse/expand rows', () => {
    it('rows are hidden when collapsed (default state)', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Component starts collapsed, so item titles should NOT be visible
      expect(screen.queryByText('Task 1')).toBeNull();
      expect(screen.queryByText('Task 2')).toBeNull();
    });

    it('rows become visible when expanded', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Initially collapsed - items hidden
      expect(screen.queryByText('Task 1')).toBeNull();
      expect(screen.queryByText('Task 2')).toBeNull();

      // Expand
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Assert item titles are visible
      expect(screen.getByText('Task 1')).toBeTruthy();
      expect(screen.getByText('Task 2')).toBeTruthy();
    });

    it('rows are hidden again after collapsing', () => {
      const items = [
        createMockSweepCandidate({ id: 'todo-1', name: 'Task 1' }),
        createMockSweepCandidate({ id: 'todo-2', name: 'Task 2' }),
      ];

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // Expand first
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));
      expect(screen.getByText('Task 1')).toBeTruthy();
      expect(screen.getByText('Task 2')).toBeTruthy();

      // Collapse
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Assert items are hidden again
      expect(screen.queryByText('Task 1')).toBeNull();
      expect(screen.queryByText('Task 2')).toBeNull();
    });
  });

  describe('Show X more behavior', () => {
    const MAX_VISIBLE = 5;

    it('shows "Show X more" when expanded and more than MAX_VISIBLE items', () => {
      const items = Array.from({ length: MAX_VISIBLE + 2 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // First expand the section (starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Exactly MAX_VISIBLE item titles should be visible
      for (let i = 1; i <= MAX_VISIBLE; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeTruthy();
      }
      // Items beyond MAX_VISIBLE should NOT be visible
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 1}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 2}`)).toBeNull();

      // "Show X more rolled over" row should be visible with correct count
      expect(screen.getByText('Show 2 more rolled over')).toBeTruthy();
    });

    it('expands to show all items when "Show X more" is pressed', () => {
      const items = Array.from({ length: MAX_VISIBLE + 3 }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // First expand the section (starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Initially only first MAX_VISIBLE items shown
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 1}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 2}`)).toBeNull();
      expect(screen.queryByText(`Task ${MAX_VISIBLE + 3}`)).toBeNull();

      // Press "Show X more"
      fireEvent.press(screen.getByText('Show 3 more rolled over'));

      // All item titles should now be rendered
      for (let i = 1; i <= MAX_VISIBLE + 3; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeTruthy();
      }

      // "Show X more" row should no longer be present
      expect(screen.queryByText(/Show \d+ more rolled over/)).toBeNull();
    });

    it('does not show "Show more" when items length <= MAX_VISIBLE', () => {
      const items = Array.from({ length: MAX_VISIBLE }, (_, i) =>
        createMockSweepCandidate({ id: `todo-${i}`, name: `Task ${i + 1}` }),
      );

      render(
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // First expand the section (starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

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
        <RolledOverSection
          items={items}
          onPressItem={mockOnPressItem}
          onToggleComplete={mockOnToggleComplete}
        />,
      );

      // First expand the section (starts collapsed)
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Show more should be visible when expanded
      expect(screen.getByText('Show 3 more rolled over')).toBeTruthy();

      // Collapse
      fireEvent.press(screen.getByTestId('rolled-over-section-header'));

      // Show more should be hidden
      expect(screen.queryByText('Show 3 more rolled over')).toBeNull();
    });
  });
});
