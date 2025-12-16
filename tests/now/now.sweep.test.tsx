// SKIP: Needs Zustand migration - tests use old useRepo mocks
/**
 * Integration Tests for NOW Sweep functionality
 * Note: The NOW screen uses showAddOnly mode, so sweep bar is not directly visible.
 * These tests verify the sweep-related logic and drawer functionality.
 */

import { renderWithProviders, screen, mockNavigate } from '../utils/renderWithProviders';
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
  const { View, Text, TouchableOpacity } = require('react-native');

  return jest.fn(({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    if (!visible) return null;

    return (
      <View testID="sweep-drawer">
        <TouchableOpacity onPress={onClose}>
          <Text>Close Sweep</Text>
        </TouchableOpacity>
      </View>
    );
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

describe.skip('Sweep Functionality Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();

    mockTodayStats = createMockStats();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe.skip('Sweep State', () => {
    it('renders NowScreenV1 with sweep candidates', () => {
      mockTodayStats = createMockStats({
        sweepCandidateCount: 5,
      });

      renderWithProviders(<NowScreenV1 />);

      // Screen should render successfully
      expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeTruthy();
    });

    it('renders NowScreenV1 without sweep candidates', () => {
      mockTodayStats = createMockStats({
        sweepCandidateCount: 0,
      });

      renderWithProviders(<NowScreenV1 />);

      // Screen should render successfully
      expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeTruthy();
    });

    it('sweep drawer is not visible by default', () => {
      renderWithProviders(<NowScreenV1 />);

      // Sweep drawer should not be visible initially
      expect(screen.queryByTestId('sweep-drawer')).toBeFalsy();
    });
  });

  describe.skip('Add to Today Button', () => {
    it('shows Add to Today button (showAddOnly mode)', () => {
      mockTodayStats = createMockStats();

      renderWithProviders(<NowScreenV1 />);

      // Should show Add to Today button (with + prefix in header)
      expect(screen.getByText('+ Add to Today')).toBeTruthy();
    });
  });

  describe.skip('Sweep Navigation', () => {
    beforeEach(() => {
      mockNavigate.mockClear();
    });

    it('NowScreenV1 renders successfully with navigation wiring for Sweep', () => {
      // The NowScreenV1 uses showAddOnly mode by default, so sweep pill is hidden.
      // This test verifies the screen renders without errors after the sweep
      // navigation refactor (from SweepDrawer to navigation.navigate('Sweep')).
      mockTodayStats = createMockStats({
        sweepCandidateCount: 3,
      });

      renderWithProviders(<NowScreenV1 />);

      // Screen should render successfully with navigation hook
      expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeTruthy();

      // The sweep functionality is now wired to navigation.navigate('Sweep')
      // instead of opening SweepDrawer modal. The actual navigation is tested
      // implicitly - if the useNavigation hook wasn't available or typed wrong,
      // the component would fail to render.
    });

    it('does not render old SweepDrawer component', () => {
      mockTodayStats = createMockStats();

      renderWithProviders(<NowScreenV1 />);

      // Old SweepDrawer should not be rendered anymore
      // (it was replaced with navigation to SweepFlowScreen)
      expect(screen.queryByTestId('sweep-drawer')).toBeFalsy();
    });
  });
});
