/**
 * Test: Recent drops display human-friendly schedule text
 */
import React from 'react';
import { render } from '@testing-library/react-native';

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getById: jest.fn(),
  query: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

import CatchAllNotepad from '../CatchAllNotepad';

describe('Mind Drop Recent Drops Schedule Display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Set reference date: November 8, 2025 at 10 AM
    jest.setSystemTime(new Date('2025-11-08T10:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('displays "due Today" for todos due today at midnight', async () => {
    const today = new Date('2025-11-08T00:00:00');

    mockRepo.query.mockResolvedValue([
      {
        id: 'todo-today',
        type: 'todo',
        name: 'Morning task',
        due_date: today.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = render(<CatchAllNotepad />);

    // Recent drops should render with due date badge
    const dueBadge = getByTestId('minddrop-recent-todo-due-todo-today');
    expect(dueBadge).toBeTruthy();
    expect(dueBadge.props.children).toBe('due Today');
  });

  it('displays "due Today @ 17:00" for todos due today with specific time', async () => {
    const todayAt5PM = new Date('2025-11-08T17:00:00');

    mockRepo.query.mockResolvedValue([
      {
        id: 'todo-today-time',
        type: 'todo',
        name: 'Evening task',
        due_date: todayAt5PM.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = render(<CatchAllNotepad />);

    const dueBadge = getByTestId('minddrop-recent-todo-due-todo-today-time');
    expect(dueBadge.props.children).toBe('due Today @ 17:00');
  });

  it('displays "due Tomorrow" for todos due tomorrow', async () => {
    const tomorrow = new Date('2025-11-09T09:00:00');

    mockRepo.query.mockResolvedValue([
      {
        id: 'todo-tomorrow',
        type: 'todo',
        name: 'Tomorrow task',
        due_date: tomorrow.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = render(<CatchAllNotepad />);

    const dueBadge = getByTestId('minddrop-recent-todo-due-todo-tomorrow');
    expect(dueBadge.props.children).toBe('due Tomorrow @ 09:00');
  });

  it('displays weekday short name for todos due within 7 days', async () => {
    // Wednesday, Nov 12, 2025 (4 days from Nov 8)
    const wednesday = new Date('2025-11-12T14:30:00');

    mockRepo.query.mockResolvedValue([
      {
        id: 'todo-wed',
        type: 'todo',
        name: 'Wednesday meeting',
        due_date: wednesday.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = render(<CatchAllNotepad />);

    const dueBadge = getByTestId('minddrop-recent-todo-due-todo-wed');
    expect(dueBadge.props.children).toBe('due Wed @ 14:30');
  });

  it('displays "due Nov 20" for todos due beyond 7 days (same month)', async () => {
    const nov20 = new Date('2025-11-20T00:00:00');

    mockRepo.query.mockResolvedValue([
      {
        id: 'todo-nov20',
        type: 'todo',
        name: 'Later task',
        due_date: nov20.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = render(<CatchAllNotepad />);

    const dueBadge = getByTestId('minddrop-recent-todo-due-todo-nov20');
    expect(dueBadge.props.children).toBe('due Nov 20');
  });

  it('displays "due Dec 5" for todos due in different month', async () => {
    const dec5 = new Date('2025-12-05T10:15:00');

    mockRepo.query.mockResolvedValue([
      {
        id: 'todo-dec5',
        type: 'todo',
        name: 'December task',
        due_date: dec5.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = render(<CatchAllNotepad />);

    const dueBadge = getByTestId('minddrop-recent-todo-due-todo-dec5');
    expect(dueBadge.props.children).toBe('due Dec 5 @ 10:15');
  });

  it('displays "no deadline yet" for todos without due date', async () => {
    mockRepo.query.mockResolvedValue([
      {
        id: 'todo-someday',
        type: 'todo',
        name: 'Someday task',
        due_date: null,
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = render(<CatchAllNotepad />);

    const dueBadge = getByTestId('minddrop-recent-todo-due-todo-someday');
    expect(dueBadge.props.children).toBe('no deadline yet');
  });

  it('handles multiple todos with various due dates', async () => {
    mockRepo.query.mockResolvedValue([
      {
        id: 'todo-1',
        type: 'todo',
        name: 'Today task',
        due_date: new Date('2025-11-08T00:00:00').toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: 'todo-2',
        type: 'todo',
        name: 'Tomorrow task',
        due_date: new Date('2025-11-09T15:00:00').toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: 'todo-3',
        type: 'todo',
        name: 'Next week',
        due_date: new Date('2025-11-15T00:00:00').toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: 'todo-4',
        type: 'todo',
        name: 'Someday',
        due_date: null,
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = render(<CatchAllNotepad />);

    expect(getByTestId('minddrop-recent-todo-due-todo-1').props.children).toBe('due Today');
    expect(getByTestId('minddrop-recent-todo-due-todo-2').props.children).toBe(
      'due Tomorrow @ 15:00',
    );
    expect(getByTestId('minddrop-recent-todo-due-todo-3').props.children).toBe('due Nov 15');
    expect(getByTestId('minddrop-recent-todo-due-todo-4').props.children).toBe('no deadline yet');
  });
});
