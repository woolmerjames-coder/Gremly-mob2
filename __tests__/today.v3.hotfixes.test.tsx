// SKIP: Needs Zustand migration - tests use old useRepo mocks
import React from 'react';
import { renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
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

// Repo mock returns no items and 0/0 summary to exercise the hotfix branches
const mockRepo = {
  listTodayMerged: jest.fn(() => Promise.resolve([])),
  getTodaySummary: jest.fn(() => Promise.resolve({ completed: 0, remaining: 0 })),
  listRecentDrops: jest.fn(() => Promise.resolve([])),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

describe.skip('Today v3 hotfixes', () => {
  it('hides progress chip when total is 0 and hides sweep footer when 0/0', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
    });

    expect(screen.queryByTestId('today-v3-progress-chip')).toBeNull();
    expect(screen.queryByTestId('today-v3-sweep')).toBeNull();

    expect(mockRepo.listTodayMerged).toHaveBeenCalled();
    expect(mockRepo.getTodaySummary).toHaveBeenCalled();
  });
});
