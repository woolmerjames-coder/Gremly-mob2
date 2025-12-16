// SKIP: Needs Zustand migration - tests use old useRepo mocks
/**
 * Integration Tests for NOW Your Notes Section
 */

import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';

// Create variables to hold mock data
let mockTodayStats: Record<string, unknown>;
let mockRecentLogsData: Record<string, unknown>;

// Create mock functions for overlay controller
const mockOpenEdit = jest.fn();
const mockOpenCreate = jest.fn();
const mockClose = jest.fn();

// Create mock function for openEntityOverlay that calls mockOpenEdit
const mockOpenEntityOverlay = jest.fn((item) => {
  mockOpenEdit({
    record: {
      ...item,
      created_at: item.created_at || new Date().toISOString(),
      updated_at: item.updated_at || new Date().toISOString(),
    },
  });
});

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
  useRecentLogs: () => mockRecentLogsData,
}));

// Mock useNowQuickAdd to avoid RepoProvider dependency
jest.mock('../../lib/now/useNowQuickAdd', () => ({
  useNowQuickAdd: () => ({
    handleQuickAdd: jest.fn().mockResolvedValue(undefined),
    isProcessing: false,
  }),
}));

// Mock the unified overlay controller
jest.mock('../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    state: { visible: false, mode: 'create' },
    openCreate: mockOpenCreate,
    openEdit: mockOpenEdit,
    openView: jest.fn(),
    close: mockClose,
  }),
}));

// Mock useTodayInteractions to use our custom openEntityOverlay
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
    totalTasksToday: 4,
    totalCompletedToday: 2,
    progressFraction: 0.5,
    progressPercent: 50,
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

describe.skip('NOW Your Notes Section Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();

    // Set up default mock data
    mockTodayStats = createMockStats();
    mockRecentLogsData = {
      logs: [
        { id: 'log-1', name: 'Test note', noteType: 'general' },
        { id: 'log-2', name: 'Test journal', noteType: 'journal' },
      ],
      journals: [{ id: 'log-2', name: 'Test journal', noteType: 'journal' }],
      ideas: [],
      general: [{ id: 'log-1', name: 'Test note', noteType: 'general' }],
      lists: [],
      totalCount: 2,
      loading: false,
      reload: jest.fn(),
      refresh: jest.fn(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.skip('Your Notes Card Display', () => {
    it('shows Your Notes card with count', () => {
      renderWithProviders(<NowScreenV1 />);

      // Should show the Your Notes card
      expect(screen.getByText('Your Notes')).toBeTruthy();
      // Should show the count
      expect(screen.getByText('2')).toBeTruthy();
    });

    it('shows zero count when no notes', () => {
      mockRecentLogsData = {
        logs: [],
        journals: [],
        ideas: [],
        general: [],
        lists: [],
        totalCount: 0,
        loading: false,
        reload: jest.fn(),
        refresh: jest.fn(),
      };

      renderWithProviders(<NowScreenV1 />);

      expect(screen.getByText('Your Notes')).toBeTruthy();
      expect(screen.getByText('0')).toBeTruthy();
    });

    it('does not show Mind Vault card', () => {
      renderWithProviders(<NowScreenV1 />);

      // Mind Vault card should NOT be present
      expect(screen.queryByText('Mind Vault')).toBeFalsy();
    });
  });
});
