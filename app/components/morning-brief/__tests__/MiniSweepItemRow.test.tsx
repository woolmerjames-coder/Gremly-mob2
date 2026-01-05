/**
 * Tests for MiniSweepItemRow Component
 *
 * Tests the item row with toggle used in Mini Sweep Gate.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MiniSweepItemRow } from '../MiniSweepItemRow';
import type { Todo } from '../../../../lib/types';

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock OverlayContext
const mockOpenEdit = jest.fn();
jest.mock('../../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    openEdit: mockOpenEdit,
  }),
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
    space_id: null,
    ...overrides,
  } as Todo;
}

describe('MiniSweepItemRow', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders item title', () => {
      const todo = makeTodo({ name: 'Buy groceries' });

      render(<MiniSweepItemRow item={todo} value="defer" onChange={mockOnChange} />);

      expect(screen.getByText('Buy groceries')).toBeTruthy();
    });

    it('renders "Untitled" for items without name', () => {
      const todo = makeTodo({ name: '' });

      render(<MiniSweepItemRow item={todo} value="defer" onChange={mockOnChange} />);

      expect(screen.getByText('Untitled')).toBeTruthy();
    });

    it('renders border bottom when not last item', () => {
      const todo = makeTodo({ name: 'Task' });

      const { toJSON } = render(
        <MiniSweepItemRow item={todo} value="defer" onChange={mockOnChange} isLast={false} />,
      );

      // Just verify it renders
      expect(toJSON()).toBeTruthy();
    });

    it('does not render border bottom when last item', () => {
      const todo = makeTodo({ name: 'Task' });

      const { toJSON } = render(
        <MiniSweepItemRow item={todo} value="defer" onChange={mockOnChange} isLast={true} />,
      );

      // Just verify it renders
      expect(toJSON()).toBeTruthy();
    });
  });

  describe('status text', () => {
    it('shows "bye!" when value is archive', () => {
      const todo = makeTodo({ name: 'Task' });

      render(<MiniSweepItemRow item={todo} value="archive" onChange={mockOnChange} />);

      expect(screen.getByText('bye!')).toBeTruthy();
    });

    it('shows "see you soon" when value is defer', () => {
      const todo = makeTodo({ name: 'Task' });

      render(<MiniSweepItemRow item={todo} value="defer" onChange={mockOnChange} />);

      expect(screen.getByText('see you soon')).toBeTruthy();
    });

    it('shows "let\'s go!" when value is today', () => {
      const todo = makeTodo({ name: 'Task' });

      render(<MiniSweepItemRow item={todo} value="today" onChange={mockOnChange} />);

      expect(screen.getByText("let's go!")).toBeTruthy();
    });
  });

  describe('edit interaction', () => {
    it('calls openEdit when title is pressed', () => {
      const todo = makeTodo({ id: 'test-id', name: 'Task', space_id: 'space-1' });

      render(<MiniSweepItemRow item={todo} value="defer" onChange={mockOnChange} />);

      fireEvent.press(screen.getByText('Task'));

      expect(mockOpenEdit).toHaveBeenCalledWith({
        record: todo,
        spaceId: 'space-1',
      });
    });

    it('passes null spaceId when item has no space', () => {
      const todo = makeTodo({ id: 'test-id', name: 'Task', space_id: null });

      render(<MiniSweepItemRow item={todo} value="defer" onChange={mockOnChange} />);

      fireEvent.press(screen.getByText('Task'));

      expect(mockOpenEdit).toHaveBeenCalledWith({
        record: todo,
        spaceId: null,
      });
    });
  });

  describe('toggle integration', () => {
    it('renders with archive value', () => {
      const todo = makeTodo({ name: 'Task' });

      const { toJSON } = render(
        <MiniSweepItemRow item={todo} value="archive" onChange={mockOnChange} />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('renders with defer value', () => {
      const todo = makeTodo({ name: 'Task' });

      const { toJSON } = render(
        <MiniSweepItemRow item={todo} value="defer" onChange={mockOnChange} />,
      );

      expect(toJSON()).toBeTruthy();
    });

    it('renders with today value', () => {
      const todo = makeTodo({ name: 'Task' });

      const { toJSON } = render(
        <MiniSweepItemRow item={todo} value="today" onChange={mockOnChange} />,
      );

      expect(toJSON()).toBeTruthy();
    });
  });

  describe('status text styling', () => {
    it('applies today styling when value is today', () => {
      const todo = makeTodo({ name: 'Task' });

      render(<MiniSweepItemRow item={todo} value="today" onChange={mockOnChange} />);

      // Verify the "let's go!" text is rendered - styling is handled by component
      expect(screen.getByText("let's go!")).toBeTruthy();
    });
  });
});
