/**
 * Test: Recent drops display human-friendly schedule text
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RecentDropsTestable as RecentDrops } from '../CatchAllNotepad';

const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getById: jest.fn(),
  notes: {
    list: jest.fn(),
  },
  todos: {
    list: jest.fn(),
  },
  habits: {
    list: jest.fn(),
  },
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

// Mock useGremlyStore (CatchAllNotepad now uses Zustand store directly)
jest.mock('../../../lib/store/useGremlyStore', () => {
  const getMockState = () => ({
    notes: [],
    todos: [],
    habits: [],
    deleteNote: jest.fn(),
    deleteTodo: jest.fn(),
    deleteHabit: jest.fn(),
  });

  const useGremlyStore = Object.assign(
    jest.fn((selector: any) => {
      if (typeof selector === 'function') {
        return selector(getMockState());
      }
      return {};
    }),
    { getState: getMockState },
  );

  return { useGremlyStore };
});

// Mock selectors
import * as selectors from '../../../lib/store/selectors';

const mockSelectRecentTodos = selectors.selectRecentTodos as jest.Mock;

jest.mock('../../../lib/store/selectors', () => ({
  selectItemById: jest.fn(),
  selectNoteBySourceMessageId: jest.fn(),
  selectRecentNotes: jest.fn(() => []),
  selectRecentTodos: jest.fn(() => []),
  selectRecentHabits: jest.fn(() => []),
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

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: {
      visible: false,
      mode: 'create' as const,
      initialEntity: undefined,
      initialSpaceId: null,
      conversionMeta: undefined,
      initialText: null,
    },
    openEdit: jest.fn(),
    openCreate: jest.fn(),
    close: jest.fn(),
  }),
}));

const overlayStub = {
  state: {
    visible: false,
    mode: 'create' as const,
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
    initialText: null,
  },
  openEdit: jest.fn(),
  openCreate: jest.fn(),
  close: jest.fn(),
};

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

const fixedNow = new Date('2025-11-08T10:00:00.000Z');
const RealDate = Date;

describe('Mind Drop Recent Drops Schedule Display', () => {
  const renderRecentDrops = () =>
    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

  beforeEach(() => {
    jest.clearAllMocks();

    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedNow.getTime());
          return;
        }
        // @ts-expect-error Forwarding variable Date constructor arguments
        super(...args);
      }
    }

    MockDate.now = () => fixedNow.getTime();
    MockDate.UTC = RealDate.UTC;
    MockDate.parse = RealDate.parse;
    // @ts-expect-error override Date for deterministic formatting
    global.Date = MockDate;

    mockSelectRecentTodos.mockReturnValue([]);
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  it('displays "due Today" for todos due today at midnight', async () => {
    const today = new Date('2025-11-08T00:00:00');

    mockSelectRecentTodos.mockReturnValue([
      {
        id: 'todo-today',
        type: 'todo',
        name: 'Morning task',
        origin: 'catchall',
        due_date: today.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-today');
      expect(dueBadge.props.children).toBe('due Today');
    });
  });

  it('displays "due Today @ 17:00" for todos due today with specific time', async () => {
    const todayAt5PM = new Date('2025-11-08T17:00:00');

    mockSelectRecentTodos.mockReturnValue([
      {
        id: 'todo-today-time',
        type: 'todo',
        name: 'Evening task',
        origin: 'catchall',
        due_date: todayAt5PM.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-today-time');
      expect(dueBadge.props.children).toBe('due Today @ 17:00');
    });
  });

  it('displays "due Tomorrow" for todos due tomorrow', async () => {
    const tomorrow = new Date('2025-11-09T09:00:00');

    mockSelectRecentTodos.mockReturnValue([
      {
        id: 'todo-tomorrow',
        type: 'todo',
        name: 'Tomorrow task',
        origin: 'catchall',
        due_date: tomorrow.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-tomorrow');
      expect(dueBadge.props.children).toBe('due Tomorrow @ 09:00');
    });
  });

  it('displays weekday short name for todos due within 7 days', async () => {
    const wednesday = new Date('2025-11-12T14:30:00');

    mockSelectRecentTodos.mockReturnValue([
      {
        id: 'todo-wed',
        type: 'todo',
        name: 'Wednesday meeting',
        origin: 'catchall',
        due_date: wednesday.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-wed');
      expect(dueBadge.props.children).toBe('due Wed @ 14:30');
    });
  });

  it('displays "due Nov 20" for todos due beyond 7 days (same month)', async () => {
    const nov20 = new Date('2025-11-20T00:00:00');

    mockSelectRecentTodos.mockReturnValue([
      {
        id: 'todo-nov20',
        type: 'todo',
        name: 'Later task',
        origin: 'catchall',
        due_date: nov20.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-nov20');
      expect(dueBadge.props.children).toBe('due Nov 20');
    });
  });

  it('displays "due Dec 5" for todos due in different month', async () => {
    const dec5 = new Date('2025-12-05T10:15:00');

    mockSelectRecentTodos.mockReturnValue([
      {
        id: 'todo-dec5',
        type: 'todo',
        name: 'December task',
        origin: 'catchall',
        due_date: dec5.toISOString(),
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-dec5');
      expect(dueBadge.props.children).toBe('due Dec 5 @ 10:15');
    });
  });

  it('displays "no deadline yet" for todos without due date', async () => {
    mockSelectRecentTodos.mockReturnValue([
      {
        id: 'todo-someday',
        type: 'todo',
        name: 'Someday task',
        origin: 'catchall',
        due_date: null,
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-someday');
      expect(dueBadge.props.children).toBe('no deadline yet');
    });
  });

  it('handles multiple todos with various due dates', async () => {
    mockSelectRecentTodos.mockReturnValue([
      {
        id: 'todo-1',
        type: 'todo',
        name: 'Today task',
        origin: 'catchall',
        due_date: new Date('2025-11-08T00:00:00').toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: 'todo-2',
        type: 'todo',
        name: 'Tomorrow task',
        origin: 'catchall',
        due_date: new Date('2025-11-09T15:00:00').toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: 'todo-3',
        type: 'todo',
        name: 'Next week',
        origin: 'catchall',
        due_date: new Date('2025-11-15T00:00:00').toISOString(),
        created_at: new Date().toISOString(),
      },
      {
        id: 'todo-4',
        type: 'todo',
        name: 'Someday',
        origin: 'catchall',
        due_date: null,
        created_at: new Date().toISOString(),
      },
    ]);

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      expect(getByTestId('minddrop-recent-todo-due-todo-1').props.children).toBe('due Today');
      expect(getByTestId('minddrop-recent-todo-due-todo-2').props.children).toBe(
        'due Tomorrow @ 15:00',
      );
      expect(getByTestId('minddrop-recent-todo-due-todo-3').props.children).toBe('due Sat');
      expect(getByTestId('minddrop-recent-todo-due-todo-4').props.children).toBe('no deadline yet');
    });
  });
});
