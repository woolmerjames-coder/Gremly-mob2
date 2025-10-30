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

// Minimal repo mocks
const mockRepo = {
  listTodayMerged: jest.fn(() => Promise.resolve([])),
  getTodaySummary: jest.fn(() => Promise.resolve({ completed: 0, remaining: 0 })),
  listRecentDrops: jest.fn(() => Promise.resolve([])),
  getFocusForDate: jest.fn(() => Promise.resolve(null)),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../lib/today/hooks/useTodayEntries', () => ({
  useTodayEntries: () => ({
    items: [
      {
        type: 'todo',
        id: 'todo-1',
        name: 'Mock Todo',
        overdue: false,
        nearDue: false,
      },
    ],
    doneItems: [],
    completed: 1,
    remaining: 1,
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock('../lib/today/hooks/useDropZoneSummary', () => ({
  useDropZoneSummary: () => ({ count: 0, quote: 'Keep going', loading: false }),
}));

jest.mock('../lib/today/hooks/useFocusCard', () => ({
  useFocusCard: () => ({
    focus: null,
    autosuggest: jest.fn(),
    clear: jest.fn(),
    loading: false,
  }),
}));

describe('Today v3 visual polish', () => {
  it('renders mascot badge and progress chip', async () => {
    renderWithProviders(<TodayScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
    });
    expect(screen.getByTestId('today-v3-mascot-badge')).toBeTruthy();
    expect(screen.getByTestId('today-v3-progress-chip')).toBeTruthy();
  });
});
