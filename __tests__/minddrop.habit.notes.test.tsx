/**
 * Test: Mind Drop habit creation stores full raw text in notes field
 * Test: Mind Drop habit tags are properly cleaned (no junk time/frequency words)
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// Force feature flag ON
jest.mock('@/src/config/featureFlags', () => ({ MIND_DROP_V2: true }));

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: mockNavigate,
      canGoBack: () => true,
      goBack: jest.fn(),
    }),
  };
});

// Mock navigation elements (useHeaderHeight)
jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

const mockDecideWithContext = jest.fn();

jest.mock('../providers/CortexProvider', () => {
  const actual = jest.requireActual('../providers/CortexProvider');
  return {
    ...actual,
    useCortex: () => ({
      decideWithContext: mockDecideWithContext,
    }),
  };
});

// Mock Auth
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}));

// Mock Repo
const mockCreate = jest.fn();

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    remove: jest.fn(),
    writeEvent: jest.fn(),
    getOrCreateList: jest.fn(async (key: string) => ({ id: key, name: key })),
    addListItem: jest.fn(),
    listByType: jest.fn(),
    listSpaces: jest.fn(),
    listTags: jest.fn(),
    listLinkedTags: jest.fn(),
    listPeople: jest.fn(),
    listLinkedPeople: jest.fn(),
  }),
}));

// Component under test
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();

  mockDecideWithContext.mockResolvedValue({
    mode: 'auto',
    actions: [
      {
        type: 'create.habit',
        payload: { name: 'Exercise daily', freq: 'daily', spaceId: null },
      },
    ],
    confidence: 0.9,
    suggestions: [],
    explanation: 'On it 🎯',
  });

  mockCreate.mockResolvedValue({ id: 'habit-123', type: 'habit' });
});

describe('Mind Drop habit notes field', () => {
  it('stores full raw Mind Drop text in notes field when creating habit', async () => {
    render(<CatchAllNotepad />);

    const userInput = 'I want to start running every morning at 6am';
    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, userInput);

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    // Verify repo.create was called with notes field containing raw user input
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'habit',
        notes: userInput, // Full raw text should be stored in notes field
      }),
    );
  });

  it('preserves full text even when AI suggests shorter name', async () => {
    render(<CatchAllNotepad />);

    const userInput =
      'Start a daily meditation practice for 10 minutes each morning to reduce stress';
    mockDecideWithContext.mockResolvedValueOnce({
      mode: 'auto',
      actions: [
        {
          type: 'create.habit',
          payload: { name: 'Meditate daily', freq: 'daily', spaceId: null }, // Shorter AI name
        },
      ],
      confidence: 0.95,
      suggestions: [],
      explanation: 'Got it!',
    });

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, userInput);

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.type).toBe('habit');
    expect(createCall.name).toBe('Meditate daily'); // AI-suggested short name
    expect(createCall.notes).toBe(userInput); // But notes has full original text
  });
});

describe('Mind Drop habit tag cleanup', () => {
  it('filters out junk time/frequency words from habit tags', async () => {
    render(<CatchAllNotepad />);

    const userInput = 'Meditate for 10 minutes every morning';

    // Mock Cortex to return tags that include junk words
    mockDecideWithContext.mockResolvedValueOnce({
      mode: 'auto',
      actions: [
        {
          type: 'create.habit',
          payload: { name: 'Meditate', freq: 'daily', spaceId: null },
        },
      ],
      confidence: 0.9,
      suggestions: [],
      explanation: 'On it!',
      // Simulate AI returning some junk tags mixed with good ones
      engineTags: ['#meditate', '#every', '#minutes', '#morning', '#mindfulness'],
    });

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, userInput);

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.type).toBe('habit');

    // Tags should be cleaned - no junk time/frequency words
    const tags = createCall.tags || [];

    // Should NOT include time/frequency junk words
    expect(tags).not.toContain('#every');
    expect(tags).not.toContain('#minutes');
    expect(tags).not.toContain('#morning'); // 'morning' is a time word
    expect(tags).not.toContain('#mins');
    expect(tags).not.toContain('#daily');
    expect(tags).not.toContain('#weekly');

    // Should still include meaningful tags
    expect(tags).toContain('#meditate');
    expect(tags).toContain('#mindfulness');
  });

  it('filters same junk words for both habits and todos', async () => {
    // Both todo and habit use the same filterAndNormalizeTags pipeline,
    // so we just verify that habits filter correctly (todos already tested elsewhere)
    mockDecideWithContext.mockResolvedValueOnce({
      mode: 'auto',
      actions: [
        {
          type: 'create.habit',
          payload: { name: 'Run', freq: 'daily', spaceId: null },
        },
      ],
      confidence: 0.9,
      suggestions: [],
      explanation: 'Got it!',
      engineTags: ['#running', '#every', '#minutes', '#fitness', '#daily', '#morning'],
    });

    render(<CatchAllNotepad />);

    const habitInput = screen.getByTestId('minddrop-input');
    fireEvent.changeText(habitInput, 'Run for 30 minutes every morning');

    const habitSubmit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(habitSubmit);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    const habitCall = mockCreate.mock.calls[0][0];
    const habitTags = habitCall.tags || [];

    // Should filter all common junk time/frequency words
    expect(habitTags).not.toContain('#every');
    expect(habitTags).not.toContain('#minutes');
    expect(habitTags).not.toContain('#morning');
    expect(habitTags).not.toContain('#daily');

    // Should keep meaningful tags
    expect(habitTags).toContain('#running');
    expect(habitTags).toContain('#fitness');
  });

  it('filters same junk words for todos as habits and notes', async () => {
    // Verify that todos use the same tag cleaning as habits and notes
    mockDecideWithContext.mockResolvedValueOnce({
      mode: 'auto',
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Buy running shoes', spaceId: null },
        },
      ],
      confidence: 0.9,
      suggestions: [],
      explanation: 'On it!',
      engineTags: ['#shopping', '#every', '#weekly', '#tomorrow', '#running'],
    });

    render(<CatchAllNotepad />);

    const todoInput = screen.getByTestId('minddrop-input');
    fireEvent.changeText(todoInput, 'Buy running shoes tomorrow for every weekly run');

    const todoSubmit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(todoSubmit);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    const todoCall = mockCreate.mock.calls[0][0];
    const todoTags = todoCall.tags || [];

    // Should filter all common junk time/frequency words
    expect(todoTags).not.toContain('#every');
    expect(todoTags).not.toContain('#weekly');
    expect(todoTags).not.toContain('#tomorrow');

    // Should keep meaningful tags
    expect(todoTags).toContain('#shopping');
    expect(todoTags).toContain('#running');

    // Verify it's a todo
    expect(todoCall.type).toBe('todo');
  });

  it('filters same junk words for unsorted notes as habits and todos', async () => {
    // Verify that unsorted/log notes use the same tag cleaning as habits and todos
    mockDecideWithContext.mockResolvedValueOnce({
      mode: 'auto',
      actions: [
        {
          type: 'create.note',
          payload: { text: 'Today I ran for 30 minutes', subtype: 'note', spaceId: null },
        },
      ],
      confidence: 0.85,
      suggestions: [],
      explanation: 'Noted!',
      engineTags: ['#running', '#every', '#minutes', '#today', '#fitness'],
    });

    render(<CatchAllNotepad />);

    const noteInput = screen.getByTestId('minddrop-input');
    fireEvent.changeText(noteInput, 'Today I ran for 30 minutes every morning');

    const noteSubmit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(noteSubmit);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    const noteCall = mockCreate.mock.calls[0][0];
    const noteTags = noteCall.tags || [];

    // Should filter same junk words as habits and todos
    expect(noteTags).not.toContain('#every');
    expect(noteTags).not.toContain('#minutes');
    expect(noteTags).not.toContain('#today'); // 'today' is also a stop word

    // Should keep meaningful tags
    expect(noteTags).toContain('#running');
    expect(noteTags).toContain('#fitness');

    // Verify the note has both title and body (log behavior)
    expect(noteCall.type).toBe('note');
    expect(noteCall.title).toBeTruthy();
    expect(noteCall.body).toBeTruthy();
  });
});
