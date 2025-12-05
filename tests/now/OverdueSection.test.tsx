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
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('OverdueSection', () => {
  const mockOnPressItem = jest.fn();

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
  });
});
