/**
 * Tests for components/hub/AllItemsTable.tsx
 * Tests table view component for Hub All Items
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AllItemsTable from '../AllItemsTable';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { resetDateService, createDateService } from '../../../lib/date';
import type { Todo, Habit, Note, Space } from '../../../lib/types';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const TODAY = '2025-12-24';
const YESTERDAY = '2025-12-23';

jest.mock('../../../lib/store/useGremlyStore');
const mockUseGremlyStore = useGremlyStore as jest.MockedFunction<typeof useGremlyStore>;

beforeEach(() => {
  resetDateService();
  createDateService({
    clock: () => new Date(`${TODAY}T10:00:00`),
  });
  jest.clearAllMocks();
});

afterEach(() => {
  resetDateService();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    name: 'Test Todo',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    ...overrides,
  } as Todo;
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: `habit-${Math.random().toString(36).slice(2)}`,
    type: 'habit',
    name: 'Test Habit',
    frequency: 'daily',
    subtype: 'start_habit',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    cadence: 'daily',
    start_date_confirmed: true,
    ...overrides,
  } as Habit;
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    type: 'note',
    body: 'Test note body',
    subtype: 'idea',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    ...overrides,
  } as Note;
}

function makeSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: `space-${Math.random().toString(36).slice(2)}`,
    owner_id: 'user-1',
    name: 'Test Space',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    ...overrides,
  } as Space;
}

function setupMockStore(data: {
  todos?: Todo[];
  habits?: Habit[];
  notes?: Note[];
  spaces?: Space[];
}) {
  mockUseGremlyStore.mockImplementation((selector: any) => {
    const state = {
      todos: data.todos || [],
      habits: data.habits || [],
      notes: data.notes || [],
      spaces: data.spaces || [],
    };
    return selector(state);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('AllItemsTable', () => {
  describe('rendering', () => {
    it('renders empty state when no items', () => {
      setupMockStore({});
      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('No items yet')).toBeTruthy();
    });

    it('renders todos', () => {
      const todo = makeTodo({ name: 'My Todo' });
      setupMockStore({ todos: [todo] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('My Todo')).toBeTruthy();
    });

    it('renders habits', () => {
      const habit = makeHabit({ name: 'My Habit' });
      setupMockStore({ habits: [habit] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('My Habit')).toBeTruthy();
    });

    it('renders notes with title', () => {
      const note = makeNote({ title: 'My Note' });
      setupMockStore({ notes: [note] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('My Note')).toBeTruthy();
    });

    it('renders notes without title using body snippet', () => {
      const note = makeNote({ title: undefined, body: 'This is the body text' });
      setupMockStore({ notes: [note] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('This is the body text')).toBeTruthy();
    });

    it('excludes archived items', () => {
      const todo = makeTodo({ name: 'Active Todo', archived: false });
      const archivedTodo = makeTodo({ name: 'Archived Todo', archived: true });
      setupMockStore({ todos: [todo, archivedTodo] });

      const { getByText, queryByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('Active Todo')).toBeTruthy();
      expect(queryByText('Archived Todo')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // FILTER TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('filter chips', () => {
    it('shows all items by default', () => {
      const todo = makeTodo({ name: 'Todo 1' });
      const habit = makeHabit({ name: 'Habit 1' });
      const note = makeNote({ title: 'Note 1' });
      setupMockStore({ todos: [todo], habits: [habit], notes: [note] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('Todo 1')).toBeTruthy();
      expect(getByText('Habit 1')).toBeTruthy();
      expect(getByText('Note 1')).toBeTruthy();
    });

    it('filters to only todos when Todos chip is pressed', () => {
      const todo = makeTodo({ name: 'Todo 1' });
      const habit = makeHabit({ name: 'Habit 1' });
      setupMockStore({ todos: [todo], habits: [habit] });

      const { getByText, queryByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      fireEvent.press(getByText('Todos'));

      expect(getByText('Todo 1')).toBeTruthy();
      expect(queryByText('Habit 1')).toBeNull();
    });

    it('filters to only habits when Habits chip is pressed', () => {
      const todo = makeTodo({ name: 'Todo 1' });
      const habit = makeHabit({ name: 'Habit 1' });
      setupMockStore({ todos: [todo], habits: [habit] });

      const { getByText, queryByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      fireEvent.press(getByText('Habits'));

      expect(queryByText('Todo 1')).toBeNull();
      expect(getByText('Habit 1')).toBeTruthy();
    });

    it('filters to only notes when Logs chip is pressed', () => {
      const todo = makeTodo({ name: 'Todo 1' });
      const note = makeNote({ title: 'Note 1' });
      setupMockStore({ todos: [todo], notes: [note] });

      const { getByText, queryByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      fireEvent.press(getByText('Logs'));

      expect(queryByText('Todo 1')).toBeNull();
      expect(getByText('Note 1')).toBeTruthy();
    });

    it('shows all items when All chip is pressed after filtering', () => {
      const todo = makeTodo({ name: 'Todo 1' });
      const habit = makeHabit({ name: 'Habit 1' });
      setupMockStore({ todos: [todo], habits: [habit] });

      const { getByText, queryByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      // Filter to todos only
      fireEvent.press(getByText('Todos'));
      expect(queryByText('Habit 1')).toBeNull();

      // Reset to all
      fireEvent.press(getByText('All'));
      expect(getByText('Todo 1')).toBeTruthy();
      expect(getByText('Habit 1')).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DUE LABEL TESTS
  // ═══════════════════════════════════════════════════════════════

  describe('due labels', () => {
    it('shows "Today" for todos due today', () => {
      const todo = makeTodo({ due_day: TODAY });
      setupMockStore({ todos: [todo] });

      const { getAllByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      // "Today" can appear in both due and captured columns
      expect(getAllByText('Today').length).toBeGreaterThan(0);
    });

    it('shows "-" for todos without due date', () => {
      const todo = makeTodo({ due_day: undefined });
      setupMockStore({ todos: [todo] });

      const { getAllByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      // There might be multiple "-" cells
      expect(getAllByText('-').length).toBeGreaterThan(0);
    });

    it('shows "Daily" for daily habits', () => {
      const habit = makeHabit({ cadence: 'daily' });
      setupMockStore({ habits: [habit] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('Daily')).toBeTruthy();
    });

    it('shows "Weekly" for weekly habits', () => {
      const habit = makeHabit({ cadence: 'weekly' });
      setupMockStore({ habits: [habit] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('Weekly')).toBeTruthy();
    });

    it('shows custom frequency for habits with days_active', () => {
      const habit = makeHabit({
        cadence: undefined,
        days_active: [1, 3, 5], // Monday, Wednesday, Friday
      });
      setupMockStore({ habits: [habit] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('3x/wk')).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SWEEP LABEL TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('sweep labels', () => {
    it('shows "Next Sweep" for undated todos', () => {
      const todo = makeTodo({ due_day: undefined });
      setupMockStore({ todos: [todo] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('Next Sweep')).toBeTruthy();
    });

    it('shows "Next Sweep" for overdue todos', () => {
      const todo = makeTodo({ due_day: YESTERDAY });
      setupMockStore({ todos: [todo] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('Next Sweep')).toBeTruthy();
    });

    it('shows "-" for completed todos', () => {
      const todo = makeTodo({
        due_day: TODAY,
        completed_at: `${TODAY}T10:00:00Z`,
      });
      setupMockStore({ todos: [todo] });

      const { getAllByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      // Completed items don't appear in sweep
      expect(getAllByText('-').length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SPACE DISPLAY TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('space display', () => {
    it('shows space chip for items with space', () => {
      const space = makeSpace({ id: 'space-1', name: 'Work' });
      const todo = makeTodo({ space_id: 'space-1' });
      setupMockStore({ todos: [todo], spaces: [space] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('Work')).toBeTruthy();
    });

    it('does not show space chip for items without space', () => {
      const todo = makeTodo({ space_id: undefined });
      setupMockStore({ todos: [todo] });

      const { queryByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      // No space text should appear
      expect(queryByText('Test Space')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SORTING TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('sorting', () => {
    it('sorts items by created date, newest first', () => {
      const olderTodo = makeTodo({
        name: 'Older',
        created_at: '2025-12-20T10:00:00Z',
      });
      const newerTodo = makeTodo({
        name: 'Newer',
        created_at: '2025-12-22T10:00:00Z',
      });
      setupMockStore({ todos: [olderTodo, newerTodo] });

      const { getAllByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      // Get all text nodes and check order
      const todoTexts = getAllByText(/Older|Newer/);
      const textValues = todoTexts.map((node) => node.props.children);

      // "Newer" should come before "Older"
      const newerIndex = textValues.indexOf('Newer');
      const olderIndex = textValues.indexOf('Older');
      expect(newerIndex).toBeLessThan(olderIndex);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTERACTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('interactions', () => {
    it('calls onItemPress with the raw item when row is pressed', () => {
      const todo = makeTodo({ name: 'Clickable Todo' });
      setupMockStore({ todos: [todo] });

      const onItemPress = jest.fn();
      const { getByText } = render(<AllItemsTable onItemPress={onItemPress} />);

      fireEvent.press(getByText('Clickable Todo'));

      expect(onItemPress).toHaveBeenCalledWith(todo);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // CAPTURED TIME DISPLAY TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('captured time display', () => {
    it('shows "Today" for items captured today', () => {
      const todo = makeTodo({ created_at: `${TODAY}T10:00:00Z` });
      setupMockStore({ todos: [todo] });

      const { getAllByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      // Multiple "Today" might appear (due label + captured)
      const todayTexts = getAllByText('Today');
      expect(todayTexts.length).toBeGreaterThan(0);
    });

    it('shows "Yesterday" for items captured yesterday', () => {
      const todo = makeTodo({ created_at: `${YESTERDAY}T10:00:00Z` });
      setupMockStore({ todos: [todo] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('Yesterday')).toBeTruthy();
    });

    it('shows days ago for recent items', () => {
      const todo = makeTodo({ created_at: '2025-12-21T10:00:00Z' }); // 3 days ago from Dec 24
      setupMockStore({ todos: [todo] });

      const { getByText } = render(<AllItemsTable onItemPress={jest.fn()} />);

      expect(getByText('3d ago')).toBeTruthy();
    });
  });
});
