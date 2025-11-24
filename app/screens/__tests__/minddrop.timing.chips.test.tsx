/**
 * Test: Timing chips appear for high-confidence todos and selection sets due date
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

type MockDecision = {
  mode: 'auto' | 'ask';
  confidence?: number;
  actions: Array<{ type: string; payload: Record<string, unknown> }>;
  suggestions: Array<Record<string, unknown>>;
  explanation?: string;
  meta?: Record<string, unknown>;
};

let repoCreateCounter = 0;

const mockRepo = {
  getById: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  getAll: jest.fn(() => Promise.resolve([])),
  findNoteBySourceMessageId: jest.fn(() => Promise.resolve(null)),
  notes: {
    list: jest.fn(() => Promise.resolve([])),
  },
  todos: {
    list: jest.fn(() => Promise.resolve([])),
  },
  habits: {
    list: jest.fn(() => Promise.resolve([])),
  },
  remove: jest.fn(),
  query: jest.fn(() => Promise.resolve([])),
};

const createAutoTodoDecision = (overrides: Partial<MockDecision> = {}): MockDecision => ({
  mode: 'auto',
  confidence: 0.92,
  actions: [
    {
      type: 'create.todo',
      payload: {
        title: 'Auto task',
        due: null,
        spaceId: null,
      },
    },
  ],
  suggestions: [],
  explanation: 'Auto organized to todo',
  meta: { intent: { kind: 'todo' } },
  ...overrides,
});

const mockDecideWithContext = jest.fn(async () => createAutoTodoDecision());
const mockShowActionToast = jest.fn();

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('@react-navigation/native', () => ({
  __esModule: true,
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 100,
}));

jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    from: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({ close: jest.fn() }),
}));

jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
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

let CatchAllNotepad: React.ComponentType;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CatchAllNotepad = require('../CatchAllNotepad').default as React.ComponentType;
});

const RealDate = Date;

const setFixedDate = (value: string | number | Date) => {
  const fixedNow = value instanceof RealDate ? value : new RealDate(value);
  const fixedTimestamp = fixedNow.getTime();

  class MockDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(fixedTimestamp);
        return;
      }
      // @ts-expect-error Forward args to native Date
      super(...args);
    }
  }

  MockDate.now = () => fixedTimestamp;
  MockDate.UTC = RealDate.UTC;
  MockDate.parse = RealDate.parse;
  // @ts-expect-error override global Date for deterministic behavior
  global.Date = MockDate;
};

const resetRepo = () => {
  repoCreateCounter = 0;

  mockRepo.getById.mockReset();
  mockRepo.update.mockReset();
  mockRepo.create.mockReset();
  mockRepo.delete.mockReset();
  mockRepo.getAll.mockReset();
  mockRepo.findNoteBySourceMessageId.mockReset();
  mockRepo.remove.mockReset();
  mockRepo.query.mockReset();
  mockRepo.notes.list.mockReset();
  mockRepo.todos.list.mockReset();
  mockRepo.habits.list.mockReset();

  mockRepo.getById.mockResolvedValue(null);
  mockRepo.update.mockResolvedValue(undefined);
  mockRepo.delete.mockResolvedValue(undefined);
  mockRepo.getAll.mockResolvedValue([]);
  mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  mockRepo.remove.mockResolvedValue(undefined);
  mockRepo.query.mockResolvedValue([]);
  mockRepo.notes.list.mockResolvedValue([]);
  mockRepo.todos.list.mockResolvedValue([]);
  mockRepo.habits.list.mockResolvedValue([]);

  mockRepo.create.mockImplementation(async (payload: Record<string, unknown>) => ({
    id: `todo-${++repoCreateCounter}`,
    ...payload,
  }));
};

const resetOtherMocks = () => {
  mockDecideWithContext.mockReset();
  mockDecideWithContext.mockImplementation(async () => createAutoTodoDecision());
  mockShowActionToast.mockReset();
};

describe('Mind Drop Timing Chips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRepo();
    resetOtherMocks();
    setFixedDate(new RealDate(2025, 10, 8, 8, 0, 0));

    // Setup conversion helper mocks for Phase 4A auto mode
    mockConvertUnsortedToTodo.mockImplementation(async (repo, noteId, options) => {
      const note = await repo.getById(noteId);
      const todoId = `todo-${noteId.replace('record-', '')}`;
      const createdTodo = {
        id: todoId,
        type: 'todo',
        name: note?.body || note?.title || 'Untitled',
        body: note?.body || note?.title,
        due_date: options?.due || null,
        undefined_due: !options?.due,
        labels: ['todo'],
        tags: note?.tags || [],
      };
      const savedTodo = await repo.create(createdTodo);
      await repo.update({ id: noteId, patch: { labels: ['archived'] } });
      return { todo: savedTodo, updatedNote: { ...note, labels: ['archived'] } };
    });
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  it('shows timing chips after high-confidence todo creation', async () => {
    mockDecideWithContext.mockResolvedValue(
      createAutoTodoDecision({
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Submit report',
              due: null,
              spaceId: null,
            },
          },
        ],
      }),
    );

    mockRepo.create.mockResolvedValue({
      id: 'todo-123',
      type: 'todo',
      name: 'Submit report',
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Submit report');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();

    const todayChip = await findByTestId('minddrop-timing-today');
    const tomorrowChip = await findByTestId('minddrop-timing-tomorrow');
    const somedayChip = await findByTestId('minddrop-timing-someday');

    expect(todayChip).toBeTruthy();
    expect(tomorrowChip).toBeTruthy();
    expect(somedayChip).toBeTruthy();
  });

  it('sets due date when timing chip selected', async () => {
    mockDecideWithContext.mockResolvedValue(
      createAutoTodoDecision({
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Call dentist',
              due: null,
              spaceId: null,
            },
          },
        ],
      }),
    );

    mockRepo.create.mockResolvedValue({
      id: 'todo-456',
      type: 'todo',
      name: 'Call dentist',
    });

    mockRepo.update.mockResolvedValue({ id: 'todo-456' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');
    fireEvent.changeText(input, 'Call dentist');
    fireEvent.press(submitButton);

    // v3 Instant Mode: Wait for direct todo creation (1 create)
    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    const todayChip = await findByTestId('minddrop-timing-today', {}, { timeout: 3000 });

    fireEvent.press(todayChip);

    await waitFor(() => {
      // v3: Expect 1 update for setting todo due date (no note archiving)
      expect(mockRepo.update).toHaveBeenCalled();
    });

    // Find the update call that sets the due date
    const updateCalls = mockRepo.update.mock.calls;
    const updateCall = updateCalls.find((call: any) => call[0]?.patch?.due_date)?.[0];
    expect(updateCall.patch.due_date).toBeDefined();
    expect(updateCall.patch.undefined_due).toBe(false);

    const dueDate = new Date(updateCall.patch.due_date);
    expect(dueDate.getHours()).toBe(17);
    expect(dueDate.getMinutes()).toBe(0);
  });

  it('shows context-aware timing options based on time of day', async () => {
    mockDecideWithContext.mockResolvedValue(
      createAutoTodoDecision({
        actions: [
          {
            type: 'create.todo',
            payload: {
              title: 'Evening task',
              due: null,
              spaceId: null,
            },
          },
        ],
      }),
    );
    setFixedDate(new RealDate(2025, 10, 8, 20, 0, 0));

    mockRepo.create.mockResolvedValue({
      id: 'todo-789',
      type: 'todo',
      name: 'Evening task',
    });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');
    fireEvent.changeText(input, 'Evening task');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });

    const tomorrowChip = await findByTestId('minddrop-timing-tomorrow');
    const todayActuallyChip = await findByTestId('minddrop-timing-today-actually');
    const somedayChip = await findByTestId('minddrop-timing-someday');

    expect(tomorrowChip).toBeTruthy();
    expect(todayActuallyChip).toBeTruthy();
    expect(somedayChip).toBeTruthy();
  });
});
