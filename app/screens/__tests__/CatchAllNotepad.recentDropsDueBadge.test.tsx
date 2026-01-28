/**
 * Integration test for due date badges in RecentDrops component
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RecentDropsTestable as RecentDrops } from '../CatchAllNotepad';

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
  openView: jest.fn(),
  close: jest.fn(),
  openClarificationPopup: jest.fn(),
  closeClarificationPopup: jest.fn(),
};

// Mock data arrays - populated in tests
let mockNotes: any[] = [];
let mockTodos: any[] = [];
let mockHabits: any[] = [];

// Mock the store - must be inside jest.mock for hoisting
jest.mock('../../../lib/store/useGremlyStore', () => {
  const pendingDropsMap = new Map();
  const getMockState = () => ({
    notes: [],
    todos: [],
    habits: [],
    pendingDrops: pendingDropsMap,
    deleteNote: jest.fn(),
    deleteTodo: jest.fn(),
    deleteHabit: jest.fn(),
    gremlyAge: 5,
    totalSweepCount: 10,
    incrementSweepCount: () => Promise.resolve({ didAgeUp: false, newAge: 5 }),
  });

  const useGremlyStore = Object.assign(
    jest.fn((selector: any) => {
      if (typeof selector === 'function') {
        return selector(getMockState());
      }
      return getMockState();
    }),
    { getState: getMockState, subscribe: () => () => {} },
  );

  return { useGremlyStore };
});

// Mock selectors - these use the module-level arrays
jest.mock('../../../lib/store/selectors', () => ({
  selectItemById: jest.fn(),
  selectNoteBySourceMessageId: jest.fn(),
  selectRecentNotes: jest.fn(),
  selectRecentTodos: jest.fn(),
  selectRecentHabits: jest.fn(),
}));

// Import selectors after mock so we can override implementations
import {
  selectRecentNotes,
  selectRecentTodos,
  selectRecentHabits,
} from '../../../lib/store/selectors';

jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' } }),
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
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => ({
    update: jest.fn().mockResolvedValue(undefined),
    archive: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn().mockResolvedValue(null),
  }),
}));

const mockConvertUnsortedToTodo = jest.fn();
const mockConvertUnsortedToHabit = jest.fn();
const mockConvertUnsortedToLog = jest.fn();

jest.mock('../../../lib/conversion', () => {
  const actual = jest.requireActual('../../../lib/conversion');
  return {
    ...actual,
    convertUnsortedToTodo: (...args: any[]) => mockConvertUnsortedToTodo(...args),
    convertUnsortedToHabit: (...args: any[]) => mockConvertUnsortedToHabit(...args),
    convertUnsortedToLog: (...args: any[]) => mockConvertUnsortedToLog(...args),
  };
});

const fixedNow = new Date('2025-11-08T10:00:00.000Z');
const RealDate = Date;

// Skipped: Zustand pendingDropsMap mock isn't working correctly with component imports.
// TODO: Investigate Jest mock hoisting and module resolution for useGremlyStore.
describe.skip('RecentDrops - Todo Due Date Badges', () => {
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
        // @ts-expect-error Forwarding Date constructor args
        super(...args);
      }
    }

    MockDate.now = () => fixedNow.getTime();
    MockDate.UTC = RealDate.UTC;
    MockDate.parse = RealDate.parse;
    // @ts-expect-error override Date for deterministic formatting
    global.Date = MockDate;

    // Clear mock data
    mockNotes = [];
    mockTodos = [];
    mockHabits = [];

    // Configure selector mocks to return the test data
    (selectRecentNotes as unknown as jest.Mock).mockImplementation(() => mockNotes);
    (selectRecentTodos as unknown as jest.Mock).mockImplementation(() => mockTodos);
    (selectRecentHabits as unknown as jest.Mock).mockImplementation(() => mockHabits);
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  it('shows "no deadline yet" for todo without due date', async () => {
    mockTodos.push({
      id: 'todo-1',
      name: 'Buy groceries',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: null,
      due_time: null,
      due_date: null,
    });

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-1');
      expect(dueBadge.props.children).toBe('no deadline yet');
    });
  });

  it('shows "due Today" for todo due today without time', async () => {
    mockTodos.push({
      id: 'todo-2',
      name: 'Finish report',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: '2025-11-08',
      due_time: null, // No explicit time
      due_date: new Date('2025-11-08T00:00:00').toISOString(),
    });

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-2');
      expect(dueBadge.props.children).toBe('due Today');
    });
  });

  it('shows "due Today @ 17:00" for urgent todo', async () => {
    mockTodos.push({
      id: 'todo-3',
      name: 'Fix urgent bug asap',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: '2025-11-08',
      due_time: '17:00', // Explicit time
      due_date: new Date('2025-11-08T17:00:00').toISOString(),
    });

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-3');
      expect(dueBadge.props.children).toBe('due Today @ 17:00');
    });
  });

  it('shows "due Tomorrow @ 09:00" for todo due tomorrow with time', async () => {
    mockTodos.push({
      id: 'todo-4',
      name: 'Call dentist',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: '2025-11-09',
      due_time: '09:00', // Explicit time
      due_date: new Date('2025-11-09T09:00:00').toISOString(),
    });

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-4');
      expect(dueBadge.props.children).toBe('due Tomorrow @ 09:00');
    });
  });

  it('shows "due Mon" for todo due on Monday (2 days away)', async () => {
    mockTodos.push({
      id: 'todo-5',
      name: 'Team meeting',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: '2025-11-10',
      due_time: null, // No explicit time
      due_date: new Date('2025-11-10T00:00:00').toISOString(), // Monday
    });

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-5');
      expect(dueBadge.props.children).toBe('due Mon');
    });
  });

  it('shows "due Fri @ 15:30" for todo due Friday with time', async () => {
    mockTodos.push({
      id: 'todo-6',
      name: 'Submit proposal',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: '2025-11-14',
      due_time: '15:30', // Explicit time
      due_date: new Date('2025-11-14T15:30:00').toISOString(), // Friday
    });

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-6');
      expect(dueBadge.props.children).toBe('due Fri @ 15:30');
    });
  });

  it('shows "due Nov 20" for todo beyond 7 days', async () => {
    mockTodos.push({
      id: 'todo-7',
      name: 'Plan event',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: '2025-11-20',
      due_time: null,
      due_date: new Date('2025-11-20T00:00:00').toISOString(),
    });

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-7');
      expect(dueBadge.props.children).toBe('due Nov 20');
    });
  });

  it('shows "due Dec 5" for todo in next month', async () => {
    mockTodos.push({
      id: 'todo-8',
      name: 'Holiday shopping',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: '2025-12-05',
      due_time: null,
      due_date: new Date('2025-12-05T00:00:00').toISOString(),
    });

    const { getByTestId } = renderRecentDrops();

    await waitFor(() => {
      const dueBadge = getByTestId('minddrop-recent-todo-due-todo-8');
      expect(dueBadge.props.children).toBe('due Dec 5');
    });
  });

  it('shows due date badge for multiple todos with different due dates', async () => {
    mockTodos.push({
      id: 'todo-9',
      name: 'Todo 1',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
      due_day: null,
      due_time: null,
      due_date: null,
    });
    mockTodos.push({
      id: 'todo-10',
      name: 'Todo 2',
      origin: 'catchall',
      created_at: new Date('2025-11-08T08:00:00').toISOString(),
      due_day: '2025-11-08',
      due_time: '17:00', // Explicit time
      due_date: new Date('2025-11-08T17:00:00').toISOString(),
    });
    mockTodos.push({
      id: 'todo-11',
      name: 'Todo 3',
      origin: 'catchall',
      created_at: new Date('2025-11-08T07:00:00').toISOString(),
      due_day: '2025-11-12',
      due_time: '10:00', // Explicit time
      due_date: new Date('2025-11-12T10:00:00').toISOString(),
    });

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

  it('does not show due date badge for notes', async () => {
    mockNotes.push({
      id: 'note-1',
      body: 'Some note',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
    });

    const { queryByTestId } = renderRecentDrops();

    await waitFor(() => {
      expect(queryByTestId('minddrop-recent-todo-due-note-1')).toBeNull();
    });
  });

  it('does not show due date badge for habits', async () => {
    mockHabits.push({
      id: 'habit-1',
      name: 'Exercise',
      origin: 'catchall',
      created_at: new Date('2025-11-08T09:00:00').toISOString(),
    });

    const { queryByTestId } = renderRecentDrops();

    await waitFor(() => {
      expect(queryByTestId('minddrop-recent-todo-due-habit-1')).toBeNull();
    });
  });
});
