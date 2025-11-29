/**
 * Integration Tests for NOW Sweep Bar
 */

import React from 'react';
import { renderWithProviders, screen, fireEvent, waitFor } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import type { UseNowDataReturn } from '../../lib/now/useNowData';

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

// Create a variable to hold the mock now data
let mockNowData: Partial<UseNowDataReturn>;

// Mock useNowData to return our test data
jest.mock('../../lib/now/useNowData', () => ({
  useNowData: () => mockNowData,
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

// Mock SweepDrawer component
jest.mock('../../components/today/v3/SweepDrawer', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');

  // Return a simple mock component that doesn't use any hooks
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

describe('Sweep Bar Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();

    // Base mock data
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('With Yesterday Carry-Over', () => {
    it('shows "Time to Sweep!" when hasYesterdayCarryOver is true', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: true,
      };

      renderWithProviders(<NowScreenV1 />);

      // Should show the urgent message
      expect(screen.getByText('Time to Sweep!')).toBeTruthy();
    });

    it('sweep bar is pressable when carry-over exists', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: true,
      };

      renderWithProviders(<NowScreenV1 />);

      // Sweep bar should be visible and pressable
      const sweepBar = screen.getByTestId('sweep-bar');
      expect(sweepBar).toBeTruthy();

      // Verify it can be pressed (doesn't throw)
      expect(() => fireEvent.press(sweepBar)).not.toThrow();
    });
  });

  describe('Without Yesterday Carry-Over', () => {
    it('shows "Sweep available" when hasYesterdayCarryOver is false', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: false,
      };

      renderWithProviders(<NowScreenV1 />);

      // Should show the standard message
      expect(screen.getByText('Sweep available')).toBeTruthy();
    });

    it('sweep bar is pressable without carry-over', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: false,
      };

      renderWithProviders(<NowScreenV1 />);

      // Sweep bar should be visible and pressable
      const sweepBar = screen.getByTestId('sweep-bar');
      expect(sweepBar).toBeTruthy();

      // Verify it can be pressed (doesn't throw)
      expect(() => fireEvent.press(sweepBar)).not.toThrow();
    });
  });

  describe('Sweep Bar Interactivity', () => {
    it('is always visible and pressable', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: true,
      };

      renderWithProviders(<NowScreenV1 />);

      const sweepBar = screen.getByTestId('sweep-bar');
      expect(sweepBar).toBeTruthy();

      // Should be pressable (doesn't throw)
      expect(() => fireEvent.press(sweepBar)).not.toThrow();
    });
  });
});
