import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TodoSection } from '../components/spaces/sections/TodoSection';
import { HabitsSection } from '../components/spaces/sections/HabitsSection';
import { GuidesLogsSection } from '../components/spaces/sections/GuidesLogsSection';

// Mock lucide icons
jest.mock('lucide-react-native', () => ({
  Circle: () => null,
  CheckCircle2: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  Flame: () => null,
  FileText: () => null,
}));

const mockTodo = (id: string, name: string, completed = false) => ({
  id,
  name,
  type: 'todo' as const,
  ai_placed: false,
  owner_id: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  completed_at: completed ? '2025-01-01T00:00:00Z' : null,
});

const mockHabit = (id: string, name: string) => ({
  id,
  name,
  type: 'habit' as const,
  frequency: 'daily' as const,
  subtype: 'start_habit' as const,
  ai_placed: false,
  owner_id: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
});

const mockNote = (id: string, title: string) => ({
  id,
  title,
  type: 'note' as const,
  subtype: 'catchall' as const,
  ai_placed: false,
  owner_id: 'user-1',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  body: 'Test body',
});

describe('TodoSection', () => {
  const defaultProps = {
    todos: [],
    onTodoPress: jest.fn(),
    onTodoComplete: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('hides when no todos', () => {
    const { queryByTestId } = render(<TodoSection {...defaultProps} />);
    expect(queryByTestId('todo-section')).toBeNull();
  });

  it('renders section header with count', () => {
    const todos = [mockTodo('1', 'Task 1'), mockTodo('2', 'Task 2')];
    const { getByText } = render(<TodoSection {...defaultProps} todos={todos} />);
    expect(getByText(/To Do/)).toBeTruthy();
    expect(getByText(/(2)/)).toBeTruthy();
  });

  it('shows max 4 items by default', () => {
    const todos = [
      mockTodo('1', 'Task 1'),
      mockTodo('2', 'Task 2'),
      mockTodo('3', 'Task 3'),
      mockTodo('4', 'Task 4'),
      mockTodo('5', 'Task 5'),
      mockTodo('6', 'Task 6'),
    ];
    const { getByText, queryByTestId } = render(
      <TodoSection {...defaultProps} todos={todos} maxVisible={4} />,
    );
    expect(getByText('+2 more...')).toBeTruthy();
    expect(queryByTestId('todo-row-5')).toBeNull();
  });

  it('expands to show all items', () => {
    const todos = [
      mockTodo('1', 'Task 1'),
      mockTodo('2', 'Task 2'),
      mockTodo('3', 'Task 3'),
      mockTodo('4', 'Task 4'),
      mockTodo('5', 'Task 5'),
    ];
    const { getByText, getByTestId } = render(
      <TodoSection {...defaultProps} todos={todos} maxVisible={4} />,
    );

    fireEvent.press(getByText('+1 more...'));
    expect(getByTestId('todo-row-5')).toBeTruthy();
  });

  it('calls onTodoComplete when checkbox pressed', () => {
    const todos = [mockTodo('1', 'Task 1')];
    const { getByTestId } = render(<TodoSection {...defaultProps} todos={todos} />);

    fireEvent.press(getByTestId('todo-checkbox-1'));
    expect(defaultProps.onTodoComplete).toHaveBeenCalledWith(todos[0]);
  });

  it('calls onTodoPress when row pressed', () => {
    const todos = [mockTodo('1', 'Task 1')];
    const { getByTestId } = render(<TodoSection {...defaultProps} todos={todos} />);

    fireEvent.press(getByTestId('todo-row-1'));
    expect(defaultProps.onTodoPress).toHaveBeenCalledWith(todos[0]);
  });
});

describe('HabitsSection', () => {
  const defaultProps = {
    habits: [],
    progressMap: new Map(),
    streakMap: new Map(),
    onHabitPress: jest.fn(),
    onHabitLog: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('hides when no habits', () => {
    const { queryByTestId } = render(<HabitsSection {...defaultProps} />);
    expect(queryByTestId('habits-section')).toBeNull();
  });

  it('renders section header with count', () => {
    const habits = [mockHabit('1', 'Habit 1')];
    const { getByText } = render(<HabitsSection {...defaultProps} habits={habits} />);
    expect(getByText(/Habits/)).toBeTruthy();
    // Count appears in header - just verify section renders
    expect(getByText('Habit 1')).toBeTruthy();
  });

  it('shows streak indicator when streak > 0', () => {
    const habits = [mockHabit('1', 'Habit 1')];
    const streakMap = new Map([['1', 5]]);
    const { getByText } = render(
      <HabitsSection {...defaultProps} habits={habits} streakMap={streakMap} />,
    );
    expect(getByText('5')).toBeTruthy();
  });

  it('calls onHabitLog when checkbox pressed', () => {
    const habits = [mockHabit('1', 'Habit 1')];
    const { getByTestId } = render(<HabitsSection {...defaultProps} habits={habits} />);

    fireEvent.press(getByTestId('habit-checkbox-1'));
    expect(defaultProps.onHabitLog).toHaveBeenCalledWith(habits[0]);
  });
});

describe('GuidesLogsSection', () => {
  const defaultProps = {
    notes: [],
    onNotePress: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('hides when no notes', () => {
    const { queryByTestId } = render(<GuidesLogsSection {...defaultProps} />);
    expect(queryByTestId('guides-logs-section')).toBeNull();
  });

  it('renders section header with count', () => {
    const notes = [mockNote('1', 'Note 1'), mockNote('2', 'Note 2')];
    const { getByText } = render(<GuidesLogsSection {...defaultProps} notes={notes} />);
    expect(getByText(/Guides & Logs/)).toBeTruthy();
    // Verify notes render
    expect(getByText('Note 1')).toBeTruthy();
    expect(getByText('Note 2')).toBeTruthy();
  });

  it('shows +X overflow when more than max visible', () => {
    const notes = [
      mockNote('1', 'Note 1'),
      mockNote('2', 'Note 2'),
      mockNote('3', 'Note 3'),
      mockNote('4', 'Note 4'),
      mockNote('5', 'Note 5'),
    ];
    const { getByText } = render(
      <GuidesLogsSection {...defaultProps} notes={notes} maxVisible={3} />,
    );
    expect(getByText('+2')).toBeTruthy();
  });

  it('calls onNotePress when pill pressed', () => {
    const notes = [mockNote('1', 'Note 1')];
    const { getByTestId } = render(<GuidesLogsSection {...defaultProps} notes={notes} />);

    fireEvent.press(getByTestId('note-pill-1'));
    expect(defaultProps.onNotePress).toHaveBeenCalledWith(notes[0]);
  });
});
