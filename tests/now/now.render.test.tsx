import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';

// Mock useAuth to return a test user
jest.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-1',
      email: 'test@example.com',
    },
    userId: 'test-user-1',
    session: { access_token: 'mock-token' },
    loading: false,
    error: null,
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
    clearError: jest.fn(),
  }),
}));

// Mock useRepo to avoid RepoProvider dependency
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    listHabits: jest.fn().mockResolvedValue([]),
    getHabitProgressForWeek: jest.fn().mockResolvedValue(0),
  }),
}));

// Create variables to hold mock data
let mockTodayStats: Record<string, unknown>;
let mockSweepCandidateCount: number;

// Mock useTodayStats - the main data hook for NowScreenV1
jest.mock('../../lib/today/hooks', () => ({
  useTodayStats: () => mockTodayStats,
}));

// Mock useRecentLogs for the Your Notes section
jest.mock('../../lib/notes/useRecentLogs', () => ({
  useRecentLogs: () => ({
    logs: [],
    journals: [],
    ideas: [],
    general: [],
    totalCount: 0,
    loading: false,
    reload: jest.fn(),
    refresh: jest.fn(),
  }),
}));

// Mock useNowQuickAdd to avoid RepoProvider dependency
jest.mock('../../lib/now/useNowQuickAdd', () => ({
  useNowQuickAdd: () => ({
    handleQuickAdd: jest.fn().mockResolvedValue(undefined),
    isProcessing: false,
  }),
}));

// Mock useTodayInteractions since NowScreenV1 uses it
jest.mock('../../lib/today/useTodayInteractions', () => ({
  useTodayInteractions: () => ({
    openEntityOverlay: jest.fn(),
    toggleTodoComplete: jest.fn(),
    toggleHabitComplete: jest.fn(),
    undoLastCompletion: jest.fn(),
    completedHabitIds: new Set(),
    completedTodoIds: new Set(),
    deletedItemIds: new Set(),
    lastPendingInfo: null,
  }),
}));

// Mock the unified overlay controller
jest.mock('../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    state: { visible: false, mode: 'create' },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

// Mock useActionToast to avoid RepoProvider dependency
jest.mock('../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: jest.fn(),
    hideToast: jest.fn(),
    isVisible: false,
    Toast: null,
  }),
}));

// Mock useOverwhelmFlow
jest.mock('../../lib/now/useOverwhelmFlow', () => ({
  useOverwhelmFlow: () => ({
    state: 'idle',
    selectedItems: [],
    selectedIds: [],
    focusItem: null,
    startFlow: jest.fn(),
    selectItems: jest.fn(),
    confirmSelection: jest.fn(),
    setFocusItem: jest.fn(),
    exitFocus: jest.fn(),
    reset: jest.fn(),
  }),
}));

// Mock SweepDrawer component
jest.mock('../../components/today/v3/SweepDrawer', () => {
  const React = require('react');
  const { View } = require('react-native');

  return jest.fn(({ visible }: { visible: boolean }) => {
    if (!visible) return null;
    return <View testID="sweep-drawer" />;
  });
});

describe('NowScreenV1', () => {
  beforeEach(() => {
    // Reset to default mock data with content
    mockSweepCandidateCount = 0;
    mockTodayStats = {
      lockedItems: [],
      activeItems: [
        {
          id: 'habit-1',
          type: 'habit',
          name: 'Test Habit',
          locked: false,
          cadence: 'daily',
        },
      ],
      futureItems: [],
      completedToday: [],
      habitsToday: [],
      completedHabitsToday: [],
      totalTasksToday: 2,
      totalCompletedToday: 0,
      progressFraction: 0,
      progressPercent: 0,
      hasAnyTodayWork: true,
      logsToday: [],
      sweepCandidateCount: mockSweepCandidateCount,
      loading: false,
      reload: jest.fn().mockResolvedValue(undefined),
      nowData: {
        dateTimeLabel: 'Monday, Nov 25 • 10:30 AM',
        weeklySummaries: [],
      },
    };
  });

  it('renders the NOW V1 components when flag is true', () => {
    renderWithProviders(<NowScreenV1 />);

    // Check for header elements with time-of-day greeting
    const greetingText = screen.getByText(/Good (morning|afternoon|evening)/);
    expect(greetingText).toBeTruthy();
  });

  it('mounts successfully with all sections', () => {
    renderWithProviders(<NowScreenV1 />);

    // Verify main sections render
    expect(screen.getByText(/Add to Today/i)).toBeTruthy();
    // Mind Vault card should NOT be present
    expect(screen.queryByText('Mind Vault')).toBeFalsy();
  });
});
