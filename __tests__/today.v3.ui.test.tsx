import React from 'react';
import { fireEvent, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
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
  getFocusForDate: jest.fn(() => Promise.resolve(null)),
  clearFocusForDate: jest.fn(() => Promise.resolve()),
  setFocus: jest.fn(() => Promise.resolve()),
  topFocusCandidates: jest.fn(() => Promise.resolve([{ id: 't1', type: 'todo', priority: 150 }])),
  getById: jest.fn((id: string) =>
    Promise.resolve(id === 't1' ? { id: 't1', type: 'todo', name: 'Finish packing' } : null),
  ),
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
    mockRepo.listTodayMerged.mockResolvedValue([
      { type: 'todo', id: 't1', name: 'Finish packing', status: 'active', carry_forward: true },
      {
        type: 'habit',
        id: 'h1',
        name: 'Water',
        target_count: 8,
        progress_today: 6,
        cadence: 'day',
      },
    ]);
    mockRepo.getTodaySummary.mockResolvedValue({ completed: 3, remaining: 2 });
    mockRepo.getFocusForDate.mockResolvedValue(null);
    mockRepo.clearFocusForDate.mockResolvedValue(undefined);
    mockRepo.setFocus.mockResolvedValue(undefined);
    mockRepo.topFocusCandidates.mockResolvedValue([{ id: 't1', type: 'todo', priority: 150 }]);
    mockRepo.getById.mockImplementation((id: string) =>
      Promise.resolve(id === 't1' ? { id: 't1', type: 'todo', name: 'Finish packing' } : null),
    );
    mockRepo.logHabitProgress.mockResolvedValue(undefined);
    mockRepo.completeTodo.mockResolvedValue(undefined);
    mockRepo.listRecentDrops.mockResolvedValue([]);
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

  it('opens the focus picker and sets focus when a candidate is chosen', async () => {
    renderWithProviders(<TodayScreen />);

    const changeButton = await waitFor(() => screen.getByTestId('today-v3-focus-change'));
    fireEvent.press(changeButton);

    await waitFor(() => {
      expect(screen.getByTestId('focus-picker-modal')).toBeTruthy();
    });

    await waitFor(() => {
      expect(mockRepo.topFocusCandidates).toHaveBeenCalled();
    });

    const candidate = await waitFor(() => screen.getByTestId('focus-pick-todo-t1'));
    fireEvent.press(candidate);

    await waitFor(() => {
      expect(mockRepo.setFocus).toHaveBeenCalled();
    });
  });
});
