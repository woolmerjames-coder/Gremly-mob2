import React from 'react';
import { act, fireEvent, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';
import type { IRepo } from '../lib/repo/IRepo';

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

// Wire providers to test utility contexts
jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => require('./utils/renderWithProviders').useAuth(),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => require('./utils/renderWithProviders').useRepo(),
}));

describe('Today v3 Sweep Drawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the sweep drawer and applies actions', async () => {
    const repoOverrides: Partial<IRepo> = {
      listTodayMerged: jest.fn(
        () =>
          Promise.resolve([
            {
              type: 'todo' as const,
              id: 't1',
              name: 'Finish packing',
              status: 'active' as const,
              carry_forward: true,
            },
            {
              type: 'todo' as const,
              id: 't2',
              name: 'Check passport',
              status: 'active' as const,
              carry_forward: false,
              due_date: new Date().toISOString(),
            },
            {
              type: 'habit' as const,
              id: 'h1',
              name: 'Water',
              target_count: 8,
              progress_today: 6,
              cadence: 'day' as const,
            },
          ]) as any,
      ),
      getTodaySummary: jest.fn(() => Promise.resolve({ completed: 1, remaining: 2 })),
      sweepApplyAction: jest.fn(() => Promise.resolve()),
      logHabitProgress: jest.fn(() => Promise.resolve()),
      completeTodo: jest.fn(() => Promise.resolve()),
      listRecentDrops: jest.fn(() => Promise.resolve([])),
    };

    const { mockRepo } = renderWithProviders(<TodayScreen />, { repo: repoOverrides });

    await waitFor(() => {
      expect(mockRepo.listTodayMerged).toHaveBeenCalled();
    });

    // Footer renders and we can peek
    const peekBtn = await waitFor(() => screen.getByTestId('today-v3-sweep-peek'));
    await act(async () => {
      fireEvent.press(peekBtn);
    });

    // Drawer visible
    await waitFor(() => {
      expect(screen.getByTestId('sweep-drawer')).toBeTruthy();
    });

    // Archive first item
    const archive1 = await waitFor(() => screen.getByTestId('sweep-archive-t1'));
    await act(async () => {
      fireEvent.press(archive1);
    });
    expect(mockRepo.sweepApplyAction).toHaveBeenCalledWith('t1', 'todo', 'archive', {
      archived_reason: 'swept',
    });

    // Carry-forward second
    const carry2 = await waitFor(() => screen.getByTestId('sweep-carry-t2'));
    await act(async () => {
      fireEvent.press(carry2);
    });
    expect(mockRepo.sweepApplyAction).toHaveBeenCalledWith('t2', 'todo', 'carry_forward', {
      archived_reason: 'swept',
    });

    // Close
    const done = screen.getByTestId('sweep-done');
    await act(async () => {
      fireEvent.press(done);
    });
  });
});
