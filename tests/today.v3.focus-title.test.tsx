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

// Repo mock returns a focus set to todo t1 and resolves its title
const repoMock = {
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
  // Hooks use listTodayMerged/summary too; keep basic results
  listTodayMerged: jest.fn(() => Promise.resolve([])),
  getTodaySummary: jest.fn(() => Promise.resolve({ completed: 0, remaining: 0 })),
  getById: jest.fn((id: string) => Promise.resolve({ id, type: 'todo', name: 'Finish packing' })),
  listRecentDrops: jest.fn(() => Promise.resolve([])),
  clearFocusForDate: jest.fn(() => Promise.resolve()),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => repoMock,
}));

describe('Today v3 FocusCard title & clear action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows focus item title and clears focus when Clear is pressed', async () => {
    renderWithProviders(<TodayScreen />);

    // Screen renders
    await waitFor(() => {
      expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
    });

    // Title appears
    await waitFor(() => {
      const focus = screen.getByText(/finish packing/i);
      expect(focus).toBeTruthy();
    });

    // Press Clear link
    fireEvent.press(screen.getByText('Clear'));

    await waitFor(() => {
      expect(repoMock.clearFocusForDate).toHaveBeenCalled();
    });
  });
});
