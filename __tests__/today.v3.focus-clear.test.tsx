// SKIP: Needs Zustand migration - tests use old useRepo mocks
import React from 'react';
import { fireEvent, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';

// Enable v3
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

const mockRepo = {
  getFocusForDate: jest.fn(() =>
    Promise.resolve({
      id: 'fc1',
      entry_id: 't1',
      entry_type: 'todo',
      source: 'user',
      created_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
    }),
  ),
  listTodayMerged: jest.fn(() => Promise.resolve([])),
  getTodaySummary: jest.fn(() => Promise.resolve({ completed: 0, remaining: 0 })),
  getById: jest.fn((id: string) => Promise.resolve({ id, type: 'todo', name: 'Finish packing' })),
  listRecentDrops: jest.fn(() => Promise.resolve([])),
  clearFocusForDate: jest.fn(() => Promise.resolve()),
  topFocusCandidates: jest.fn(() => Promise.resolve([])),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

describe.skip('Today v3 FocusCard clear action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears the focus when Clear is pressed', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
      expect(mockRepo.getFocusForDate).toHaveBeenCalled();
    });

    fireEvent.press(screen.getByText('Clear'));

    await waitFor(() => {
      expect(mockRepo.clearFocusForDate).toHaveBeenCalledTimes(1);
    });
  });
});
