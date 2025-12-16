// SKIP: Needs Zustand migration - tests use old useRepo mocks
/**
 * Integration Tests for NOW Screen UnifiedOverlayV2 Integration
 * Tests that items (todos, habits, lists) open the correct overlay when tapped
 */

import React from 'react';
import { renderWithProviders, screen, fireEvent } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';

// Create variables to hold mock data
let mockTodayStats: Record<string, unknown>;

// Create mock function for openEntityOverlay
const mockOpenEntityOverlay = jest.fn();

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

// Mock useTodayInteractions to capture openEntityOverlay calls
jest.mock('../../lib/today/useTodayInteractions', () => ({
  useTodayInteractions: () => ({
    openEntityOverlay: mockOpenEntityOverlay,
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
    totalTasksToday: 3,
    totalCompletedToday: 1,
    progressFraction: 0.33,
    progressPercent: 33,
    hasAnyTodayWork: true,
    logsToday: [],
    sweepCandidateCount: 0,
    overdueTodos: [],
    recentDrops: [],
    loading: false,
    reload: jest.fn().mockResolvedValue(undefined),
    nowData: {
      dateTimeLabel: 'Monday, November 25 • 10:30 AM',
      weeklySummaries: [],
    },
    ...overrides,
  };
}

describe.skip('NOW Screen - UnifiedOverlayV2 Integration', () => {
  const mockDate = new Date('2025-11-25T10:30:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();
    mockOpenEntityOverlay.mockClear();

    // Set up mock data with one active todo and one locked habit
    mockTodayStats = createMockStats({
      lockedItems: [
        {
          id: 'habit-1',
          name: 'Morning Meditation',
          type: 'habit',
          cadence: 'daily',
          dueAt: mockDate.toISOString(),
          locked: true,
        },
      ],
      activeItems: [
        {
          id: 'todo-1',
          name: 'Review PRs',
          type: 'todo',
          dueTime: '2:00 PM',
          locked: false,
        },
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.skip('Active Todo Overlay Integration', () => {
    it('opens overlay with correct payload when tapping active todo', () => {
      renderWithProviders(<NowScreenV1 />);

      // Verify todo is rendered
      expect(screen.getByText('Review PRs')).toBeTruthy();

      // Tap the todo card (not the checkbox)
      const todoCard = screen.getByText('Review PRs');
      fireEvent.press(todoCard);

      // Verify openEntityOverlay was called
      expect(mockOpenEntityOverlay).toHaveBeenCalledTimes(1);

      // Verify the payload shape
      expect(mockOpenEntityOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'todo-1',
          name: 'Review PRs',
          type: 'todo',
        }),
      );
    });

    it('passes dueTime in the payload', () => {
      renderWithProviders(<NowScreenV1 />);

      fireEvent.press(screen.getByText('Review PRs'));

      expect(mockOpenEntityOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'todo-1',
          type: 'todo',
          dueTime: '2:00 PM',
        }),
      );
    });
  });

  describe.skip('Locked Habit Overlay Integration', () => {
    it('opens overlay with correct payload when tapping locked habit', () => {
      renderWithProviders(<NowScreenV1 />);

      // Verify habit is rendered
      expect(screen.getByText('Morning Meditation')).toBeTruthy();

      // Tap the habit card (not the icon)
      const habitCard = screen.getByText('Morning Meditation');
      fireEvent.press(habitCard);

      // Verify openEntityOverlay was called
      expect(mockOpenEntityOverlay).toHaveBeenCalledTimes(1);

      // Verify the payload shape
      expect(mockOpenEntityOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'habit-1',
          name: 'Morning Meditation',
          type: 'habit',
        }),
      );
    });

    it('passes cadence and dueAt in the payload', () => {
      renderWithProviders(<NowScreenV1 />);

      fireEvent.press(screen.getByText('Morning Meditation'));

      expect(mockOpenEntityOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'habit-1',
          type: 'habit',
          cadence: 'daily',
          dueAt: mockDate.toISOString(),
        }),
      );
    });
  });
});
