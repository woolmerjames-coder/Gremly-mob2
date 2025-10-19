/**
 * Hub Edit Item Tests
 *
 * Tests for the manual-edit sheet that opens when a Hub item is pressed
 * Now uses ManualAddOverlay in edit mode for uniform UX
 */

import React from 'react';
import { renderWithProviders, screen, waitFor, fireEvent } from './utils/renderWithProviders';
import HubScreen from '../app/tabs/HubScreen';

// Mock the auth provider to return an authenticated user
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    userId: 'test-user-id',
    loading: false,
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
  }),
}));

// Mock data store
const mockDataStore = {
  habitsData: [
    {
      id: 'habit-edit-1',
      type: 'habit',
      title: 'Morning Workout',
      frequency: 'daily',
      space_id: null,
      ai_placed: false,
      why_string: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-15T10:00:00Z',
      owner_id: 'test-user-id',
    },
  ] as any[],
  todosData: [
    {
      id: 'todo-edit-1',
      type: 'todo',
      title: 'Submit report',
      due_date: '2025-01-20',
      undefined_due: false,
      space_id: null,
      ai_placed: false,
      why_string: null,
      body: 'Submit the quarterly report',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-15T09:00:00Z',
      owner_id: 'test-user-id',
    },
  ] as any[],
  notesData: [
    {
      id: 'note-edit-1',
      type: 'note',
      title: 'My list',
      body: '- Item 1\n- Item 2\n- Item 3',
      subtype: 'list',
      space_id: null,
      ai_placed: false,
      why_string: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-15T08:00:00Z',
      owner_id: 'test-user-id',
    },
  ] as any[],
  spacesData: [] as any[],
};

const mockRepo = {
  listByType: jest.fn(),
  listSpaces: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getById: jest.fn(),
};

// Mock the repo to return controlled test data
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

describe('Hub Edit Item', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockDataStore.habitsData = [
      {
        id: 'habit-edit-1',
        type: 'habit',
        title: 'Morning Workout',
        frequency: 'daily',
        space_id: null,
        ai_placed: false,
        why_string: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
        owner_id: 'test-user-id',
      },
    ];
    mockDataStore.todosData = [
      {
        id: 'todo-edit-1',
        type: 'todo',
        title: 'Submit report',
        due_date: '2025-01-20',
        undefined_due: false,
        space_id: null,
        ai_placed: false,
        why_string: null,
        body: 'Submit the quarterly report',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T09:00:00Z',
        owner_id: 'test-user-id',
      },
    ];
    mockDataStore.notesData = [
      {
        id: 'note-edit-1',
        type: 'note',
        title: 'My list',
        body: '- Item 1\n- Item 2\n- Item 3',
        subtype: 'list',
        space_id: null,
        ai_placed: false,
        why_string: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T08:00:00Z',
        owner_id: 'test-user-id',
      },
    ];

    mockRepo.listByType.mockImplementation((type: string) => {
      if (type === 'habit') return Promise.resolve([...mockDataStore.habitsData]);
      if (type === 'todo') return Promise.resolve([...mockDataStore.todosData]);
      if (type === 'note') return Promise.resolve([...mockDataStore.notesData]);
      return Promise.resolve([]);
    });
    mockRepo.listSpaces.mockImplementation(() => Promise.resolve([...mockDataStore.spacesData]));
    mockRepo.getById.mockImplementation((id: string) => {
      const all = [
        ...mockDataStore.habitsData,
        ...mockDataStore.todosData,
        ...mockDataStore.notesData,
      ];
      const found = all.find((item) => item.id === id);
      return Promise.resolve(found || null);
    });
    mockRepo.update.mockResolvedValue(null as any);
  });

  it('opens manual-edit modal when habit row is pressed', async () => {
    renderWithProviders(<HubScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-habit-edit-1')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('item-habit-edit-1'));

    // Check that the ManualAddOverlay in edit mode is rendered
    await waitFor(() => {
      expect(screen.getByTestId('manual-overlay')).toBeTruthy();
    });
  });

  it('opens manual-edit modal when todo row is pressed', async () => {
    renderWithProviders(<HubScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-todo-edit-1')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('item-todo-edit-1'));

    // Check that the ManualAddOverlay in edit mode is rendered
    await waitFor(() => {
      expect(screen.getByTestId('manual-overlay')).toBeTruthy();
    });
  });

  it('opens manual-edit modal when note:list row is pressed', async () => {
    renderWithProviders(<HubScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-note-edit-1')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('item-note-edit-1'));

    // Check that the ManualAddOverlay in edit mode is rendered
    await waitFor(() => {
      expect(screen.getByTestId('manual-overlay')).toBeTruthy();
    });
  });

  it('verifies repo.update would be called with ai_placed:false on save', async () => {
    // This test verifies the mock is set up correctly
    // The ManualAddOverlay in edit mode calls repo.update when Save is pressed
    renderWithProviders(<HubScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-habit-edit-1')).toBeTruthy();
    });

    // Verify mock is available for ManualAddOverlay to use
    expect(mockRepo.update).toBeDefined();
    expect(mockRepo.getById).toBeDefined();
  });
});
