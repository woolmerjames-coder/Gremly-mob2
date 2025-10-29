import React from 'react';
import { act, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';

// Enable v3 + sweep
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

// Force Sweep available (avoid time dependency)
jest.mock('../lib/today/hooks/useSweepPreview', () => ({
  useSweepPreview: () => ({
    completed: 1,
    remaining: 2,
    available: true,
    loading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

// Mock Auth
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    userId: 'test-user-id',
    loading: false,
  }),
}));

// Repo mock
const repoMock = {
  listTodayMerged: jest.fn(() =>
    Promise.resolve([
      { type: 'todo', id: 't1', name: 'Finish packing', status: 'active', carry_forward: true },
      {
        type: 'todo',
        id: 't2',
        name: 'Check passport',
        status: 'active',
        carry_forward: false,
        due_date: new Date().toISOString(),
      },
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
  getTodaySummary: jest.fn(() => Promise.resolve({ completed: 1, remaining: 2 })),
  sweepApplyAction: jest.fn(() => Promise.resolve()),
  logHabitProgress: jest.fn(() => Promise.resolve()),
  completeTodo: jest.fn(() => Promise.resolve()),
  listRecentDrops: jest.fn(() => Promise.resolve([])),
};

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => repoMock,
}));

describe('Today v3 Sweep Drawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the sweep drawer and applies actions', async () => {
    renderWithProviders(<TodayScreen />);

    // Footer renders and we can peek
    const peekBtn = await waitFor(() => screen.getByTestId('today-v3-sweep-peek'));
    await act(async () => {
      peekBtn.props.onPress();
    });

    // Drawer visible
    await waitFor(() => {
      expect(screen.getByTestId('sweep-drawer')).toBeTruthy();
    });

    // Archive first item
    const archive1 = screen.getByTestId('sweep-archive-t1');
    await act(async () => {
      archive1.props.onPress();
    });
    expect(repoMock.sweepApplyAction).toHaveBeenCalledWith('t1', 'todo', 'archive', {
      archived_reason: 'swept',
    });

    // Carry-forward second
    const carry2 = screen.getByTestId('sweep-carry-t2');
    await act(async () => {
      carry2.props.onPress();
    });
    expect(repoMock.sweepApplyAction).toHaveBeenCalledWith('t2', 'todo', 'carry_forward', {
      archived_reason: 'swept',
    });

    // Close
    const done = screen.getByTestId('sweep-done');
    await act(async () => {
      done.props.onPress();
    });
  });
});
