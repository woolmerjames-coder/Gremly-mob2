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

// Auth
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'test@example.com', user_metadata: { full_name: 'Alex Stone' } },
    userId: 'u1',
    loading: false,
  }),
}));

const mockRepo = {
  getFocusForDate: jest.fn(() =>
    Promise.resolve({
      id: 'fc1',
      entry_id: 't1',
      entry_type: 'todo',
      source: 'auto',
      created_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
    }),
  ),
  listTodayMerged: jest.fn(() => Promise.resolve([])),
  getTodaySummary: jest.fn(() => Promise.resolve({ completed: 0, remaining: 0 })),
  getById: jest.fn(() =>
    Promise.resolve({ id: 't1', type: 'todo', name: 'Email Alex tomorrow 3pm' }),
  ),
  listRecentDrops: jest.fn(() => Promise.resolve([])),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

describe.skip('Phase 10.9B — Header and Focus panel refinement', () => {
  it('renders greeting/date header and focus panel with inline actions', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
    });

    expect(screen.getByTestId('today-header')).toBeTruthy();
    expect(screen.getByTestId('focus-panel')).toBeTruthy();
    expect(screen.getByTestId('focus-actions')).toBeTruthy();
    expect(screen.queryByTestId('today-v3-focus-view')).toBeNull();
  });
});
