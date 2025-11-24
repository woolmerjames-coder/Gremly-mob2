/**
 * Test: Recent Drops Deduplication by drop_id
 *
 * Verifies that when an unsorted note is converted to a habit/todo,
 * Recent drops shows only ONE item (the canonical habit/todo), not both.
 *
 * Scenario:
 * 1. User submits "Run every morning" via Mind Drop
 * 2. Provisional unsorted note created with drop_id="abc123"
 * 3. User clicks "Habit" chip
 * 4. Habit created with drop_id="abc123", note archived
 * 5. Recent drops should show ONLY the habit, not the archived note
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import type { Note, Habit, Todo } from '../lib/types';

// Mock AuthProvider
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    userId: undefined, // IMPORTANT: Disable Supabase subscriptions in tests
  }),
}));

// Mock repo
const mockNotesList = jest.fn();
const mockTodosList = jest.fn();
const mockHabitsList = jest.fn();

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    notes: { list: mockNotesList },
    todos: { list: mockTodosList },
    habits: { list: mockHabitsList },
  }),
}));

import { RecentDropsTestable as RecentDrops } from '../app/screens/CatchAllNotepad';

describe('RecentDrops - Deduplication by drop_id', () => {
  const overlayStub = {
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    close: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);
  });

  it('should show only habit when unsorted note is converted to habit (same drop_id)', async () => {
    const dropId = 'drop-abc123';
    const createdAt = new Date().toISOString();

    // Simulate: unsorted note archived after conversion
    const archivedNote: Note = {
      id: 'note-1',
      type: 'note',
      title: 'Run every morning',
      body: 'Run every morning, even if just for 5 mins',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      ai_placed: true,
      archived: true, // Archived after conversion
      drop_id: dropId,
      created_at: createdAt,
      updated_at: createdAt,
      tags: ['#morning', '#running'],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    // Habit created from conversion with same drop_id
    const habit: Habit = {
      id: 'habit-1',
      type: 'habit',
      name: 'Run every morning, even if just for 5 mins',
      frequency: 'daily',
      notes: 'Run every morning, even if just for 5 mins',
      origin: 'catchall',
      canonicalType: 'habit',
      labels: ['habit'],
      drop_id: dropId, // Same drop_id as note
      created_at: createdAt,
      updated_at: createdAt,
      tags: ['#morning', '#running'],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    // Mock repo to return both items
    mockNotesList.mockResolvedValue([archivedNote]);
    mockHabitsList.mockResolvedValue([habit]);

    const { queryByText, getByText } = render(
      <RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />,
    );

    await waitFor(() => {
      // Should show the habit
      expect(getByText(/Run every morning/i)).toBeTruthy();
    });

    // The key test: archived note should NOT appear
    // Because we filter archived=true in the load function
    // And we dedupe by drop_id, preferring habit over note
  });

  it('should show only todo when unsorted note is converted to todo (same drop_id)', async () => {
    const dropId = 'drop-xyz789';
    const createdAt = new Date().toISOString();

    // Archived unsorted note
    const archivedNote: Note = {
      id: 'note-2',
      type: 'note',
      title: 'Buy groceries tomorrow',
      body: 'Buy groceries tomorrow',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      archived: true,
      drop_id: dropId,
      created_at: createdAt,
      updated_at: createdAt,
      tags: [],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    // Todo created from conversion
    const todo: Todo = {
      id: 'todo-1',
      type: 'todo',
      name: 'Buy groceries tomorrow',
      origin: 'catchall',
      canonicalType: 'todo',
      labels: ['todo'],
      drop_id: dropId, // Same drop_id
      created_at: createdAt,
      updated_at: createdAt,
      tags: [],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    mockNotesList.mockResolvedValue([archivedNote]);
    mockTodosList.mockResolvedValue([todo]);

    const { getByText } = render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => {
      expect(getByText(/Buy groceries/i)).toBeTruthy();
    });
  });

  it('should prefer habit over unsorted note when both exist with same drop_id', async () => {
    const dropId = 'drop-priority-test';
    const createdAt = new Date().toISOString();

    // Non-archived unsorted note (edge case: conversion didn't archive it)
    const unsortedNote: Note = {
      id: 'note-3',
      type: 'note',
      title: 'Meditate daily',
      body: 'Meditate daily',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      archived: false, // Not archived for some reason
      drop_id: dropId,
      created_at: createdAt,
      updated_at: createdAt,
      tags: [],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    // Habit with same drop_id
    const habit: Habit = {
      id: 'habit-2',
      type: 'habit',
      name: 'Meditate daily',
      frequency: 'daily',
      origin: 'catchall',
      canonicalType: 'habit',
      labels: ['habit'],
      drop_id: dropId,
      created_at: createdAt,
      updated_at: createdAt,
      tags: [],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    mockNotesList.mockResolvedValue([unsortedNote]);
    mockHabitsList.mockResolvedValue([habit]);

    const { queryByText } = render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => {
      expect(queryByText(/Meditate daily/i)).toBeTruthy();
    });

    // Deduplication logic should prefer the habit over the unsorted note
    // even if the note isn't archived (defensive programming)
  });

  it('should show multiple items when they have different drop_ids', async () => {
    const createdAt = new Date().toISOString();

    const habit1: Habit = {
      id: 'habit-3',
      type: 'habit',
      name: 'Exercise',
      frequency: 'daily',
      origin: 'catchall',
      drop_id: 'drop-1',
      created_at: createdAt,
      updated_at: createdAt,
      tags: [],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    const habit2: Habit = {
      id: 'habit-4',
      type: 'habit',
      name: 'Read',
      frequency: 'daily',
      origin: 'catchall',
      drop_id: 'drop-2', // Different drop_id
      created_at: createdAt,
      updated_at: createdAt,
      tags: [],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    mockHabitsList.mockResolvedValue([habit1, habit2]);

    const { getByText } = render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => {
      expect(getByText(/Exercise/i)).toBeTruthy();
      expect(getByText(/Read/i)).toBeTruthy();
    });
  });

  it('should handle items without drop_id gracefully', async () => {
    const createdAt = new Date().toISOString();

    const habitWithoutDropId: Habit = {
      id: 'habit-5',
      type: 'habit',
      name: 'Legacy habit',
      frequency: 'daily',
      origin: 'catchall',
      drop_id: null, // No drop_id
      created_at: createdAt,
      updated_at: createdAt,
      tags: [],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    mockHabitsList.mockResolvedValue([habitWithoutDropId]);

    const { getByText } = render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => {
      expect(getByText(/Legacy habit/i)).toBeTruthy();
    });
  });

  /**
   * REGRESSION TEST: Ensures we never show both archived unsorted and converted habit
   *
   * This test prevents the bug where after converting an unsorted note → habit,
   * both entries would appear in Recent drops list.
   *
   * Scenario:
   * - User enters "Run every morning" via Mind Drop
   * - System creates unsorted note with drop_id="DROP_X"
   * - User clicks "Habit" category chip
   * - System creates habit with drop_id="DROP_X", archives note
   * - Recent drops should show ONLY habit (not archived note)
   * - "Thoughts organized today" count should be 1 (not 2)
   */
  it('hides archived unsorted drops once converted to habit', async () => {
    const dropId = 'DROP_X';
    const today = new Date();
    const createdAt = today.toISOString();

    // Archived unsorted note (should NOT appear in list)
    const archivedUnsorted: Note = {
      id: 'note-unsorted-1',
      type: 'note',
      title: 'Run every morning',
      body: 'Run every morning, even if just for 5 mins',
      subtype: 'catchall',
      labels: ['catchall', 'needs_review'],
      origin: 'catchall',
      ai_placed: true,
      archived: true, // ✅ CRITICAL: Archived after conversion
      drop_id: dropId,
      created_at: createdAt,
      updated_at: createdAt,
      tags: ['#running', '#morning'],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    // Canonical habit (SHOULD appear in list)
    const habit: Habit = {
      id: 'habit-converted-1',
      type: 'habit',
      name: 'Run every morning, even if just for 5 mins', // This is what shows in UI
      frequency: 'daily',
      notes: 'Run every morning, even if just for 5 mins',
      origin: 'catchall',
      canonicalType: 'habit',
      labels: ['habit'],
      drop_id: dropId, // ✅ CRITICAL: Same drop_id as archived note
      created_at: createdAt,
      updated_at: createdAt,
      tags: ['#running', '#morning'],
      tags_meta: { sticky: [], tombstones: [] },
    } as any;

    mockNotesList.mockResolvedValue([archivedUnsorted]);
    mockHabitsList.mockResolvedValue([habit]);
    mockTodosList.mockResolvedValue([]);

    const { getByText, queryByText, getAllByText } = render(
      <RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />,
    );

    await waitFor(() => {
      // ✅ ASSERT: Habit is visible (using the name field which becomes title in UI)
      expect(getByText(/Run every morning/i)).toBeTruthy();
    });

    // ✅ ASSERT: Only ONE item for this drop_id (not both habit + unsorted)
    // The habit text should appear exactly once
    const habitMatches = getAllByText(/Run every morning/i);
    expect(habitMatches).toHaveLength(1);

    // ✅ ASSERT: No "unsorted" type visible for this drop_id
    // The archived note should not appear at all
    const archivedNoteTitle = queryByText(/^Run every morning$/);
    expect(archivedNoteTitle).toBeNull();

    // NOTE: "Thoughts organized today" count is tested in the main CatchAllNotepad tests
    // This component (RecentDrops) only tests the list deduplication logic
  });
});
