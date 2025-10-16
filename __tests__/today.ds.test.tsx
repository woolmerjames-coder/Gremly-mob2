/**
 * Today DS Screen Tests
 *
 * Tests for the Design System version of Today screen (/app/tabs/TodayScreen.tsx)
 * Verifies testIDs, habit/todo sections, empty states, and data loading
 */

import React from 'react';
import { renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';

// Mock the repo to return controlled test data
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    listDueToday: jest.fn(() =>
      Promise.resolve([
        {
          id: 'habit-1',
          type: 'habit',
          title: 'Morning Workout',
          frequency: 'daily',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'habit-2',
          type: 'habit',
          title: 'Read 30 minutes',
          frequency: 'daily',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'todo-1',
          type: 'todo',
          title: 'Submit report',
          body: 'Q4 financial report',
          due_date: '2025-01-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'todo-2',
          type: 'todo',
          title: 'Buy groceries',
          due_date: '2025-01-15',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ]),
    ),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  }),
}));

describe('Today DS Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders today screen with correct testID', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-screen')).toBeTruthy();
    });
  });

  it('displays habits section with correct testIDs', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-habit-habit-1')).toBeTruthy();
      expect(screen.getByTestId('today-habit-habit-2')).toBeTruthy();
    });
  });

  it('displays todos section with correct testIDs', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-todo-todo-1')).toBeTruthy();
      expect(screen.getByTestId('today-todo-todo-2')).toBeTruthy();
    });
  });

  it('displays habit and todo titles correctly', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByText('Morning Workout')).toBeTruthy();
      expect(screen.getByText('Read 30 minutes')).toBeTruthy();
      expect(screen.getByText('Submit report')).toBeTruthy();
      expect(screen.getByText('Buy groceries')).toBeTruthy();
    });
  });

  it('shows DS marker in dev mode', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('ds-marker')).toBeTruthy();
      expect(screen.getByText('DS')).toBeTruthy();
    });
  });
});

describe('Today DS Screen - Empty State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state when no items due today', async () => {
    // Override mock to return empty array
    jest.spyOn(require('../providers/RepoProvider'), 'useRepo').mockReturnValue({
      listDueToday: jest.fn(() => Promise.resolve([])),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    });

    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByText(/you're all set/i)).toBeTruthy();
      expect(screen.getByTestId('today-empty-add')).toBeTruthy();
    });
  });
});
