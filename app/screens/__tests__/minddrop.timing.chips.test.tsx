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
  findBySourceMessageId: jest.fn(() => Promise.resolve(null)),
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

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({ close: jest.fn() }),
}));

jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

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
  mockRepo.findBySourceMessageId.mockReset();
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
  mockRepo.findBySourceMessageId.mockResolvedValue(null);
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

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalled();
    });

    const todayChip = await findByTestId('minddrop-timing-today', {}, { timeout: 3000 });

    fireEvent.press(todayChip);

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'todo-456',
          patch: expect.objectContaining({
            due_date: expect.any(String), // ISO date string
            undefined_due: false,
          }),
        }),
      );

      const updateCall = mockRepo.update.mock.calls[0][0];
      const dueDate = new Date(updateCall.patch.due_date);
      expect(dueDate.getHours()).toBe(17);
      expect(dueDate.getMinutes()).toBe(0);
    });
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
