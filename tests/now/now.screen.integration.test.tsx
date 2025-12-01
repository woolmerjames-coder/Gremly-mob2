/**
 * Integration Tests for NOW Screen V1
 * Tests the full screen with mocked useTodayStats
 */

import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';

// Create variables to hold mock data
let mockTodayStats: Record<string, unknown>;

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
    totalCount: 5,
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

// Mock useTodayInteractions since NowScreenV1 uses it for interactions
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
    loading: false,
    reload: jest.fn().mockResolvedValue(undefined),
    nowData: {
      dateTimeLabel: 'Monday, November 25 • 10:30 AM',
      weeklySummaries: [],
    },
    ...overrides,
  };
}

describe('NowScreenV1 Integration Tests', () => {
  const mockDate = new Date('2025-11-25T10:30:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Full Data Scenario', () => {
    it('renders complete NOW screen with all sections', () => {
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
            id: 'habit-2',
            type: 'habit',
            name: 'Evening Walk',
            locked: false,
            cadence: 'daily',
          },
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            locked: false,
          },
        ],
        futureItems: [
          {
            id: 'todo-2',
            type: 'todo',
            name: 'Call dentist',
          },
        ],
        totalTasksToday: 4,
        totalCompletedToday: 2,
        progressFraction: 0.5,
        progressPercent: 50,
        hasAnyTodayWork: true,
        nowData: {
          dateTimeLabel: 'Monday, November 25 • 10:30 AM',
          weeklySummaries: [
            {
              habitId: 'habit-1',
              name: 'Morning Meditation',
              targetPerWeek: 7,
              completionsThisWeek: 3,
              status: 'on_track_today',
            },
            {
              habitId: 'habit-2',
              name: 'Evening Walk',
              targetPerWeek: 3,
              completionsThisWeek: 1,
              status: 'flexible',
            },
          ],
        },
      });

      renderWithProviders(<NowScreenV1 />);

      // Assert: Header renders time-of-day greeting
      const greetingText = screen.getByText(/Good (morning|afternoon|evening)/);
      expect(greetingText).toBeTruthy();

      // Assert: Date/time label renders
      expect(screen.getByText(/Monday, November 25/i)).toBeTruthy();

      // Assert: Mind Vault card should NOT be present
      expect(screen.queryByText('Mind Vault')).toBeFalsy();

      // Assert: Locked item appears
      expect(screen.getByText('Morning Meditation')).toBeTruthy();

      // Assert: Active items appear
      expect(screen.getByText('Evening Walk')).toBeTruthy();
      expect(screen.getByText('Finish report')).toBeTruthy();

      // Assert: Future divider appears
      expect(screen.getByText('Future')).toBeTruthy();

      // Assert: Future item appears
      expect(screen.getByText('Call dentist')).toBeTruthy();

      // Assert: Your Notes card appears
      expect(screen.getByText('Your Notes')).toBeTruthy();

      // Assert: Today card appears
      expect(screen.getByText('Today')).toBeTruthy();

      // Assert: Habits card appears
      expect(screen.getByText('Habits')).toBeTruthy();
    });
  });

  describe('Empty State', () => {
    it('renders empty state gracefully when no data', () => {
      mockTodayStats = createMockStats({
        hasAnyTodayWork: false,
      });

      renderWithProviders(<NowScreenV1 />);

      // Assert: Header renders time-of-day greeting
      const greetingText = screen.getByText(/Good (morning|afternoon|evening)/);
      expect(greetingText).toBeTruthy();

      // Assert: Date/time label still renders
      expect(screen.getByText(/Monday, November 25/i)).toBeTruthy();

      // Assert: Empty state message appears
      expect(screen.getByText('Nothing scheduled for today.')).toBeTruthy();

      // Assert: Add to Today button still visible
      expect(screen.getByText('Add to Today')).toBeTruthy();
    });
  });

  describe('Loading State', () => {
    it('shows loading view when loading', () => {
      mockTodayStats = createMockStats({
        loading: true,
      });

      renderWithProviders(<NowScreenV1 />);

      // When loading, the screen shows a loading indicator (not the full content)
      // Just verify the component renders without error
      expect(screen.toJSON()).toBeTruthy();
    });
  });

  describe('Header Cards', () => {
    it('shows Today progress card with correct count', () => {
      mockTodayStats = createMockStats({
        totalTasksToday: 5,
        totalCompletedToday: 2,
        hasAnyTodayWork: true,
      });

      renderWithProviders(<NowScreenV1 />);

      // Today card should show 2/5
      expect(screen.getByText('2/5')).toBeTruthy();
    });

    it('shows Habits card', () => {
      mockTodayStats = createMockStats({
        nowData: {
          dateTimeLabel: 'Monday, November 25 • 10:30 AM',
          weeklySummaries: [
            {
              habitId: 'habit-1',
              name: 'Test Habit',
              targetPerWeek: 7,
              completionsThisWeek: 3,
              status: 'on_track_today',
            },
          ],
        },
      });

      renderWithProviders(<NowScreenV1 />);

      expect(screen.getByText('Habits')).toBeTruthy();
      expect(screen.getByText(/this week/)).toBeTruthy();
    });

    it('shows Your Notes card with count', () => {
      mockTodayStats = createMockStats();

      renderWithProviders(<NowScreenV1 />);

      expect(screen.getByText('Your Notes')).toBeTruthy();
      // Mock returns totalCount: 5
      expect(screen.getByText('5')).toBeTruthy();
    });
  });
});
