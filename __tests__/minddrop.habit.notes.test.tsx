/**
 * Test: Mind Drop habit creation stores full raw text in notes field
 * Test: Mind Drop habit tags are properly cleaned (no junk time/frequency words)
 *
 * DEPRECATED: These tests were designed for the legacy Mind Drop pipeline that used:
 * - CortexProvider's decideWithContext
 * - Category chips for user disambiguation
 * - convertUnsortedToHabit/convertUnsortedToTodo conversion helpers
 *
 * With FEATURE_FLAGS.MIND_DROP_V4_ENABLED = true (now the default), the pipeline:
 * - Uses runPhase1 for classification (no category chips)
 * - Creates entities directly via useMindDropSubmit hook
 * - Tags are applied in Phase 2 background enrichment
 *
 * These tests are skipped until they can be rewritten for the V4 pipeline.
 * For V4 tag handling, see:
 * - __tests__/lib/minddrop/phase2.test.ts
 * - lib/tags/quality.ts (applyTagQualityFilter)
 */

describe.skip('Mind Drop habit tag cleanup (DEPRECATED - V4 is now default)', () => {
  it('placeholder', () => {
    expect(true).toBe(true);
  });
});

/*
 * Original test file preserved below for reference when rewriting for V4
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { applyTagQualityFilter } from '../lib/tags/quality';

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
      addListener: jest.fn(() => jest.fn()),
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
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// Mock Repo
const mockCreate = jest.fn();
const mockGetById = jest.fn();
const mockUpdate = jest.fn();

// Mock conversion helpers
const mockConvertUnsortedToHabit = jest.fn();
const mockConvertUnsortedToTodo = jest.fn();

jest.mock('../lib/conversion', () => {
  const actual = jest.requireActual('../lib/conversion');
  return {
    ...actual,
    convertUnsortedToHabit: (...args: any[]) => mockConvertUnsortedToHabit(...args),
    convertUnsortedToTodo: (...args: any[]) => mockConvertUnsortedToTodo(...args),
  };
});

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    getById: mockGetById,
    update: mockUpdate,
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
    // Pipeline idempotency check methods
    findTodoByDropId: jest.fn().mockResolvedValue(null),
    findHabitByDropId: jest.fn().mockResolvedValue(null),
  }),
}));

// Component under test
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();

  // Setup default mock for 'ask' mode with habit chip suggestion
  mockDecideWithContext.mockResolvedValue({
    mode: 'ask',
    confidence: 0.7,
    actions: [],
    suggestions: [
      {
        type: 'create.habit',
        label: 'Make it a Habit',
        payload: { name: 'Exercise daily', freq: 'daily', spaceId: null },
      },
    ],
    explanation: 'Would you like to make this a habit?',
  });

  // Setup conversion helper mock
  mockConvertUnsortedToHabit.mockImplementation(async (repo, noteId, options) => {
    const note = await repo.getById(noteId);
    const habitId = `habit-${noteId.replace('note-', '')}`;

    // Apply tag quality filter (Phase 4A behavior)
    const rawTags = note?.tags || [];
    const cleanedTags = applyTagQualityFilter(rawTags);

    const createdHabit = {
      id: habitId,
      type: 'habit',
      name: note?.body || 'Untitled',
      notes: note?.body, // Preserve full text in notes field
      frequency: options?.frequency || 'daily',
      labels: ['habit'],
      tags: cleanedTags, // Use cleaned tags
    };

    await repo.create(createdHabit);
    await repo.update(noteId, { labels: ['archived'] });

    return { habit: createdHabit, updatedNote: { ...note, labels: ['archived'] } };
  });

  mockConvertUnsortedToTodo.mockImplementation(async (repo, noteId, options) => {
    const note = await repo.getById(noteId);
    const todoId = `todo-${noteId.replace('note-', '')}`;

    // Apply tag quality filter (Phase 4A behavior)
    const rawTags = note?.tags || [];
    const cleanedTags = applyTagQualityFilter(rawTags);

    const createdTodo = {
      id: todoId,
      type: 'todo',
      name: note?.body || 'Untitled',
      body: note?.body,
      labels: ['todo'],
      tags: cleanedTags, // Use cleaned tags
    };

    await repo.create(createdTodo);
    await repo.update(noteId, { labels: ['archived'] });

    return { todo: createdTodo, updatedNote: { ...note, labels: ['archived'] } };
  });

  // Setup provisional note creation
  mockCreate.mockImplementation(async (payload) => {
    const id =
      payload.type === 'habit' ? 'habit-123' : payload.type === 'todo' ? 'todo-123' : 'note-123';
    return { id, ...payload };
  });

  mockGetById.mockResolvedValue({
    id: 'note-123',
    type: 'note',
    body: 'Test input',
    labels: ['needs_review'],
    tags: [],
  });

  mockUpdate.mockResolvedValue({ id: 'note-123' });
});

describe.skip('Mind Drop habit notes field (DEPRECATED - V4 is now default)', () => {
  it('stores full raw Mind Drop text in notes field when creating habit', async () => {
    const userInput = 'I want to start running every morning at 6am';

    // Setup provisional note with user's input
    mockGetById.mockResolvedValue({
      id: 'note-123',
      type: 'note',
      body: userInput,
      labels: ['needs_review'],
      tags: [],
    });

    render(<CatchAllNotepad />);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, userInput);

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    // Wait for category chips to appear
    const habitChip = await screen.findByTestId('minddrop-category-habit', {}, { timeout: 3000 });
    fireEvent.press(habitChip);

    // Wait for conversion to complete
    await waitFor(() => {
      expect(mockConvertUnsortedToHabit).toHaveBeenCalled();
    });

    // Verify repo.create was called with notes field containing raw user input
    // The second call (index 1) should be the habit creation
    const habitCreateCall = mockCreate.mock.calls.find((call: any[]) => call[0]?.type === 'habit');
    expect(habitCreateCall).toBeDefined();
    expect(habitCreateCall[0]).toEqual(
      expect.objectContaining({
        type: 'habit',
        notes: userInput, // Full raw text should be stored in notes field
      }),
    );
  });

  it('preserves full text even when AI suggests shorter name', async () => {
    const userInput =
      'Start a daily meditation practice for 10 minutes each morning to reduce stress';

    // Setup provisional note with full user input
    mockGetById.mockResolvedValue({
      id: 'note-456',
      type: 'note',
      body: userInput,
      labels: ['needs_review'],
      tags: [],
    });

    // AI suggests habit with shorter name, but full text should be in notes
    mockDecideWithContext.mockResolvedValueOnce({
      mode: 'ask',
      confidence: 0.75,
      actions: [],
      suggestions: [
        {
          type: 'create.habit',
          label: 'Make it a Habit',
          payload: { name: 'Meditate daily', freq: 'daily', spaceId: null }, // Shorter AI name
        },
      ],
      explanation: 'Got it!',
    });

    render(<CatchAllNotepad />);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, userInput);

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    // Wait for category chips and click habit chip
    const habitChip = await screen.findByTestId('minddrop-category-habit', {}, { timeout: 3000 });
    fireEvent.press(habitChip);

    await waitFor(() => {
      expect(mockConvertUnsortedToHabit).toHaveBeenCalled();
    });

    const habitCreateCall = mockCreate.mock.calls.find((call: any[]) => call[0]?.type === 'habit');
    expect(habitCreateCall).toBeDefined();
    expect(habitCreateCall[0].type).toBe('habit');
    expect(habitCreateCall[0].notes).toBe(userInput); // Full original text in notes
  });
});

describe.skip('Mind Drop habit tag cleanup (DEPRECATED - V4 is now default)', () => {
  it('filters out junk time/frequency words from habit tags', async () => {
    const userInput = 'Meditate for 10 minutes every morning';

    // Setup provisional note with AI tags including junk words
    mockGetById.mockResolvedValue({
      id: 'note-789',
      type: 'note',
      body: userInput,
      labels: ['needs_review'],
      tags: ['#meditate', '#every', '#minutes', '#morning', '#mindfulness'], // Mix of good and junk
    });

    // Mock Cortex to suggest habit with junk tags
    mockDecideWithContext.mockResolvedValueOnce({
      mode: 'ask',
      confidence: 0.7,
      actions: [],
      suggestions: [
        {
          type: 'create.habit',
          label: 'Make it a Habit',
          payload: { name: 'Meditate', freq: 'daily', spaceId: null },
        },
      ],
      explanation: 'On it!',
      engineTags: ['#meditate', '#every', '#minutes', '#morning', '#mindfulness'],
    });

    render(<CatchAllNotepad />);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, userInput);

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    // Wait for category chips and click habit chip
    const habitChip = await screen.findByTestId('minddrop-category-habit', {}, { timeout: 3000 });
    fireEvent.press(habitChip);

    await waitFor(() => {
      expect(mockConvertUnsortedToHabit).toHaveBeenCalled();
    });

    const habitCreateCall = mockCreate.mock.calls.find((call: any[]) => call[0]?.type === 'habit');
    expect(habitCreateCall).toBeDefined();
    expect(habitCreateCall[0].type).toBe('habit');

    // Tags should be cleaned - no junk time/frequency words per Phase 4A quality filter
    const tags = habitCreateCall[0].tags || [];

    // Should NOT include time/frequency junk words (per LOW_QUALITY_TAGS in lib/tags/quality.ts)
    expect(tags).not.toContain('#every');
    expect(tags).not.toContain('#morning'); // 'morning' is in LOW_QUALITY_TAGS
    expect(tags).not.toContain('#daily');
    expect(tags).not.toContain('#weekly');

    // Note: #minutes is NOT filtered by Phase 4A (it's a meaningful descriptor, e.g. "10 minutes")
    // Only generic time words like "every", "morning", "daily" are filtered

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
    const userInput = 'Buy running shoes tomorrow for every weekly run';

    // Setup provisional note with AI tags including junk words
    mockGetById.mockResolvedValue({
      id: 'note-todo-1',
      type: 'note',
      body: userInput,
      labels: ['needs_review'],
      tags: ['#shopping', '#every', '#weekly', '#tomorrow', '#running'],
    });

    // Verify that todos use the same tag cleaning as habits and notes
    mockDecideWithContext.mockResolvedValueOnce({
      mode: 'ask',
      confidence: 0.7,
      actions: [],
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add to To-Do List',
          payload: { title: 'Buy running shoes', spaceId: null },
        },
      ],
      explanation: 'On it!',
      engineTags: ['#shopping', '#every', '#weekly', '#tomorrow', '#running'],
    });

    render(<CatchAllNotepad />);

    const todoInput = screen.getByTestId('minddrop-input');
    fireEvent.changeText(todoInput, userInput);

    const todoSubmit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(todoSubmit);

    // Wait for category chips and click todo chip
    const todoChip = await screen.findByTestId('minddrop-category-todo', {}, { timeout: 3000 });
    fireEvent.press(todoChip);

    await waitFor(() => {
      expect(mockConvertUnsortedToTodo).toHaveBeenCalled();
    });

    const todoCreateCall = mockCreate.mock.calls.find((call: any[]) => call[0]?.type === 'todo');
    expect(todoCreateCall).toBeDefined();

    const todoCall = todoCreateCall[0];
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
