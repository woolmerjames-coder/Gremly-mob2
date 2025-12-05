/**
 * Integration Tests for NOW Empty States
 */

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
    lists: [],
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

// Mock useTodayInteractions
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

// Helper to create default mock stats
function createMockStats(overrides: Record<string, unknown> = {}) {
  return {
    lockedItems: [],
    activeItems: [],
    futureItems: [],
    completedToday: [],
    habitsToday: [],
    completedHabitsToday: [],
    totalTasksToday: 0,
    totalCompletedToday: 0,
    progressFraction: 0,
    progressPercent: 0,
    hasAnyTodayWork: false,
    logsToday: [],
    sweepCandidateCount: 0,
    overdueTodos: [],
    recentDrops: [],
    loading: false,
    reload: jest.fn().mockResolvedValue(undefined),
    nowData: {
      dateTimeLabel: 'Monday, November 25 • 2:00 PM',
      weeklySummaries: [],
    },
    ...overrides,
  };
}

describe('NOW Empty States Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Empty Item List', () => {
    it('shows empty state when no locked or active items', () => {
      mockTodayStats = createMockStats({
        hasAnyTodayWork: false,
      });

      renderWithProviders(<NowScreenV1 />);

      // Empty state message should be visible
      expect(screen.getByText('Nothing scheduled for today.')).toBeTruthy();
      expect(screen.getByText('Enjoy a calmer day — or try a Sweep.')).toBeTruthy();
    });

    it('does not show empty state when items exist', () => {
      mockTodayStats = createMockStats({
        lockedItems: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            locked: true,
            cadence: 'daily',
          },
        ],
        activeItems: [
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            locked: false,
          },
        ],
        totalTasksToday: 2,
        totalCompletedToday: 1,
        progressFraction: 0.5,
        progressPercent: 50,
        hasAnyTodayWork: true,
      });

      renderWithProviders(<NowScreenV1 />);

      // Empty state should NOT be visible
      expect(screen.queryByText('Nothing scheduled for today.')).toBeNull();
      expect(screen.queryByText('Enjoy a calmer day — or try a Sweep.')).toBeNull();

      // Items should be visible instead
      expect(screen.getByText('Morning Meditation')).toBeTruthy();
      expect(screen.getByText('Finish report')).toBeTruthy();
    });
  });

  describe('All Done Banner', () => {
    it('shows "All done!" banner when progress is 100% with items', () => {
      mockTodayStats = createMockStats({
        lockedItems: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            locked: true,
            cadence: 'daily',
            completedAt: new Date().toISOString(),
          },
        ],
        activeItems: [
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            locked: false,
          },
        ],
        completedToday: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            completedAt: new Date().toISOString(),
          },
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            completedAt: new Date().toISOString(),
          },
        ],
        totalTasksToday: 2,
        totalCompletedToday: 2,
        progressFraction: 1,
        progressPercent: 100,
        hasAnyTodayWork: true,
      });

      renderWithProviders(<NowScreenV1 />);

      // All done banner should be visible
      expect(screen.getByText('🎉 All done for today!')).toBeTruthy();
    });

    it('does not show banner when progress is less than 100%', () => {
      mockTodayStats = createMockStats({
        lockedItems: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            locked: true,
            cadence: 'daily',
          },
        ],
        activeItems: [
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            locked: false,
          },
        ],
        totalTasksToday: 4,
        totalCompletedToday: 3,
        progressFraction: 0.75,
        progressPercent: 75,
        hasAnyTodayWork: true,
      });

      renderWithProviders(<NowScreenV1 />);

      // Banner should NOT be visible
      expect(screen.queryByText('🎉 All done for today!')).toBeNull();
    });

    it('does not show banner when item list is empty', () => {
      mockTodayStats = createMockStats({
        hasAnyTodayWork: false,
      });

      renderWithProviders(<NowScreenV1 />);

      // Should show empty state, NOT all done banner
      expect(screen.queryByText('🎉 All done for today!')).toBeNull();
      expect(screen.getByText('Nothing scheduled for today.')).toBeTruthy();
    });
  });
});
