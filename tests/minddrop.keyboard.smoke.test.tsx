import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';
import CatchAllNotepad, { MAX_DYNAMIC_HEIGHT } from '../app/screens/CatchAllNotepad';

const mockClassify = jest.fn(async () => ({
  type: 'note' as const,
  subtype: 'catchall' as const,
  aiPlaced: false,
  whyString: 'keyboard smoke',
}));

jest.mock('../cortex/createEngine', () => ({
  __esModule: true,
  createCortexEngine: () => ({
    classify: mockClassify,
  }),
}));

jest.mock('@/src/config/featureFlags', () => ({
  __esModule: true,
  MIND_DROP_V2: true,
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    __esModule: true,
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: jest.fn(),
      canGoBack: () => true,
      goBack: jest.fn(),
    }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 96,
}));

const mockCreate = jest.fn(async () => ({ id: 'note-1', type: 'note' }));
const mockUpdate = jest.fn(async () => ({}));
const mockRemove = jest.fn(async () => undefined);
const mockGetById = jest.fn(async () => null);
const mockFindBySourceMessageId = jest.fn(async () => null);
const mockAddUnsorted = jest.fn(async () => ({ id: 'unsorted-1' }));
const mockNotesList = jest.fn(async () => []);
const mockTodosList = jest.fn(async () => []);
const mockHabitsList = jest.fn(async () => []);
const mockNotesDelete = jest.fn(async () => undefined);
const mockTodosDelete = jest.fn(async () => undefined);
const mockHabitsDelete = jest.fn(async () => undefined);
const mockDecideWithContext = jest.fn(async () => ({
  mode: 'keep' as const,
  confidence: 0,
  actions: [],
  suggestions: [],
}));

jest.mock('../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ userId: 'user-1' }),
}));

jest.mock('../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
    getById: mockGetById,
    findNoteBySourceMessageId: mockFindBySourceMessageId,
    addUnsorted: mockAddUnsorted,
    notes: { list: mockNotesList, delete: mockNotesDelete },
    todos: { list: mockTodosList, delete: mockTodosDelete },
    habits: { list: mockHabitsList, delete: mockHabitsDelete },
  }),
}));

jest.mock('../providers/CortexProvider', () => ({
  __esModule: true,
  useCortex: () => ({
    decideWithContext: mockDecideWithContext,
  }),
}));

describe('Mind Drop keyboard smoke test', () => {
  const stubTiming = () => {
    const timingSpy = jest.spyOn(Animated, 'timing');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timingSpy.mockImplementation((value: any, config: any) => {
      if (typeof value?.setValue === 'function') {
        value.setValue(config?.toValue ?? 0);
      }
      return {
        start: (cb?: (result: { finished: boolean }) => void) => cb?.({ finished: true }),
        stop: jest.fn(),
        reset: jest.fn(),
      } as unknown as Animated.CompositeAnimation;
    });
    return timingSpy;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('submit button stays mounted after input expansion', async () => {
    const timingSpy = stubTiming();
    const { getByTestId } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');

    fireEvent.changeText(input, 'standing keyboard smoke test');

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: MAX_DYNAMIC_HEIGHT + 120, width: 300 } },
    });

    await waitFor(() => {
      expect(getByTestId('minddrop-input').props.scrollEnabled).toBe(true);
    });

    expect(getByTestId('minddrop-submit-button')).toBeTruthy();
    timingSpy.mockRestore();
  });
});
