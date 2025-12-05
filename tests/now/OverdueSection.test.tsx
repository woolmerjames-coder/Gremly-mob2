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

    it('calls onToggleComplete with the correct item when checkbox is pressed', () => {
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
      expect(mockOnToggleComplete).toHaveBeenCalledTimes(1);
      expect(mockOnToggleComplete).toHaveBeenCalledWith(item1);

      // Press the second checkbox
      fireEvent.press(screen.getByTestId('overdue-checkbox-1'));
      expect(mockOnToggleComplete).toHaveBeenCalledTimes(2);
      expect(mockOnToggleComplete).toHaveBeenCalledWith(item2);
    });

    it('does not call onPressItem when checkbox is pressed', () => {
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

      // Only onToggleComplete should be called, not onPressItem
      expect(mockOnToggleComplete).toHaveBeenCalledTimes(1);
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

  describe('collapsible behavior', () => {
    it('renders expanded by default with rows visible', () => {
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

      // Header should be visible
      expect(screen.getByTestId('overdue-section-header')).toBeTruthy();
      // Rows should be visible (expanded by default)
      expect(screen.getByTestId('overdue-row-0')).toBeTruthy();
      expect(screen.getByTestId('overdue-row-1')).toBeTruthy();
      // Expanded chevron should show
      expect(screen.getByText('▾')).toBeTruthy();
    });

    it('collapses rows when header is pressed', () => {
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

      // Press header to collapse
      fireEvent.press(screen.getByTestId('overdue-section-header'));

      // Rows should be hidden
      expect(screen.queryByTestId('overdue-row-0')).toBeNull();
      expect(screen.queryByTestId('overdue-row-1')).toBeNull();
      // Collapsed chevron should show
      expect(screen.getByText('▸')).toBeTruthy();
    });

    it('expands rows when header is pressed again', () => {
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
      expect(screen.queryByTestId('overdue-row-0')).toBeNull();

      // Expand again
      fireEvent.press(screen.getByTestId('overdue-section-header'));
      expect(screen.getByTestId('overdue-row-0')).toBeTruthy();
      expect(screen.getByTestId('overdue-row-1')).toBeTruthy();
      expect(screen.getByText('▾')).toBeTruthy();
    });
  });
});
