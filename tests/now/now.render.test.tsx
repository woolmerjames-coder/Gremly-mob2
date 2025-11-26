import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
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

// Mock useTodayInteractions since NowScreenV1 uses it
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

describe('NowScreenV1', () => {
  beforeEach(() => {
    // Reset to default mock data with content
    mockNowData = {
      dateTimeLabel: 'Monday, Nov 25 • 10:30 AM',
      progressState: {
        mode: 'dots',
        percent: 0,
        completedCount: 0,
        totalEligibleCount: 2,
        dots: [false, false],
      },
      weekStatus: 'on_track',
      weekHealth: 'on_track',
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
      vaultSummary: {
        topThree: [{ id: 'note-1', name: 'Test List', itemCount: 1 }],
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

  it('renders the NOW V1 components when flag is true', () => {
    renderWithProviders(<NowScreenV1 />);

    // Check for header elements with time-of-day greeting
    const greetingText = screen.getByText(/Good (morning|afternoon|evening)/);
    expect(greetingText).toBeTruthy();
    expect(screen.getByText('NOW')).toBeTruthy();

    // Weekly summary should not render when all counts are zero
    expect(screen.queryByText('This week…')).toBeFalsy();
  });

  it('mounts successfully with all sections', () => {
    // Set sweep available for this test
    mockNowData = {
      ...mockNowData,
      hasYesterdayCarryOver: true,
    };

    renderWithProviders(<NowScreenV1 />);

    // Verify main sections render
    expect(screen.getByText('NOW')).toBeTruthy();
    expect(screen.getByText(/Sweep/i)).toBeTruthy();
    expect(screen.getByText(/stuck/i)).toBeTruthy();
    // Mind Vault card should NOT be present
    expect(screen.queryByText('Mind Vault')).toBeFalsy();
  });
});
