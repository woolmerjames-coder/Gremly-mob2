/**
 * Integration Tests for NOW Weekly Summary
 */

import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import type { UseNowDataReturn } from '../../lib/now/useNowData';

// Create a variable to hold the mock now data
let mockNowData: Partial<UseNowDataReturn>;

// Create mock functions for overlay controller
const mockOpenEdit = jest.fn();
const mockOpenCreate = jest.fn();
const mockClose = jest.fn();

// Create mock function for openEntityOverlay that calls mockOpenEdit
const mockOpenEntityOverlay = jest.fn((item) => {
  // Simulate what the real openEntityOverlay does - convert to AppRecord and call openEdit
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

// Mock useNowData to return our test data
jest.mock('../../lib/now/useNowData', () => ({
  useNowData: () => mockNowData,
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
    undoState: null,
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

describe('NOW Captures Indicator Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();

    // Set up mock data with vault summary
    mockNowData = {
      dateTimeLabel: 'Monday, November 25 • 2:00 PM',
      progressState: {
        mode: 'dots',
        percent: 50,
        completedCount: 2,
        totalEligibleCount: 4,
        dots: [true, true, false, false],
      },
      weekStatus: 'on_track',
      weekHealth: 'on_track',
      lockedItems: [],
      activeItems: [],
      futureItems: [],
      vaultSummary: {
        topThree: [
          { id: 'list-1', name: 'Groceries', itemCount: 5 },
          { id: 'list-2', name: 'Work tasks', itemCount: 3 },
          { id: 'list-3', name: 'Weekend plans', itemCount: 2 },
        ],
        overflowCount: 2,
        thisWeekStats: {
          listCount: 5,
          journalCount: 4,
          ideaCount: 7,
          personCount: 2,
        },
      },
      completedToday: [],
      hasYesterdayCarryOver: false,
      weeklySummaries: [],
      loading: false,
      reload: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Header Captures Display', () => {
    it('shows captures indicator with non-zero counts', () => {
      renderWithProviders(<NowScreenV1 />);

      expect(screen.getByText('LOGS: 16')).toBeTruthy();
    });

    it('hides captures indicator when all counts are zero', () => {
      mockNowData = {
        ...mockNowData,
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
      };

      renderWithProviders(<NowScreenV1 />);

      expect(screen.queryByText(/LOGS:/)).toBeFalsy();
    });

    it('shows captures indicator with only lists', () => {
      mockNowData = {
        ...mockNowData,
        vaultSummary: {
          ...mockNowData.vaultSummary!,
          thisWeekStats: {
            listCount: 3,
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
      };

      renderWithProviders(<NowScreenV1 />);

      expect(screen.getByText('LOGS: 3')).toBeTruthy();
    });

    it('shows captures indicator with mixed counts', () => {
      mockNowData = {
        ...mockNowData,
        vaultSummary: {
          ...mockNowData.vaultSummary!,
          thisWeekStats: {
            listCount: 2,
            journalCount: 1,
            ideaCount: 0,
            personCount: 0,
          },
        },
      };

      renderWithProviders(<NowScreenV1 />);

      expect(screen.getByText('LOGS: 3')).toBeTruthy();
    });

    it('does not show Mind Vault card', () => {
      renderWithProviders(<NowScreenV1 />);

      // Mind Vault card should NOT be present
      expect(screen.queryByText('Mind Vault')).toBeFalsy();
    });
  });
});
