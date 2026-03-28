/**
 * Test: Urgent todos skip timing chips and get assigned to Today immediately
 *
 * DEPRECATED: Tests the legacy Mind Drop pipeline with timing chips.
 * With FEATURE_FLAGS.MIND_DROP_V4_ENABLED = true (now the default), the pipeline:
 * - Bypasses timing chips entirely
 * - Creates entities directly via useMindDropSubmit hook
 * - Due date handling is done in Phase 2 background enrichment
 *
 * These tests are skipped until they can be rewritten for the V4 pipeline.
 */

describe.skip('Urgent todos skip timing chips (DEPRECATED - V4 is now default)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});

/*
 * Original test file preserved below for reference
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

// Phase 4A: Mock conversion helpers
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

// Mock the Mind Drop v3 pipeline stages
const mockRunMindDropStageAClassification = jest.fn();
const mockRunMindDropStageBPrefill = jest.fn();

jest.mock('../../../lib/minddrop/pipelineStages', () => ({
  runMindDropStageAClassification: (...args: any[]) => mockRunMindDropStageAClassification(...args),
  runMindDropStageBPrefill: (...args: any[]) => mockRunMindDropStageBPrefill(...args),
}));

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

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      setOptions: jest.fn(),
    }),
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
  // Phase 4A: Return proper auto mode response for high-confidence todos
  mockDecideWithContext.mockResolvedValue({
    mode: 'auto',
    confidence: 0.95,
    actions: [
      {
        type: 'create.todo',
        payload: { title: expect.any(String) },
      },
    ],
    suggestions: [],
  });
  mockShowActionToast.mockReset();

  // Reset conversion mocks
  mockConvertUnsortedToTodo.mockReset();
  mockConvertUnsortedToHabit.mockReset();
  mockConvertUnsortedToLog.mockReset();

  // Setup conversion helper for todos
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

  // Reset Mind Drop v3 pipeline stage mocks
  mockRunMindDropStageAClassification.mockReset();
  mockRunMindDropStageBPrefill.mockReset();

  // Default Stage A behavior: successfully create a todo
  let stageACounter = 0;
  mockRunMindDropStageAClassification.mockImplementation(async (params) => {
    const todoId = `todo-stage-a-${++stageACounter}`;
    return {
      entities: {
        todos: [todoId],
        habits: [],
        notes: [],
      },
      entityDetails: [{ kind: 'todo' as const }],
      mode: 'todo' as const, // Always return 'todo' mode for urgent skip tests
      confidence: params.decision.confidence ?? 0.95,
    };
  });

  // Default Stage B behavior: prefill succeeds
  mockRunMindDropStageBPrefill.mockImplementation(async () => {
    return { success: true };
  });
};

let createEngineSpy: jest.SpyInstance;
let originalClassifyFlag: string | undefined;

// Skip - V4 pipeline doesn't use timing chips
describe.skip('Mind Drop Urgent Skip (Original)', () => {
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

    // Phase 4A: Setup conversion helper mocks
    mockRepo.getById.mockImplementation(async (id: string) => {
      // Return the note that was created
      const noteCreate = mockRepo.create.mock.calls.find(
        (call) => call[0].id === id || call[0].type === 'note',
      );
      if (noteCreate) {
        return noteCreate[0];
      }
      return null;
    });

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
    createEngineSpy.mockRestore();
    if (originalClassifyFlag === undefined) {
      delete process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL;
    } else {
      process.env.EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL = originalClassifyFlag;
    }
    global.Date = RealDate;
  });

  it('urgent keyword "ASAP" skips timing chips', async () => {
    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Book doctor ASAP');
    fireEvent.press(submitButton);

    // v3: Creates unsorted note, Stage A runs in background
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());

    // Urgent todos should skip timing chips (this is the key behavior)
    expect(queryByTestId('minddrop-timing-chips')).toBeNull();
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

      // v3: Creates unsorted note, Stage A runs in background
      await waitFor(() => expect(mockRepo.create).toHaveBeenCalled());

      // All urgent keywords should skip timing chips
      expect(queryByTestId('minddrop-timing-chips')).toBeNull();

      unmount();
    }
  });

  it('non-urgent todos still show timing chips', async () => {
    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Review document');
    fireEvent.press(submitButton);

    // v3 Instant Mode: Expect 1 create (direct todo)
    await waitFor(() => expect(mockRepo.create).toHaveBeenCalledTimes(1));

    // Timing chips SHOULD appear for non-urgent high-confidence todos
    const timingChips = await findByTestId('minddrop-timing-chips', {}, { timeout: 3000 });
    expect(timingChips).toBeTruthy();
  });
});
