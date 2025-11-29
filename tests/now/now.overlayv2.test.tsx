/**
 * Integration Tests for NOW Screen UnifiedOverlayV2 Integration
 * Tests that items (todos, habits, lists) open the correct overlay when tapped
 */

import React from 'react';
import { renderWithProviders, screen, fireEvent } from '../utils/renderWithProviders';
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

// Create mock function for openEntityOverlay
const mockOpenEntityOverlay = jest.fn();

// Mock useNowData to return our test data
jest.mock('../../lib/now/useNowData', () => ({
  useNowData: () => mockNowData,
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

// Mock SweepDrawer component
jest.mock('../../components/today/v3/SweepDrawer', () => {
  const React = require('react');
  const { View } = require('react-native');

  return jest.fn(({ visible }: { visible: boolean }) => {
    if (!visible) return null;
    return <View testID="sweep-drawer" />;
  });
});

describe('NOW Screen - UnifiedOverlayV2 Integration', () => {
  const mockDate = new Date('2025-11-25T10:30:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();
    mockOpenEntityOverlay.mockClear();

    // Set up mock data with one active todo, one locked habit, and one list
    mockNowData = {
      dateTimeLabel: 'Monday, November 25 • 10:30 AM',
      progressState: {
        mode: 'dots',
        percent: 33,
        completedCount: 1,
        totalEligibleCount: 3,
        dots: [true, false, false],
      },
      weekStatus: 'on_track',
      weekHealth: 'on_track',
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
      futureItems: [],
      vaultSummary: {
        topThree: [{ id: 'list-1', name: 'Groceries', itemCount: 5 }],
        overflowCount: 0,
        thisWeekStats: {
          listCount: 0,
          journalCount: 2,
          ideaCount: 3,
          personCount: 1,
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

  describe('Active Todo Overlay Integration', () => {
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

  describe('Locked Habit Overlay Integration', () => {
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
