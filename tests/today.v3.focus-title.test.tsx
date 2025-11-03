import React from 'react';
import { fireEvent, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';
import type { IRepo } from '../lib/repo/IRepo';

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

// Wire providers to shared test contexts
jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => require('./utils/renderWithProviders').useAuth(),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => require('./utils/renderWithProviders').useRepo(),
}));

describe('Today v3 FocusCard title & clear action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows focus item title and clears focus when Clear is pressed', async () => {
    const repoOverrides: Partial<IRepo> = {
      getFocusForDate: jest.fn(
        () =>
          Promise.resolve({
            id: 'fc1',
            entry_id: 't1',
            entry_type: 'todo',
            source: 'user',
            created_at: new Date().toISOString(),
            expires_at: new Date().toISOString(),
          }) as any,
      ),
      listTodayMerged: jest.fn(() => Promise.resolve([]) as any),
      getTodaySummary: jest.fn(() => Promise.resolve({ completed: 0, remaining: 0 })),
      getById: jest.fn(
        (id: string) =>
          Promise.resolve({
            id,
            type: 'todo',
            name: 'Finish packing',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            owner_id: 'test-user-id',
          }) as any,
      ),
      listRecentDrops: jest.fn(() => Promise.resolve([])),
      clearFocusForDate: jest.fn(() => Promise.resolve()),
    };

    const { mockRepo } = renderWithProviders(<TodayScreen />, { repo: repoOverrides });

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
      expect(mockRepo.clearFocusForDate).toHaveBeenCalled();
    });
  });
});
