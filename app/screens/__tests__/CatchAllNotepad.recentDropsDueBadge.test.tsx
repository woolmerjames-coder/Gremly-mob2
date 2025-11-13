/**
 * Integration test for due date badges in RecentDrops component
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RecentDropsTestable as RecentDrops } from '../CatchAllNotepad';

// Mock dependencies
const mockRepo = {
  notes: {
    list: jest.fn(),
  },
  todos: {
    list: jest.fn(),
  },
  habits: {
    list: jest.fn(),
  },
  remove: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    c: {
      text: '#000',
      mutedText: '#666',
      sageTint: '#E8F4E8',
      goldenPear: '#FFE5B4',
      mossGreen: '#3D5A3D',
      danger: '#DC2626',
    },
    mode: 'light',
  }),
}));

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    openEdit: jest.fn(),
    openCreate: jest.fn(),
    close: jest.fn(),
  }),
}));

const fixedNow = new Date('2025-11-08T10:00:00.000Z');
const RealDate = Date;

describe('RecentDrops - Todo Due Date Badges', () => {
  const renderRecentDrops = () => render(<RecentDrops initiallyOpen eagerLoad />);

  beforeEach(() => {
    jest.clearAllMocks();

    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedNow.getTime());
          return;
        }
        // @ts-expect-error Forwarding Date constructor args
        super(...args);
      }
    }

    MockDate.now = () => fixedNow.getTime();
    MockDate.UTC = RealDate.UTC;
    MockDate.parse = RealDate.parse;
    // @ts-expect-error override Date for deterministic formatting
    global.Date = MockDate;

    mockRepo.notes.list.mockResolvedValue([]);
    mockRepo.habits.list.mockResolvedValue([]);
    mockRepo.todos.list.mockResolvedValue([]);
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  it('shows "no deadline yet" for todo without due date', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-1',
        name: 'Buy groceries',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_date: null,
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-1');
      expect(dueBadge.props.children).toBe('no deadline yet');
    });
  });

  it('shows "due Today" for todo due today without time', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-2',
        name: 'Finish report',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_at: new Date('2025-11-08T00:00:00').toISOString(),
        due_date: null,
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-2');
      expect(dueBadge.props.children).toBe('due Today');
    });
  });

  it('shows "due Today @ 17:00" for urgent todo', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-3',
        name: 'Fix urgent bug asap',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_at: new Date('2025-11-08T17:00:00').toISOString(),
        due_date: null,
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-3');
      expect(dueBadge.props.children).toBe('due Today @ 17:00');
    });
  });

  it('shows "due Tomorrow @ 09:00" for todo due tomorrow with time', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-4',
        name: 'Call dentist',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_date: new Date('2025-11-09T09:00:00').toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-4');
      expect(dueBadge.props.children).toBe('due Tomorrow @ 09:00');
    });
  });

  it('shows "due Mon" for todo due on Monday (2 days away)', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-5',
        name: 'Team meeting',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_date: new Date('2025-11-10T00:00:00').toISOString(), // Monday
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-5');
      expect(dueBadge.props.children).toBe('due Mon');
    });
  });

  it('shows "due Fri @ 15:30" for todo due Friday with time', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-6',
        name: 'Submit proposal',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_date: new Date('2025-11-14T15:30:00').toISOString(), // Friday
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-6');
      expect(dueBadge.props.children).toBe('due Fri @ 15:30');
    });
  });

  it('shows "due Nov 20" for todo beyond 7 days', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-7',
        name: 'Plan event',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_date: new Date('2025-11-20T00:00:00').toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-7');
      expect(dueBadge.props.children).toBe('due Nov 20');
    });
  });

  it('shows "due Dec 5" for todo in next month', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-8',
        name: 'Holiday shopping',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_date: new Date('2025-12-05T00:00:00').toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-8');
      expect(dueBadge.props.children).toBe('due Dec 5');
    });
  });

  it('shows due date badge for multiple todos with different due dates', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-9',
        name: 'Todo 1',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
        due_date: null,
      },
      {
        id: 'todo-10',
        name: 'Todo 2',
        origin: 'catchall',
        created_at: new Date('2025-11-08T08:00:00').toISOString(),
        due_at: new Date('2025-11-08T17:00:00').toISOString(),
        due_date: null,
      },
      {
        id: 'todo-11',
        name: 'Todo 3',
        origin: 'catchall',
        created_at: new Date('2025-11-08T07:00:00').toISOString(),
        due_at: new Date('2025-11-12T10:00:00').toISOString(),
        due_date: new Date('2025-11-12T00:00:00').toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      expect(getByTestId('minddrop-recent-todo-due-todo-9').props.children).toBe('no deadline yet');
      expect(getByTestId('minddrop-recent-todo-due-todo-10').props.children).toBe(
        'due Today @ 17:00',
      );
      expect(getByTestId('minddrop-recent-todo-due-todo-11').props.children).toBe(
        'due Wed @ 10:00',
      );
    });
  });

  it('prefers due_at when both due_at and due_date are provided', async () => {
    mockRepo.todos.list.mockResolvedValue([
      {
        id: 'todo-12',
        name: 'Sync with design',
        origin: 'catchall',
        created_at: new Date('2025-11-08T06:00:00').toISOString(),
        due_at: new Date('2025-11-08T12:00:00').toISOString(),
        due_date: new Date('2025-11-10T00:00:00').toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-12');
      expect(dueBadge.props.children).toBe('due Today @ 12:00');
    });
  });

  it('does not show due date badge for notes', async () => {
    mockRepo.notes.list.mockResolvedValue([
      {
        id: 'note-1',
        body: 'Some note',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
      },
    ]);
    mockRepo.todos.list.mockResolvedValue([]);

    const { queryByTestId } = renderRecentDrops();

    await waitFor(() => {
      expect(queryByTestId('minddrop-recent-todo-due-note-1')).toBeNull();
    });
  });

  it('does not show due date badge for habits', async () => {
    mockRepo.habits.list.mockResolvedValue([
      {
        id: 'habit-1',
        name: 'Exercise',
        origin: 'catchall',
        created_at: new Date('2025-11-08T09:00:00').toISOString(),
      },
    ]);
    mockRepo.todos.list.mockResolvedValue([]);

    const { queryByTestId } = renderRecentDrops();

    await waitFor(() => {
      expect(queryByTestId('minddrop-recent-todo-due-habit-1')).toBeNull();
    });
  });
});
