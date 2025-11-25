/**
 * Integration Tests for NOW Screen UnifiedOverlayV2 Integration
 * Tests that items (todos, habits, lists) open the correct overlay when tapped
 */

import React from 'react';
import { renderWithProviders, screen, fireEvent } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import type { UseNowDataReturn } from '../../lib/now/useNowData';

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

describe('NOW Screen - UnifiedOverlayV2 Integration', () => {
  const mockDate = new Date('2025-11-25T10:30:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();
    mockOpenEntityOverlay.mockClear();

    // Set up mock data with one active todo, one locked habit, and one list
    mockNowData = {
      greeting: 'Good Morning, test',
      dateTimeLabel: 'Monday, November 25 • 10:30 AM',
      progressState: {
        mode: 'dots',
        percent: 33,
        completedCount: 1,
        totalEligibleCount: 3,
        dots: [true, false, false],
      },
      weekStatus: 'on_track',
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

  describe('Mind Vault List Overlay Integration', () => {
    it('opens overlay with correct payload when tapping list in expanded vault', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand the vault first
      fireEvent.press(screen.getByText('📚 Mind Vault'));

      // Verify expanded view is visible
      expect(screen.getByText('Recent Lists')).toBeTruthy();

      // Tap the list row using testID
      fireEvent.press(screen.getByTestId('vault-list-list-1'));

      // Verify openEntityOverlay was called
      expect(mockOpenEntityOverlay).toHaveBeenCalledTimes(1);

      // Verify the payload shape for a list
      expect(mockOpenEntityOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'list-1',
          type: 'note',
          subtype: 'list',
          title: 'Groceries',
        }),
      );
    });

    it('correctly identifies list items as type "note" with subtype "list"', () => {
      renderWithProviders(<NowScreenV1 />);

      fireEvent.press(screen.getByText('📚 Mind Vault'));
      fireEvent.press(screen.getByTestId('vault-list-list-1'));

      // Verify the type/subtype distinction
      const callArg = mockOpenEntityOverlay.mock.calls[0][0];
      expect(callArg.type).toBe('note');
      expect(callArg.subtype).toBe('list');
      expect(callArg.title).toBe('Groceries');
      expect(callArg.id).toBe('list-1');
    });
  });

  describe('Multiple Item Interactions', () => {
    it('correctly handles multiple different item taps in sequence', () => {
      renderWithProviders(<NowScreenV1 />);

      // Tap todo
      fireEvent.press(screen.getByText('Review PRs'));
      expect(mockOpenEntityOverlay).toHaveBeenCalledTimes(1);
      expect(mockOpenEntityOverlay).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'todo-1', type: 'todo' }),
      );

      // Tap habit
      fireEvent.press(screen.getByText('Morning Meditation'));
      expect(mockOpenEntityOverlay).toHaveBeenCalledTimes(2);
      expect(mockOpenEntityOverlay).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'habit-1', type: 'habit' }),
      );

      // Tap list
      fireEvent.press(screen.getByText('📚 Mind Vault'));
      fireEvent.press(screen.getByTestId('vault-list-list-1'));
      expect(mockOpenEntityOverlay).toHaveBeenCalledTimes(3);
      expect(mockOpenEntityOverlay).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ id: 'list-1', type: 'note', subtype: 'list' }),
      );
    });
  });

  describe('Payload Validation', () => {
    it('ensures todo payload has required fields', () => {
      renderWithProviders(<NowScreenV1 />);
      fireEvent.press(screen.getByText('Review PRs'));

      const payload = mockOpenEntityOverlay.mock.calls[0][0];
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('type', 'todo');
      expect(payload).toHaveProperty('name');
    });

    it('ensures habit payload has required fields', () => {
      renderWithProviders(<NowScreenV1 />);
      fireEvent.press(screen.getByText('Morning Meditation'));

      const payload = mockOpenEntityOverlay.mock.calls[0][0];
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('type', 'habit');
      expect(payload).toHaveProperty('name');
    });

    it('ensures list payload has required fields', () => {
      renderWithProviders(<NowScreenV1 />);
      fireEvent.press(screen.getByText('📚 Mind Vault'));
      fireEvent.press(screen.getByTestId('vault-list-list-1'));

      const payload = mockOpenEntityOverlay.mock.calls[0][0];
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('type', 'note');
      expect(payload).toHaveProperty('subtype', 'list');
      expect(payload).toHaveProperty('title');
    });

    it('passes through all item properties to overlay', () => {
      renderWithProviders(<NowScreenV1 />);
      fireEvent.press(screen.getByText('Review PRs'));

      const payload = mockOpenEntityOverlay.mock.calls[0][0];
      // Should have all original properties from the todo item
      expect(payload.id).toBe('todo-1');
      expect(payload.name).toBe('Review PRs');
      expect(payload.type).toBe('todo');
      expect(payload.dueTime).toBe('2:00 PM');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty item lists gracefully', () => {
      mockNowData = {
        ...mockNowData,
        lockedItems: [],
        activeItems: [],
        futureItems: [],
      };

      renderWithProviders(<NowScreenV1 />);

      // Should show empty state
      expect(screen.getByText('Nothing scheduled for today.')).toBeTruthy();

      // openEntityOverlay should not have been called
      expect(mockOpenEntityOverlay).not.toHaveBeenCalled();
    });

    it('handles items without optional fields', () => {
      mockNowData = {
        ...mockNowData,
        activeItems: [
          {
            id: 'todo-minimal',
            name: 'Minimal Todo',
            type: 'todo',
            locked: false,
            // No dueTime or other optional fields
          },
        ],
      };

      renderWithProviders(<NowScreenV1 />);

      fireEvent.press(screen.getByText('Minimal Todo'));

      expect(mockOpenEntityOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'todo-minimal',
          name: 'Minimal Todo',
          type: 'todo',
        }),
      );

      // Should not have dueTime
      const payload = mockOpenEntityOverlay.mock.calls[0][0];
      expect(payload.dueTime).toBeUndefined();
    });
  });
});
