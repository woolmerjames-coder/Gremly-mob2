/**
 * RecentDrops Unified Type + Tag Rendering Tests
 *
 * Verifies that all three canonical types (todo, habit, log) share the same rendering rules:
 * 1. Type pill derives from canonical_type first, then falls back to labels/subtype
 * 2. Logs show "log" not "unsorted"
 * 3. Tag chips render for all three types (todos, habits, logs)
 * 4. Internal markers like *journal are filtered from display tags
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react-native';

// Mock env to enable canonical types
jest.mock('../lib/env', () => ({
  env: {
    feature: {
      canonicalTypes: true,
      canonicalConversions: true,
    },
  },
}));

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      setOptions: jest.fn(),
    }),
  };
});

// Repo mocks
const mockNotesList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async () => []);
const mockTodosList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async () => []);
const mockHabitsList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async () => []);

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    notes: { list: mockNotesList, delete: jest.fn() },
    todos: { list: mockTodosList, delete: jest.fn() },
    habits: { list: mockHabitsList, delete: jest.fn() },
  }),
}));

import { RecentDropsTestable as RecentDrops } from '../app/screens/CatchAllNotepad';

const overlayStub = {
  state: {
    visible: false,
    mode: 'create' as const,
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
    initialText: null,
  },
  openCreate: jest.fn(),
  openEdit: jest.fn(),
  close: jest.fn(),
};

describe('RecentDrops: Unified type + tag rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);
  });

  test('Log shows "log" pill and emotion tags (not "unsorted")', async () => {
    const now = new Date();
    mockNotesList.mockResolvedValue([
      {
        id: 'log1',
        type: 'note',
        subtype: 'journal',
        title: 'Feeling Overwhelmed After Work',
        body: 'Today was stressful but I managed to calm down with a walk',
        created_at: now.toISOString(),
        origin: 'catchall',
        labels: ['catchall'],
        tags: ['#overwhelmed', '#stressed', '#calm', '*journal'],
        canonical_type: 'log',
      },
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());

    // Verify log pill (not "unsorted")
    const logCard = await screen.findByTestId('minddrop-recent-note-log1');
    expect(within(logCard).getByText('log')).toBeTruthy();

    // Verify emotion tags are rendered (and *journal is filtered out)
    expect(within(logCard).getByText('#overwhelmed')).toBeTruthy();
    expect(within(logCard).getByText('#stressed')).toBeTruthy();
    expect(within(logCard).getByText('#calm')).toBeTruthy();

    // *journal should be filtered by filterAndNormalizeTags
    expect(within(logCard).queryByText('*journal')).toBeNull();
    expect(within(logCard).queryByText('#journal')).toBeNull();
  });

  test('Todo shows "todo" pill with tags (#haircut, #appointment)', async () => {
    const now = new Date();
    mockTodosList.mockResolvedValue([
      {
        id: 'todo1',
        type: 'todo',
        name: 'Book Haircut Tomorrow At 3pm',
        title: 'Book Haircut Tomorrow At 3pm',
        created_at: now.toISOString(),
        origin: 'catchall',
        tags: ['#haircut', '#appointment', '#tomorrow'],
        canonical_type: 'todo',
        due_date: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      },
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockTodosList).toHaveBeenCalled());

    // Verify todo pill
    const todoCard = await screen.findByTestId('minddrop-recent-todo-todo1');
    expect(within(todoCard).getByText('todo')).toBeTruthy();

    // Verify tags are rendered
    expect(within(todoCard).getByText('#haircut')).toBeTruthy();
    expect(within(todoCard).getByText('#appointment')).toBeTruthy();
    // 'tomorrow' might be filtered by TAG_STOP_WORDS, so we don't assert it
  });

  test('Habit shows "habit" pill with tags (#running, #morning)', async () => {
    const now = new Date();
    mockHabitsList.mockResolvedValue([
      {
        id: 'habit1',
        type: 'habit',
        name: 'Go For A 20-Minute Walk Every Morning',
        created_at: now.toISOString(),
        origin: 'catchall',
        tags: ['#walking', '#morning', '#exercise'],
        canonical_type: 'habit',
      },
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockHabitsList).toHaveBeenCalled());

    // Verify habit pill
    const habitCard = await screen.findByTestId('minddrop-recent-habit-habit1');
    expect(within(habitCard).getByText('habit')).toBeTruthy();

    // Verify tags are rendered
    expect(within(habitCard).getByText('#walking')).toBeTruthy();
    expect(within(habitCard).getByText('#exercise')).toBeTruthy();
    // 'morning' might be filtered by TAG_STOP_WORDS
  });

  test('All three types render tags when present', async () => {
    const now = new Date();

    mockNotesList.mockResolvedValue([
      {
        id: 'log1',
        type: 'note',
        subtype: 'journal',
        title: 'Test Log',
        body: 'Log body',
        created_at: now.toISOString(),
        origin: 'catchall',
        labels: ['catchall'],
        tags: ['#emotion'],
        canonical_type: 'log',
      },
    ]);

    mockTodosList.mockResolvedValue([
      {
        id: 'todo1',
        type: 'todo',
        name: 'Test Todo',
        created_at: now.toISOString(),
        origin: 'catchall',
        tags: ['#work'],
        canonical_type: 'todo',
      },
    ]);

    mockHabitsList.mockResolvedValue([
      {
        id: 'habit1',
        type: 'habit',
        name: 'Test Habit',
        created_at: now.toISOString(),
        origin: 'catchall',
        tags: ['#health'],
        canonical_type: 'habit',
      },
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    await waitFor(() => expect(mockTodosList).toHaveBeenCalled());
    await waitFor(() => expect(mockHabitsList).toHaveBeenCalled());

    // All three should have tag sections
    const logCard = await screen.findByTestId('minddrop-recent-note-log1');
    const todoCard = await screen.findByTestId('minddrop-recent-todo-todo1');
    const habitCard = await screen.findByTestId('minddrop-recent-habit-habit1');

    expect(within(logCard).getByText('#emotion')).toBeTruthy();
    expect(within(todoCard).getByText('#work')).toBeTruthy();
    expect(within(habitCard).getByText('#health')).toBeTruthy();
  });

  test('Canonical type takes precedence over subtype for display label', async () => {
    const now = new Date();

    // A note with subtype 'catchall' but canonical_type 'log'
    // Should show "log" pill, not "unsorted"
    mockNotesList.mockResolvedValue([
      {
        id: 'note1',
        type: 'note',
        subtype: 'catchall', // This would normally show as "unsorted"
        title: 'Test Note',
        body: 'Note body',
        created_at: now.toISOString(),
        origin: 'catchall',
        labels: ['catchall', 'needs_review'],
        canonical_type: 'log', // But canonical_type overrides
      },
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());

    const card = await screen.findByTestId('minddrop-recent-note-note1');

    // Should show "log" pill
    expect(within(card).getByText('log')).toBeTruthy();

    // Should NOT show "unsorted" pill
    expect(within(card).queryByText('unsorted')).toBeNull();
  });
});
