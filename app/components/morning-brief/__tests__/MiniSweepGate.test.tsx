/**
 * Tests for MiniSweepGate Component
 *
 * Tests the mini sweep gate UI that appears before Morning Brief
 * to help users quick-sort rolled over and unscheduled items.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { MiniSweepGate } from '../MiniSweepGate';
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

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    title: 'Test Todo',
    name: overrides.name || 'Test Todo',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

      expect(screen.getByText('A few things rolled over...')).toBeTruthy();
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
  });

  describe('decision buttons', () => {
    it('renders Today, Done, Later buttons for each item', () => {
      const todo = makeTodo({ id: 'test-todo', name: 'Test task' });

      render(
        <MiniSweepGate
          rolledOverTodos={[todo]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      expect(screen.getByTestId('mini-sweep-today-test-todo')).toBeTruthy();
      expect(screen.getByTestId('mini-sweep-done-test-todo')).toBeTruthy();
      expect(screen.getByTestId('mini-sweep-later-test-todo')).toBeTruthy();
    });

    it('toggles decision when button is pressed', () => {
      const todo = makeTodo({ id: 'test-todo', name: 'Test task' });

      render(
        <MiniSweepGate
          rolledOverTodos={[todo]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Press Today button
      fireEvent.press(screen.getByTestId('mini-sweep-today-test-todo'));

      // Save button should show count
      expect(screen.getByText('Save (1)')).toBeTruthy();
    });

    it('clears decision when same button is pressed again', () => {
      const todo = makeTodo({ id: 'test-todo', name: 'Test task' });

      render(
        <MiniSweepGate
          rolledOverTodos={[todo]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Press Today button twice
      fireEvent.press(screen.getByTestId('mini-sweep-today-test-todo'));
      expect(screen.getByText('Save (1)')).toBeTruthy();

      fireEvent.press(screen.getByTestId('mini-sweep-today-test-todo'));
      expect(screen.getByText('Save')).toBeTruthy(); // No count - decision cleared
    });

    it('switches decision when different button is pressed', () => {
      const todo = makeTodo({ id: 'test-todo', name: 'Test task' });

      render(
        <MiniSweepGate
          rolledOverTodos={[todo]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Press Today, then Done
      fireEvent.press(screen.getByTestId('mini-sweep-today-test-todo'));
      fireEvent.press(screen.getByTestId('mini-sweep-done-test-todo'));

      // Should still show 1 decision (switched from Today to Done)
      expect(screen.getByText('Save (1)')).toBeTruthy();
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
    it('calls onComplete even when no decisions made', async () => {
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

    it('calls updateTodo with due_day for Today decision', async () => {
      const todo = makeTodo({ id: 'test-todo', name: 'Test task' });

      render(
        <MiniSweepGate
          rolledOverTodos={[todo]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Select Today
      fireEvent.press(screen.getByTestId('mini-sweep-today-test-todo'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockUpdateTodo).toHaveBeenCalledWith('test-todo', { due_day: '2025-12-15' });
    });

    it('calls archiveTodo for Done decision', async () => {
      const todo = makeTodo({ id: 'test-todo', name: 'Test task' });

      render(
        <MiniSweepGate
          rolledOverTodos={[todo]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Select Done
      fireEvent.press(screen.getByTestId('mini-sweep-done-test-todo'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockArchiveTodo).toHaveBeenCalledWith('test-todo', 'mini_sweep');
    });

    it('calls updateTodo with skipped_in_sweep_at for Later decision', async () => {
      const todo = makeTodo({ id: 'test-todo', name: 'Test task' });

      render(
        <MiniSweepGate
          rolledOverTodos={[todo]}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Select Later
      fireEvent.press(screen.getByTestId('mini-sweep-later-test-todo'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockUpdateTodo).toHaveBeenCalledWith('test-todo', {
        skipped_in_sweep_at: '2025-12-15T00:00:00',
      });
    });

    it('processes multiple decisions in parallel', async () => {
      const todos = [
        makeTodo({ id: 't1', name: 'Task 1' }),
        makeTodo({ id: 't2', name: 'Task 2' }),
        makeTodo({ id: 't3', name: 'Task 3' }),
      ];

      render(
        <MiniSweepGate
          rolledOverTodos={todos}
          unscheduledTodos={[]}
          onComplete={mockOnComplete}
          onSkip={mockOnSkip}
        />,
      );

      // Make different decisions for each
      fireEvent.press(screen.getByTestId('mini-sweep-today-t1'));
      fireEvent.press(screen.getByTestId('mini-sweep-done-t2'));
      fireEvent.press(screen.getByTestId('mini-sweep-later-t3'));

      expect(screen.getByText('Save (3)')).toBeTruthy();

      await act(async () => {
        fireEvent.press(screen.getByTestId('mini-sweep-save'));
      });

      expect(mockUpdateTodo).toHaveBeenCalledTimes(2); // Today and Later
      expect(mockArchiveTodo).toHaveBeenCalledTimes(1); // Done
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  describe('bulk actions', () => {
    it('applies bulk Today action to all items in section', () => {
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

      // Press bulk Today button
      fireEvent.press(screen.getByTestId('mini-sweep-bulk-today-rolled over'));

      // Both items should have Today selected
      expect(screen.getByText('Save (2)')).toBeTruthy();
    });
  });
});
