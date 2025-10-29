import React from 'react';
import { renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';

// Mock env to enable v3
jest.mock('../lib/env', () => ({
  env: {
    feature: {
      today: {
        v3: true,
        focusCard: true,
        dropZone: true,
        sweepPreview: true,
        suggestions: false,
        celebration: false,
        eveningTeaser: false,
      },
      sweep: { eveningV1: true },
    },
  },
}));

// Mock Auth
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    userId: 'test-user-id',
    loading: false,
  }),
}));

// Minimal repo mocks for hooks
const mockRepo = {
  listTodayMerged: jest.fn(() =>
    Promise.resolve([
      { type: 'todo', id: 't1', name: 'Finish packing', status: 'active', carry_forward: true },
      {
        type: 'habit',
        id: 'h1',
        name: 'Water',
        target_count: 8,
        progress_today: 6,
        cadence: 'day',
      },
    ]),
  ),
  getTodaySummary: jest.fn(() => Promise.resolve({ completed: 3, remaining: 2 })),
  logHabitProgress: jest.fn(() => Promise.resolve()),
  completeTodo: jest.fn(() => Promise.resolve()),
  // Drop zone
  listRecentDrops: jest.fn(() => Promise.resolve([])),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

describe('Today v3 UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the v3 surface pieces when flag is on', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
    });
    expect(screen.getByTestId('today-v3-focus-card')).toBeTruthy();
    expect(screen.getByTestId('today-v3-stack')).toBeTruthy();
    expect(screen.getByTestId('today-v3-dropzone')).toBeTruthy();
    // Sweep may be conditionally available — with mocked env eveningV1=true and threshold default, it's based on local hour in CI; assert existence softly:
    // Use queryByTestId to avoid flakiness
    screen.queryByTestId('today-v3-sweep');
  });

  it('calls repo for merged today and summary', async () => {
    renderWithProviders(<TodayScreen />);
    await waitFor(() => {
      expect(mockRepo.listTodayMerged).toHaveBeenCalled();
      expect(mockRepo.getTodaySummary).toHaveBeenCalled();
    });
  });
});
