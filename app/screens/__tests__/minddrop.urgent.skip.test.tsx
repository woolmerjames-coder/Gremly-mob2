/**
 * Test: Urgent todos skip timing chips and get assigned to Today immediately
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CatchAllNotepad from '../CatchAllNotepad';
import * as CortexEngine from '../../../cortex/createEngine';

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

const mockDecideWithContext = jest.fn();
const mockShowActionToast = jest.fn();

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user' }),
}));

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
    useRoute: () => ({ params: {} }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 100,
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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

jest.mock('../../../src/theme/useTheme', () => {
  const tokens = jest.requireActual('../../../src/theme/tokens');
  return {
    useTheme: () => ({
      mode: 'light',
      c: tokens.colors.light,
      motion: tokens.motion,
    }),
  };
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

      // @ts-expect-error forward args to native Date constructor
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
  mockDecideWithContext.mockResolvedValue({
    mode: 'keep',
    confidence: 0,
    actions: [],
    suggestions: [],
  });
  mockShowActionToast.mockReset();
};

let createEngineSpy: jest.SpyInstance;
let originalClassifyFlag: string | undefined;

describe('Mind Drop Urgent Skip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRepo();
    resetOtherMocks();
    originalClassifyFlag = process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL;
    process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = 'true';
    createEngineSpy = jest.spyOn(CortexEngine, 'createCortexEngine').mockImplementation(() => ({
      classify: async () =>
        ({
          type: 'todo',
          undefinedDue: true,
          aiPlaced: true,
          whyString: 'Mocked classification',
          confidence: 0.95,
        }) as any,
    }));
    setFixedDate(new RealDate(2025, 10, 8, 14, 0, 0));
  });

  afterEach(() => {
    createEngineSpy.mockRestore();
    if (originalClassifyFlag === undefined) {
      delete process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL;
    } else {
      process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = originalClassifyFlag;
    }
    global.Date = RealDate;
  });

  it('urgent keyword "ASAP" skips timing chips and sets due today at 17:00', async () => {
    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Book doctor ASAP');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));

    expect(queryByTestId('minddrop-timing-chips')).toBeNull();

    const updateCall = mockRepo.update.mock.calls[0][0] as {
      patch: { due_date: string; undefined_due: boolean };
    };

    expect(updateCall.patch.undefined_due).toBe(false);
    const dueDate = new RealDate(updateCall.patch.due_date);
    expect(dueDate.getHours()).toBe(17);
    expect(dueDate.getMinutes()).toBe(0);

    const expectedToday = new RealDate('2025-11-08T14:00:00');
    expect(dueDate.toDateString()).toBe(expectedToday.toDateString());
    expect(mockShowActionToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('detects multiple urgent keywords: urgent, now, immediately, today, asap', async () => {
    const urgentKeywords = [
      'Call dentist urgent',
      'Submit report now',
      'Fix bug immediately',
      'Finish task today',
      'asap email client',
    ];

    for (const text of urgentKeywords) {
      mockRepo.create.mockClear();
      mockRepo.update.mockClear();

      const { getByTestId, queryByTestId, unmount } = render(<CatchAllNotepad />);
      const input = getByTestId('minddrop-input');
      const submitButton = getByTestId('minddrop-submit-button');

      fireEvent.changeText(input, text);
      fireEvent.press(submitButton);

      await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(mockRepo.update).toHaveBeenCalledTimes(1));

      expect(queryByTestId('minddrop-timing-chips')).toBeNull();

      const updateCall = mockRepo.update.mock.calls[0][0] as {
        patch: { due_date: string; undefined_due: boolean };
      };

      expect(updateCall.patch.undefined_due).toBe(false);
      const dueDate = new RealDate(updateCall.patch.due_date);
      expect(dueDate.getHours()).toBe(17);
      expect(dueDate.getMinutes()).toBe(0);

      unmount();
    }
  });

  it('non-urgent todos still show timing chips', async () => {
    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Review document');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));

    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();

    expect(mockRepo.update).not.toHaveBeenCalled();
  });
});
