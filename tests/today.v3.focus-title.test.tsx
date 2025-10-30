import React from 'react';
import { act, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
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

// Mock overlay controller to capture calls
const openCreateMock = jest.fn();
jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    state: { visible: false, mode: 'create', initialEntity: null, initialSpaceId: null },
    openCreate: openCreateMock,
    close: jest.fn(),
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
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => repoMock,
}));

describe('Today v3 FocusCard title & View Task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows focus item title and opens overlay with initialEntity on View Task', async () => {
    renderWithProviders(<TodayScreen />);

    // Screen renders
    await waitFor(() => {
      expect(screen.getByTestId('today-v3-screen')).toBeTruthy();
    });

    // Title appears
    await waitFor(() => {
      const card = screen.getByTestId('today-v3-focus-card');
      const text = JSON.stringify(card.props.children);
      expect(text.toLowerCase()).toContain('finish packing');
    });

    // Click "View Task"
    const viewBtn = screen.getByTestId('today-v3-focus-view');
    await act(async () => {
      viewBtn.props.onPress();
    });

    // Unified overlay should be opened with initialEntity
    expect(openCreateMock).toHaveBeenCalled();
    const arg = openCreateMock.mock.calls[0][0];
    expect(arg.type).toBe('todo');
    expect(arg.initialEntity).toBeTruthy();
    expect(arg.initialEntity.id).toBe('t1');
  });
});
