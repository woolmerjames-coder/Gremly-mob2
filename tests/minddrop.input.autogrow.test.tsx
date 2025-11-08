import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Animated, AccessibilityInfo, StyleSheet } from 'react-native';
import CatchAllNotepad, { MAX_DYNAMIC_HEIGHT } from '../app/screens/CatchAllNotepad';

const MAX_INPUT_CHARACTERS = 2000;

const mockClassify = jest.fn(async () => ({
  type: 'note' as const,
  subtype: 'catchall' as const,
  aiPlaced: false,
  whyString: 'mocked classification',
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

const getInputHeight = (getByTestId: (testId: string) => { props: { style: unknown } }) => {
  const styleProp = getByTestId('minddrop-input-height-wrapper').props.style;
  const flattened = StyleSheet.flatten(styleProp) as {
    height?: number | { __getValue?: () => number };
  };
  const height = flattened?.height;
  if (typeof height === 'number') {
    return height;
  }
  const maybeAnimated = height as { __getValue?: () => number } | undefined;
  if (maybeAnimated?.__getValue) {
    return maybeAnimated.__getValue();
  }
  return undefined;
};

describe('Mind Drop input auto-grow', () => {
  let reduceMotionSpy: jest.SpyInstance<Promise<boolean>, []>;
  let addEventListenerSpy: jest.SpyInstance;
  let reduceMotionListener: ((value: boolean) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    reduceMotionSpy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    addEventListenerSpy = jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      event: string,
      handler: unknown,
    ) => {
      if (event === 'reduceMotionChanged' && typeof handler === 'function') {
        reduceMotionListener = handler as (value: boolean) => void;
      }
      return { remove: jest.fn() };
    }) as unknown as typeof AccessibilityInfo.addEventListener);
  });

  afterEach(() => {
    reduceMotionSpy.mockRestore();
    addEventListenerSpy.mockRestore();
    reduceMotionListener = undefined;
  });

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

  test('auto-sizes and toggles scroll when hitting the dynamic ceiling', async () => {
    const timingSpy = stubTiming();
    const { getByTestId } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');

    fireEvent.changeText(input, 'short thought');

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: 140, width: 300 } },
    });

    await waitFor(() => {
      expect(getInputHeight(getByTestId)).toBe(140);
    });
    expect(getByTestId('minddrop-input').props.scrollEnabled).toBe(false);

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: MAX_DYNAMIC_HEIGHT - 5, width: 300 } },
    });

    await waitFor(() => {
      expect(getInputHeight(getByTestId)).toBe(MAX_DYNAMIC_HEIGHT - 5);
    });
    expect(getByTestId('minddrop-input').props.scrollEnabled).toBe(false);

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: MAX_DYNAMIC_HEIGHT + 120, width: 300 } },
    });

    await waitFor(() => {
      expect(getInputHeight(getByTestId)).toBe(MAX_DYNAMIC_HEIGHT);
    });
    expect(getByTestId('minddrop-input').props.scrollEnabled).toBe(true);

    timingSpy.mockRestore();
  });

  test('clamps large paste to 2000 characters without crashing', async () => {
    const timingSpy = stubTiming();
    const { getByTestId } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');

    const longValue = 'x'.repeat(MAX_INPUT_CHARACTERS + 500);
    fireEvent.changeText(input, longValue);

    expect(getByTestId('minddrop-input').props.value.length).toBe(MAX_INPUT_CHARACTERS);

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: MAX_DYNAMIC_HEIGHT + 200, width: 320 } },
    });

    await waitFor(() => {
      expect(getInputHeight(getByTestId)).toBe(MAX_DYNAMIC_HEIGHT);
    });

    timingSpy.mockRestore();
  });

  test('respects reduced motion by skipping the spring animation', async () => {
    reduceMotionSpy.mockResolvedValue(true);
    const timingSpy = jest.spyOn(Animated, 'timing');

    const { getByTestId } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');

    reduceMotionListener?.(true);

    fireEvent.changeText(input, 'quick note');
    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: 140, width: 300 } },
    });

    await waitFor(() => {
      expect(getInputHeight(getByTestId)).toBe(140);
    });
    expect(timingSpy).not.toHaveBeenCalled();
    expect(getByTestId('minddrop-input').props.scrollEnabled).toBe(false);

    timingSpy.mockRestore();
  });

  test('enables scrolling and caps height after typing past the max', async () => {
    const timingSpy = stubTiming();
    const { getByTestId } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');

    const longNote = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join('\n');
    fireEvent.changeText(input, longNote);

    fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: MAX_DYNAMIC_HEIGHT + 75, width: 320 } },
    });

    await waitFor(() => {
      expect(getInputHeight(getByTestId)).toBe(MAX_DYNAMIC_HEIGHT);
      expect(getByTestId('minddrop-input').props.scrollEnabled).toBe(true);
    });

    timingSpy.mockRestore();
  });

  test('keeps submit button visible across focus changes', () => {
    const { getByTestId } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');

    fireEvent(input, 'focus');
    expect(getByTestId('minddrop-submit-button')).toBeTruthy();

    fireEvent(input, 'blur');
    expect(getByTestId('minddrop-submit-button')).toBeTruthy();
  });
});
