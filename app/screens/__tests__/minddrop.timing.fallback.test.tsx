/**
 * Test: Timing chips auto-fallback to "Someday" after 5 seconds
 */
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

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

const mockOverlayController = {
  state: {
    visible: false,
    mode: 'create' as const,
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
  },
  openCreate: jest.fn(),
  openEdit: jest.fn(),
  openView: jest.fn(),
  close: jest.fn(),
};

const mockDecideWithContext = jest.fn(async () => createAutoTodoDecision());
const mockShowActionToast = jest.fn();

const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;

type FakeTimeoutHandle = { __fake: true; id: number };

let nextTimeoutId = 1;
const timingFallbackTimers = new Map<number, () => void>();
let setTimeoutSpy: jest.SpyInstance;
let clearTimeoutSpy: jest.SpyInstance;

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user' }),
}));

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('@react-navigation/native', () => ({
  __esModule: true,
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 100,
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => mockOverlayController,
}));

jest.mock('../../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => mockOverlayController,
}));

jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

const RealDate = Date;

const setFixedDate = (value: string | number | Date) => {
  const fixedNow = value instanceof RealDate ? value : new RealDate(value);
  const timestamp = fixedNow.getTime();

  class MockDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(timestamp);
        return;
      }
      // @ts-expect-error forwarding args to native Date constructor
      super(...args);
    }
  }

  MockDate.now = () => timestamp;
  MockDate.UTC = RealDate.UTC;
  MockDate.parse = RealDate.parse;

  // Override global Date for deterministic behavior
  global.Date = MockDate as unknown as DateConstructor;
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

const runTimingFallbackTimers = async () => {
  if (timingFallbackTimers.size === 0) {
    return;
  }

  const callbacks = Array.from(timingFallbackTimers.values());
  timingFallbackTimers.clear();

  await act(async () => {
    callbacks.forEach((cb) => cb());
    await Promise.resolve();
  });
};

let CatchAllNotepad: React.ComponentType;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CatchAllNotepad = require('../CatchAllNotepad').default as React.ComponentType;
});

describe('Mind Drop Timing Fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRepo();
    resetOtherMocks();
    timingFallbackTimers.clear();
    nextTimeoutId = 1;
    setTimeoutSpy = jest.spyOn(global, 'setTimeout') as unknown as jest.SpyInstance;
    setTimeoutSpy.mockImplementation(((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => {
      if (typeof timeout === 'number' && timeout === 5000 && typeof handler === 'function') {
        const id = nextTimeoutId++;
        timingFallbackTimers.set(id, () => (handler as (...innerArgs: unknown[]) => void)(...args));
        return { __fake: true, id } as unknown as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(handler, timeout as any, ...args);
    }) as unknown as typeof setTimeout);

    clearTimeoutSpy = jest.spyOn(global, 'clearTimeout') as unknown as jest.SpyInstance;
    clearTimeoutSpy.mockImplementation(((handle: unknown) => {
      if (handle && typeof handle === 'object' && (handle as FakeTimeoutHandle).__fake) {
        timingFallbackTimers.delete((handle as FakeTimeoutHandle).id);
        return undefined;
      }
      return realClearTimeout(handle as ReturnType<typeof setTimeout>);
    }) as unknown as typeof clearTimeout);
    setFixedDate(new RealDate(2025, 10, 8, 10, 0, 0));
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    timingFallbackTimers.clear();
    global.Date = RealDate;
  });

  it('auto-assigns "Someday" (null due date) after 5 seconds if chips ignored', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'todo-fallback-123',
      type: 'todo',
      name: 'Review docs',
    });

    mockRepo.update.mockResolvedValue({ id: 'todo-fallback-123' });

    const { getByTestId, findByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Review docs');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));

    await findByTestId('minddrop-timing-chips');

    await act(async () => {
      await Promise.resolve();
    });
    await runTimingFallbackTimers();

    await waitFor(() => {
      expect(queryByTestId('minddrop-timing-chips')).toBeNull();
    });

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'todo-fallback-123',
          patch: expect.objectContaining({
            due_date: null,
            undefined_due: true,
          }),
        }),
      );
    });
  });

  it('does NOT auto-fallback if user selects timing before timeout', async () => {
    mockRepo.create.mockResolvedValue({
      id: 'todo-selected-123',
      type: 'todo',
      name: 'Important task',
    });

    mockRepo.update.mockResolvedValue({ id: 'todo-selected-123' });

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Important task');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));

    await findByTestId('minddrop-timing-chips');
    await act(async () => {
      await Promise.resolve();
    });
    const tomorrowChip = await findByTestId('minddrop-timing-tomorrow');

    fireEvent.press(tomorrowChip);

    await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));

    const updateCall = mockRepo.update.mock.calls[0][0] as {
      patch: { due_date: string; undefined_due: boolean };
    };

    expect(updateCall.patch.undefined_due).toBe(false);
    const dueDate = new Date(updateCall.patch.due_date);
    expect(dueDate.getHours()).toBe(9);
  });
});
