/**
 * Today Screen Grouping Tests
 * Tests for Phase 9 Step 4 features:
 * - Space grouping with correct ordering
 * - Pull-to-refresh with mascot wave
 * - Section collapse state persistence
 */

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders, useAuth, useRepo } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';
import { useTodayData } from '../lib/today/useTodayData';
import type { EnrichedTodo } from '../lib/today/useTodayData';

// Mock dependencies
jest.mock('../lib/today/useTodayData');
jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    close: jest.fn(),
    state: { visible: false },
  }),
}));

// Mock the provider hooks to use our test context hooks
jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => require('./utils/renderWithProviders').useAuth(),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => require('./utils/renderWithProviders').useRepo(),
}));

jest.mock('../providers/CortexProvider', () => ({
  ...jest.requireActual('../providers/CortexProvider'),
  useCortex: () => require('./utils/renderWithProviders').useCortex(),
}));

const mockUseTodayData = useTodayData as jest.MockedFunction<typeof useTodayData>;

describe('Today Screen - Grouping Features', () => {
  const mockTodos: EnrichedTodo[] = [
    {
      id: 't1',
      title: 'Work task',
      dueTime: '09:00',
      spaceName: 'Work',
      tags: [],
      overdue: false,
      nearDue: false,
    },
    {
      id: 't2',
      title: 'Mexico planning',
      dueTime: '10:00',
      spaceName: 'Mexico Trip',
      tags: [],
      overdue: false,
      nearDue: false,
    },
    {
      id: 't3',
      title: 'Another work task',
      dueTime: '11:00',
      spaceName: 'Work',
      tags: [],
      overdue: false,
      nearDue: false,
    },
    {
      id: 't4',
      title: 'Personal errand',
      dueTime: '14:00',
      spaceName: undefined,
      tags: [],
      overdue: false,
      nearDue: false,
    },
  ];

  const defaultMockData = {
    loading: false,
    error: null,
    habits: [],
    todos: mockTodos,
    suggestions: [],
    visible: {
      habits: [],
      todos: mockTodos,
      suggestions: [],
    },
    hidden: {
      habits: 0,
      todos: 0,
      suggestions: 0,
    },
    header: {
      greeting: 'Good morning',
      subline: "Let's make today count",
      streakCount: 5,
      completedToday: 2,
      plannedToday: 4,
    },
    timeWindow: 'morning' as const,
    reducedMotion: true,
    reload: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTodayData.mockReturnValue(defaultMockData);
  });

  describe('Space Grouping', () => {
    it('renders group headers with correct testIDs', () => {
      const { getByTestId } = renderWithProviders(<TodayScreen />);

      expect(getByTestId('due-group-work')).toBeTruthy();
      expect(getByTestId('due-group-mexico-trip')).toBeTruthy();
      expect(getByTestId('due-group-no-space')).toBeTruthy();
    });

    it('displays correct item counts in group headers', () => {
      const { getByTestId, getByText } = renderWithProviders(<TodayScreen />);

      // Work has 2 todos
      const workGroup = getByTestId('due-group-work');
      expect(workGroup).toBeTruthy();
      // Check for the count "2" in the chip
      expect(getByText('2')).toBeTruthy();

      // Mexico Trip has 1 todo
      const mexicoGroup = getByTestId('due-group-mexico-trip');
      expect(mexicoGroup).toBeTruthy();
      expect(getByText('1')).toBeTruthy();
    });

    it('orders groups alphabetically with "No Space" last', () => {
      const { queryAllByTestId } = renderWithProviders(<TodayScreen />);

      const groupHeaders = queryAllByTestId(/due-group-/);
      const groupIds = groupHeaders.map((header) => header.props.testID);

      // Mexico Trip, Work, No Space (alphabetical, then No Space)
      expect(groupIds.indexOf('due-group-mexico-trip')).toBeLessThan(
        groupIds.indexOf('due-group-work'),
      );
      expect(groupIds.indexOf('due-group-work')).toBeLessThan(
        groupIds.indexOf('due-group-no-space'),
      );
    });

    it('removes empty groups after completion', async () => {
      // Mock data with single todo in a group
      const singleTodoData = {
        ...defaultMockData,
        todos: [
          {
            id: 't1',
            title: 'Work task',
            dueTime: '09:00',
            spaceName: 'Work',
            tags: [],
            overdue: false,
            nearDue: false,
          },
        ],
        visible: {
          habits: [],
          todos: [
            {
              id: 't1',
              title: 'Work task',
              dueTime: '09:00',
              spaceName: 'Work',
              tags: [],
              overdue: false,
              nearDue: false,
            },
          ],
          suggestions: [],
        },
      };

      mockUseTodayData.mockReturnValue(singleTodoData);

      const { getByTestId, queryByTestId } = renderWithProviders(<TodayScreen />);

      // Verify group exists initially
      expect(getByTestId('due-group-work')).toBeTruthy();

      // Complete the todo (checkbox)
      const todoCard = getByTestId('today-todo-card-t1');
      const checkbox = todoCard.findByProps({ testID: 'today-todo-checkbox-t1' });
      fireEvent.press(checkbox);

      // Group should be hidden (optimistic UI removes todo from display)
      await waitFor(() => {
        expect(queryByTestId('due-group-work')).toBeNull();
      });
    });
  });

  describe('Pull-to-Refresh', () => {
    it('calls reload and updates mascot wave tick', async () => {
      const reloadMock = jest.fn().mockResolvedValue(undefined);
      mockUseTodayData.mockReturnValue({
        ...defaultMockData,
        reload: reloadMock,
      });

      const { getByTestId } = renderWithProviders(<TodayScreen />);
      const scrollView = getByTestId('today-screen');

      // Trigger refresh
      const refreshControl = scrollView.findByType('RefreshControl' as any);
      if (refreshControl) {
        fireEvent(refreshControl, 'refresh');
      }

      // Wait for reload to complete
      await waitFor(() => {
        expect(reloadMock).toHaveBeenCalled();
      });

      // Note: Testing mascot wave animation is tricky in unit tests
      // Would need to inspect TodayMascotHeader props for waveTick change
      // This is better tested in integration/E2E tests
    });

    it('shows refreshing state during reload', async () => {
      let resolveReload: () => void;
      const reloadPromise = new Promise<void>((resolve) => {
        resolveReload = resolve;
      });

      const reloadMock = jest.fn().mockReturnValue(reloadPromise);
      mockUseTodayData.mockReturnValue({
        ...defaultMockData,
        reload: reloadMock,
      });

      const { getByTestId } = renderWithProviders(<TodayScreen />);
      const scrollView = getByTestId('today-screen');

      // Trigger refresh
      const refreshControl = scrollView.findByType('RefreshControl' as any);
      if (refreshControl) {
        fireEvent(refreshControl, 'refresh');
        expect(refreshControl.props.refreshing).toBe(true);

        // Resolve reload
        resolveReload!();

        await waitFor(() => {
          expect(refreshControl.props.refreshing).toBe(false);
        });
      }
    });
  });

  describe('Section Collapse State', () => {
    it('persists collapse state in session', () => {
      const { getByText, queryByTestId, rerender } = renderWithProviders(<TodayScreen />);

      // Toggle Due Today section
      const dueTodayHeader = getByText('Due Today');
      fireEvent.press(dueTodayHeader);

      // Content should be hidden
      expect(queryByTestId('today-section-due-today')).toBeNull();

      // Re-render (simulates state persistence)
      rerender(<TodayScreen />);

      // Section should still be collapsed
      expect(queryByTestId('today-section-due-today')).toBeNull();
    });

    it('maintains separate collapse state for each section', () => {
      const { getByText, queryByTestId } = renderWithProviders(<TodayScreen />);

      // Collapse Habits Today
      const habitsHeader = getByText('Habits Today');
      fireEvent.press(habitsHeader);
      expect(queryByTestId('today-section-habits-today')).toBeNull();

      // Due Today should still be visible
      expect(queryByTestId('today-section-due-today')).toBeTruthy();

      // Collapse Due Today
      const dueTodayHeader = getByText('Due Today');
      fireEvent.press(dueTodayHeader);
      expect(queryByTestId('today-section-due-today')).toBeNull();

      // Expand Habits Today
      fireEvent.press(habitsHeader);
      expect(queryByTestId('today-section-habits-today')).toBeTruthy();

      // Due Today should still be collapsed
      expect(queryByTestId('today-section-due-today')).toBeNull();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no todos', () => {
      mockUseTodayData.mockReturnValue({
        ...defaultMockData,
        todos: [],
        visible: {
          ...defaultMockData.visible,
          todos: [],
        },
      });

      const { getByText } = renderWithProviders(<TodayScreen />);

      expect(getByText('All clear for now ✨')).toBeTruthy();
    });

    it('does not render group headers when no todos', () => {
      mockUseTodayData.mockReturnValue({
        ...defaultMockData,
        todos: [],
        visible: {
          ...defaultMockData.visible,
          todos: [],
        },
      });

      const { queryByTestId } = renderWithProviders(<TodayScreen />);

      expect(queryByTestId(/due-group-/)).toBeNull();
    });
  });
});
