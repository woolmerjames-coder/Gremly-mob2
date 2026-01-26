/**
 * Tests for MiniSweepGate Component
 *
 * Tests the mini sweep gate UI that appears before Morning Brief
 * to help users quick-sort rolled over and unscheduled items using a 3-position toggle.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { MiniSweepGate } from '../MiniSweepGate';
import { getDateService } from '../../../../lib/date';
import type { Todo } from '../../../../lib/types';

// Mock Zustand store
const mockUpdateTodo = jest.fn().mockResolvedValue(undefined);
const mockArchiveTodo = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: any) =>
    selector({
      updateTodo: mockUpdateTodo,
      archiveTodo: mockArchiveTodo,
    }),
}));

// Mock safe area insets
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock OverlayContext
jest.mock('../../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    openEdit: jest.fn(),
  }),
}));

// Mock capacitySelectors to avoid needing full store state
jest.mock('../../../../lib/store/capacitySelectors', () => ({
  useMiniSweepCalendarContext: () => ({
    blockedHours: 0,
    eventCount: 0,
    gremlyMessage: 'Clear day ahead. Good time to make progress on these.',
  }),
}));

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    title: 'Test Todo',
    name: overrides.name || 'Test Todo',
    owner_id: 'user-1',
    created_at: getDateService().nowTimestamp(),
    updated_at: getDateService().nowTimestamp(),
    archived: false,
    ai_placed: false,
    tags: [],
    ...overrides,
  } as Todo;
}

describe('MiniSweepGate', () => {
  const mockOnComplete = jest.fn();
  const mockOnSkip = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rendering', () => {
    it('renders null when no items to sweep', () => {
      const { toJSON } = render(
        <MiniSweepGate
          rolledOverTodos={[]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(toJSON()).toBeNull();
    });

    it('renders the header with title', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByText('A few loose ends')).toBeTruthy();
    });

    it('renders time estimate based on item count', () => {
      // With 7 items, should show ~1 min (7/6.5 = 1.07 → 1)
      const todos = Array(7)
        .fill(null)
        .map((_, i) => makeTodo({ id: `t${i}`, name: `Task ${i}` }));

      render(
        <MiniSweepGate
          rolledOverTodos={todos}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByText('~1 min')).toBeTruthy();
    });

    it('renders Gremly instructions text', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByText('Clear day ahead. Good time to make progress on these.')).toBeTruthy();
    });

    it('renders rolled over section when items exist', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[
            makeTodo({ id: 't1', name: 'Rolled over task 1' }),
            makeTodo({ id: 't2', name: 'Rolled over task 2' }),
          ]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByText(/Rolled Over/)).toBeTruthy();
      expect(screen.getByText('Rolled over task 1')).toBeTruthy();
      expect(screen.getByText('Rolled over task 2')).toBeTruthy();
    });

    it('renders unscheduled section when items exist', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[]}
          unscheduledTodos={[
            makeTodo({ id: 't1', name: 'Unscheduled task 1' }),
            makeTodo({ id: 't2', name: 'Unscheduled task 2' }),
          ]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Look for the section header with count
      expect(screen.getByText(/Unscheduled \(2\)/)).toBeTruthy();
      expect(screen.getByText('Unscheduled task 1')).toBeTruthy();
      expect(screen.getByText('Unscheduled task 2')).toBeTruthy();
    });

    it('renders both sections when both have items', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Rolled task' })]}
          unscheduledTodos={[makeTodo({ id: 't2', name: 'Pending task' })]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByText(/Rolled Over \(1\)/)).toBeTruthy();
      expect(screen.getByText(/Unscheduled \(1\)/)).toBeTruthy();
    });

    it('renders Skip and Save buttons', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByTestId('mini-sweep-skip')).toBeTruthy();
      expect(screen.getByTestId('mini-sweep-save')).toBeTruthy();
    });

    it('displays testID on main container', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByTestId('mini-sweep-gate')).toBeTruthy();
    });

    it('renders section control hints (Archive, Defer, Today)', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByText('← Archive')).toBeTruthy();
      expect(screen.getByText('Defer')).toBeTruthy();
      expect(screen.getByText('Today →')).toBeTruthy();
    });
  });

  describe('item rows with toggle', () => {
    it('renders items with default defer status', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Test task' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Default state is defer - should show "see you soon"
      expect(screen.getByText('see you soon')).toBeTruthy();
    });
  });

  describe('skip button', () => {
    it('calls onSkip when pressed', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      fireEvent.press(screen.getByTestId('mini-sweep-skip'));

      expect(mockOnSkip).toHaveBeenCalled();
    });
  });

  describe('save button', () => {
    it('shows "Save" with no changes (all defer)', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByText('Save')).toBeTruthy();
    });

    it('calls onComplete when Save pressed', async () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('does not call updateTodo or archiveTodo for defer decisions', async () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      // Defer = no action
      expect(mockUpdateTodo).not.toHaveBeenCalled();
      expect(mockArchiveTodo).not.toHaveBeenCalled();
    });
  });

  describe('bulk actions', () => {
    it('renders bulk action buttons for rolled over section', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByTestId('mini-sweep-bulk-archive-rolled over')).toBeTruthy();
      expect(screen.getByTestId('mini-sweep-bulk-defer-rolled over')).toBeTruthy();
      expect(screen.getByTestId('mini-sweep-bulk-today-rolled over')).toBeTruthy();
    });

    it('renders bulk action buttons for unscheduled section', () => {
      render(
        <MiniSweepGate
          rolledOverTodos={[]}
          unscheduledTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByTestId('mini-sweep-bulk-archive-unscheduled')).toBeTruthy();
      expect(screen.getByTestId('mini-sweep-bulk-defer-unscheduled')).toBeTruthy();
      expect(screen.getByTestId('mini-sweep-bulk-today-unscheduled')).toBeTruthy();
    });

    it('applies bulk today action and updates Save button count', async () => {
      const todos = [
        makeTodo({ id: 't1', name: 'Task 1' }),
        makeTodo({ id: 't2', name: 'Task 2' }),
      ];

      render(
        <MiniSweepGate
          rolledOverTodos={todos}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      fireEvent.press(screen.getByTestId('mini-sweep-bulk-today-rolled over'));

      // Both items moved to "today" - should show Save (2)
      expect(screen.getByText('Save (2)')).toBeTruthy();
    });

    it('applies bulk archive and calls archiveTodo on save', async () => {
      const todos = [
        makeTodo({ id: 't1', name: 'Task 1' }),
        makeTodo({ id: 't2', name: 'Task 2' }),
      ];

      render(
        <MiniSweepGate
          rolledOverTodos={todos}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      fireEvent.press(screen.getByTestId('mini-sweep-bulk-archive-rolled over'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockArchiveTodo).toHaveBeenCalledWith('t1', 'mini_sweep');
      expect(mockArchiveTodo).toHaveBeenCalledWith('t2', 'mini_sweep');
    });

    it('applies bulk today and calls updateTodo with due_day on save', async () => {
      const todos = [
        makeTodo({ id: 't1', name: 'Task 1' }),
        makeTodo({ id: 't2', name: 'Task 2' }),
      ];

      render(
        <MiniSweepGate
          rolledOverTodos={todos}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      fireEvent.press(screen.getByTestId('mini-sweep-bulk-today-rolled over'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockUpdateTodo).toHaveBeenCalledWith('t1', { due_day: '2025-12-15' });
      expect(mockUpdateTodo).toHaveBeenCalledWith('t2', { due_day: '2025-12-15' });
    });

    it('applies bulk defer (no store calls on save)', async () => {
      const todos = [makeTodo({ id: 't1', name: 'Task 1' })];

      render(
        <MiniSweepGate
          rolledOverTodos={todos}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // First set to today
      fireEvent.press(screen.getByTestId('mini-sweep-bulk-today-rolled over'));
      expect(screen.getByText('Save (1)')).toBeTruthy();

      // Then bulk defer
      fireEvent.press(screen.getByTestId('mini-sweep-bulk-defer-rolled over'));
      expect(screen.getByText('Save')).toBeTruthy(); // No count

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockUpdateTodo).not.toHaveBeenCalled();
      expect(mockArchiveTodo).not.toHaveBeenCalled();
    });
  });

  describe('saving state', () => {
    it('shows "Saving..." while save is in progress', async () => {
      // Make updateTodo hang to simulate pending state
      mockUpdateTodo.mockImplementation(() => new Promise(() => {}));

      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      fireEvent.press(screen.getByTestId('mini-sweep-bulk-today-rolled over'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(screen.getByText('Saving...')).toBeTruthy();
    });

    it('disables save button while saving', async () => {
      mockUpdateTodo.mockImplementation(() => new Promise(() => {}));

      render(
        <MiniSweepGate
          rolledOverTodos={[makeTodo({ id: 't1', name: 'Task 1' })]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      fireEvent.press(screen.getByTestId('mini-sweep-bulk-today-rolled over'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      // Try to press again - should not trigger onComplete twice
      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      // onComplete is called immediately on first save
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('mixed decisions', () => {
    it('handles mixed decisions across sections', async () => {
      const rolledOver = [makeTodo({ id: 't1', name: 'Rolled 1' })];
      const unscheduled = [makeTodo({ id: 't2', name: 'Unsched 1' })];

      render(
        <MiniSweepGate
          rolledOverTodos={rolledOver}
          unscheduledTodos={unscheduled}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Archive rolled over, set unscheduled to today
      fireEvent.press(screen.getByTestId('mini-sweep-bulk-archive-rolled over'));
      fireEvent.press(screen.getByTestId('mini-sweep-bulk-today-unscheduled'));

      expect(screen.getByText('Save (2)')).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockArchiveTodo).toHaveBeenCalledWith('t1', 'mini_sweep');
      expect(mockUpdateTodo).toHaveBeenCalledWith('t2', { due_day: '2025-12-15' });
    });
  });
});
