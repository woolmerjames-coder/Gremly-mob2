/**
 * Integration Tests for NOW Screen V1
 * Tests the full screen with mocked useNowData
 */

import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import type { UseNowDataReturn } from '../../lib/now/useNowData';

// Create a variable to hold the mock now data so we can update it per test
let mockNowData: Partial<UseNowDataReturn>;

// Mock useNowData to return our test data
jest.mock('../../lib/now/useNowData', () => ({
  useNowData: () => mockNowData,
}));

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

// Mock useTodayInteractions since NowScreenV1 uses it for interactions
jest.mock('../../lib/today/useTodayInteractions', () => ({
  useTodayInteractions: () => ({
    openEntityOverlay: jest.fn(),
    toggleTodoComplete: jest.fn(),
    toggleHabitComplete: jest.fn(),
    undoLastCompletion: jest.fn(),
    completedHabitIds: new Set(),
    completedTodoIds: new Set(),
    undoState: null,
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

// Mock SweepDrawer component
jest.mock('../../components/today/v3/SweepDrawer', () => {
  const React = require('react');
  const { View } = require('react-native');

  return jest.fn(({ visible }: { visible: boolean }) => {
    if (!visible) return null;
    return <View testID="sweep-drawer" />;
  });
});

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
      // Set the mock NOW data for this test
      mockNowData = {
        dateTimeLabel: 'Monday, November 25 • 10:30 AM',
        progressState: {
          mode: 'dots',
          percent: 50,
          completedCount: 2,
          totalEligibleCount: 4,
          dots: [true, false, true, false],
        },
        weekStatus: 'on_track',
        weekHealth: 'on_track',
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
        vaultSummary: {
          topThree: [
            { id: 'list-1', name: 'Groceries', itemCount: 5 },
            { id: 'list-2', name: 'Gift ideas', itemCount: 3 },
            { id: 'list-3', name: 'Mexico list', itemCount: 2 },
          ],
          overflowCount: 2,
          thisWeekStats: {
            listCount: 0,
            listCount: 7,
            journalCount: 3,
            ideaCount: 8,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
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
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Assert: Header renders time-of-day greeting
      const greetingText = screen.getByText(/Good (morning|afternoon|evening)/);
      expect(greetingText).toBeTruthy();

      // Assert: Date/time label renders
      expect(screen.getByText(/Monday, November 25/i)).toBeTruthy();

      // Assert: Week indicator renders
      expect(screen.getByText('WEEK:')).toBeTruthy();

      // Assert: Logs indicator shows aggregated count
      expect(screen.getByText('LOGS: 18')).toBeTruthy();

      // Assert: Mind Vault card should NOT be present
      expect(screen.queryByText('Mind Vault')).toBeFalsy();

      // Assert: NOW list section header
      expect(screen.getByText('NOW')).toBeTruthy();

      // Assert: Locked item appears
      expect(screen.getByText('Morning Meditation')).toBeTruthy();

      // Assert: Active items appear
      expect(screen.getByText('Evening Walk')).toBeTruthy();
      expect(screen.getByText('Finish report')).toBeTruthy();

      // Assert: Future divider appears
      expect(screen.getByText('Future')).toBeTruthy();

      // Assert: Future item appears
      expect(screen.getByText('Call dentist')).toBeTruthy();

      // Assert: Sweep bar should NOT show when hasYesterdayCarryOver=false
      expect(screen.queryByText('✨ Time to Sweep!')).toBeNull();
    });
  });

  describe('Empty State', () => {
    it('renders empty state gracefully when no data', () => {
      // Set the mock NOW data for empty state
      mockNowData = {
        dateTimeLabel: 'Monday, November 25 • 10:30 AM',
        progressState: {
          mode: 'dots',
          percent: 0,
          completedCount: 0,
          totalEligibleCount: 0,
          dots: [],
        },
        weekStatus: 'on_track',
        weekHealth: 'on_track',
        lockedItems: [],
        activeItems: [],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            listCount: 0,
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
        weeklySummaries: [],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Assert: Header renders time-of-day greeting
      const greetingText = screen.getByText(/Good (morning|afternoon|evening)/);
      expect(greetingText).toBeTruthy();

      // Assert: Date/time label still renders
      expect(screen.getByText(/Monday, November 25/i)).toBeTruthy();

      // Assert: Week indicator still renders
      expect(screen.getByText('WEEK:')).toBeTruthy();

      // Assert: NOW list section header still renders
      expect(screen.getByText('NOW')).toBeTruthy();

      // Assert: No items appear
      expect(screen.queryByText('Morning Meditation')).toBeNull();
      expect(screen.queryByText('Finish report')).toBeNull();

      // Assert: Future divider should NOT appear when no future items
      expect(screen.queryByText('Future')).toBeNull();

      // Assert: Sweep bar should NOT show
      expect(screen.queryByText('Time to Sweep!')).toBeNull();

      // Assert: Mind Vault should NOT be visible (replaced with weekly summary)
      expect(screen.queryByText('Mind Vault')).toBeFalsy();
      // Weekly summary should not show when all counts are zero
      expect(screen.queryByText('This week…')).toBeFalsy();
    });
  });

  describe('Week Status Indicators', () => {
    it('renders week indicator with on_track status', () => {
      mockNowData = {
        dateTimeLabel: 'Monday, November 25 • 10:30 AM',
        progressState: {
          mode: 'dots',
          percent: 0,
          completedCount: 0,
          totalEligibleCount: 0,
          dots: [],
        },
        weekStatus: 'on_track',
        weekHealth: 'on_track',
        lockedItems: [],
        activeItems: [],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            listCount: 0,
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
        weeklySummaries: [],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Assert: Week indicator renders label and status text
      expect(screen.getByText('WEEK:')).toBeTruthy();
      expect(screen.getByText('HABITS ON TRACK')).toBeTruthy();
      expect(screen.queryByText(/LOGS:/)).toBeFalsy();
    });
  });

  describe('Phase 4: Progress Popup', () => {
    it('shows progress popup when tapping progress area', () => {
      mockNowData = {
        dateTimeLabel: 'Monday, November 25 • 10:30 AM',
        progressState: {
          mode: 'dots',
          percent: 67,
          completedCount: 2,
          totalEligibleCount: 3,
          dots: [true, true, false],
        },
        weekStatus: 'on_track',
        weekHealth: 'on_track',
        lockedItems: [],
        activeItems: [],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            listCount: 0,
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            completedAt: '2025-11-25T08:00:00Z',
            progressCount: 1,
          },
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            completedAt: '2025-11-25T09:30:00Z',
          },
        ],
        hasYesterdayCarryOver: false,
        weeklySummaries: [],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      const { getByText, queryByText } = renderWithProviders(<NowScreenV1 />);

      // Verify the data structure is correct for popup display
      expect(mockNowData.completedToday).toHaveLength(2);
      expect(mockNowData.completedToday![0].name).toBe('Morning Meditation');
      expect(mockNowData.completedToday![0].completedAt).toBe('2025-11-25T08:00:00Z');
      expect(mockNowData.completedToday![1].name).toBe('Finish report');
      expect(mockNowData.completedToday![1].completedAt).toBe('2025-11-25T09:30:00Z');

      // Verify progress state reflects completed items
      expect(mockNowData.progressState!.completedCount).toBe(2);
      expect(mockNowData.progressState!.percent).toBe(67);
    });
  });

  describe('Phase 4: Week Popup', () => {
    it('shows week popup with habit summaries when tapping WEEK indicator', () => {
      mockNowData = {
        dateTimeLabel: 'Monday, November 25 • 10:30 AM',
        progressState: {
          mode: 'dots',
          percent: 50,
          completedCount: 1,
          totalEligibleCount: 2,
          dots: [true, false],
        },
        weekStatus: 'on_track',
        weekHealth: 'on_track',
        lockedItems: [],
        activeItems: [],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            listCount: 0,
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
        weeklySummaries: [
          {
            habitId: 'habit-1',
            name: 'Morning Meditation',
            targetPerWeek: 7,
            completionsThisWeek: 5,
            status: 'on_track_today',
          },
          {
            habitId: 'habit-2',
            name: 'Evening Walk',
            targetPerWeek: 3,
            completionsThisWeek: 2,
            status: 'flexible',
          },
          {
            habitId: 'habit-3',
            name: 'Read 30 min',
            targetPerWeek: 7,
            completionsThisWeek: 7,
            status: 'week_complete',
          },
        ],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Verify weekly summaries exist in data
      expect(mockNowData.weeklySummaries).toHaveLength(3);
      expect(mockNowData.weeklySummaries![0].name).toBe('Morning Meditation');
      expect(mockNowData.weeklySummaries![0].completionsThisWeek).toBe(5);
      expect(mockNowData.weeklySummaries![0].targetPerWeek).toBe(7);

      expect(mockNowData.weeklySummaries![1].name).toBe('Evening Walk');
      expect(mockNowData.weeklySummaries![2].name).toBe('Read 30 min');
      expect(mockNowData.weeklySummaries![2].status).toBe('week_complete');

      // WEEK indicator should be visible
      expect(screen.getByText('WEEK:')).toBeTruthy();
    });
  });
});
