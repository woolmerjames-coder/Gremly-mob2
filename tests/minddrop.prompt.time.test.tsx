import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { render } from '@testing-library/react-native';

// SKIP: Context prompt was removed from the UI in the tweaks-for-phone branch
// The contextPrompt element is no longer rendered in CatchAllNotepad.tsx

// Original mocks kept for reference - needed if tests are re-enabled
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
      addListener: jest.fn(() => jest.fn()),
    }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 96,
}));

const mockCreate = jest.fn(async () => ({ id: 'note-ctx', type: 'note' }));
const mockNotesList = jest.fn(async () => []);
const mockTodosList = jest.fn(async () => []);
const mockHabitsList = jest.fn(async () => []);

jest.mock('../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user-1' } }),
}));

jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    state: {
      mode: 'create' as const,
      visible: false,
    },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

jest.mock('../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: mockCreate,
    notes: { list: mockNotesList },
    todos: { list: mockTodosList },
    habits: { list: mockHabitsList },
  }),
}));

// Import after all mocks to ensure supabase mock is in place
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

describe.skip('Mind Drop contextual prompt (REMOVED FROM UI)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.setSystemTime(new Date());
    jest.useRealTimers();
  });

  const getPromptAt = (isoLocal: string) => {
    jest.setSystemTime(new Date(isoLocal));
    const { getByTestId } = render(<CatchAllNotepad />);
    // Normalize line breaks - React Native Text may wrap text with \n
    const rawText = String(getByTestId('minddrop-context-prompt').props.children);
    return rawText.replace(/\n/g, ' ');
  };

  test('uses morning prompt before noon', () => {
    const prompt = getPromptAt('2025-11-07T07:00:00');
    expect(prompt).toBe("Good morning! What's on your mind?");
  });

  test('uses afternoon prompt during midday', () => {
    const prompt = getPromptAt('2025-11-07T13:00:00');
    expect(prompt).toBe('Afternoon brain dump?');
  });

  test('uses evening prompt during early night', () => {
    const prompt = getPromptAt('2025-11-07T19:00:00');
    expect(prompt).toBe('Evening thoughts?');
  });

  test('uses late-night prompt overnight', () => {
    const prompt = getPromptAt('2025-11-07T23:30:00');
    expect(prompt).toBe('Capture those late-night thoughts...');
  });
});
