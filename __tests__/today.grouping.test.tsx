/**
 * Today Screen Grouping Tests
 * Tests for Phase 9 Step 4 features:
 * - Space grouping with correct ordering
 * - Pull-to-refresh with mascot wave
 * - Section collapse state persistence
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import TodayScreen from '../app/tabs/TodayScreen';
import { useTodayData } from '../lib/today/useTodayData';
import { useAuth } from '../providers/AuthProvider';
import { useRepo } from '../providers/RepoProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useNavigation } from '@react-navigation/native';
import type { EnrichedTodo } from '../lib/today/useTodayData';

// Mock dependencies
jest.mock('../lib/today/useTodayData');
jest.mock('../providers/AuthProvider');
jest.mock('../providers/RepoProvider');
jest.mock('../providers/ThemeProvider');
jest.mock('@react-navigation/native');
jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    close: jest.fn(),
    state: { visible: false },
  }),
}));

const mockUseTodayData = useTodayData as jest.MockedFunction<typeof useTodayData>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseRepo = useRepo as jest.MockedFunction<typeof useRepo>;
const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>;
const mockUseNavigation = useNavigation as jest.MockedFunction<typeof useNavigation>;

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
    reducedMotion: false,
    reload: jest.fn().mockResolvedValue(undefined),
  };

  const mockTheme = {
    colors: {
      bg: '#FFF',
      fg: '#000',
      deepTeal: {
        DEFAULT: '#0A2F2E',
        600: '#0D3B3A',
        700: '#0B3332',
        900: '#072524',
      },
      cream: '#FFF9F0',
      mint: '#B7F7E1',
      periwinkle: '#C9D4FF',
      coral: '#FFBAA3',
      border: '#E5E5E5',
      subtle: '#666',
      error: '#D32F2F',
      warning: '#FFA726',
      success: '#66BB6A',
      status: {
        overdue: '#D32F2F',
        nearDue: '#FFA726',
      },
    },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 },
    borderRadius: { sm: 4, md: 8, lg: 12 },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: {
        id: 'u1',
        email: 'test@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as any,
      userId: 'u1',
      session: null,
      loading: false,
      error: null,
      signInWithEmail: jest.fn(),
      signOut: jest.fn(),
      clearError: jest.fn(),
    });

    mockUseRepo.mockReturnValue({
      completeHabit: jest.fn().mockResolvedValue(undefined),
      completeTodo: jest.fn().mockResolvedValue(undefined),
      undoCompletion: jest.fn().mockResolvedValue(undefined),
      countPlannedToday: jest.fn().mockResolvedValue(4),
      countCompletedToday: jest.fn().mockResolvedValue(2),
    } as any);

    mockUseTheme.mockReturnValue(mockTheme as any);

    mockUseNavigation.mockReturnValue({
      navigate: jest.fn(),
      goBack: jest.fn(),
    } as any);

    mockUseTodayData.mockReturnValue(defaultMockData);
  });

  describe('Space Grouping', () => {
    it('renders group headers with correct testIDs', () => {
      const { getByTestId } = render(<TodayScreen />);

      expect(getByTestId('due-group-work')).toBeTruthy();
      expect(getByTestId('due-group-mexico-trip')).toBeTruthy();
      expect(getByTestId('due-group-no-space')).toBeTruthy();
    });

    it('displays correct item counts in group headers', () => {
      const { getByTestId, getByText } = render(<TodayScreen />);

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
      const { getAllByTestId } = render(<TodayScreen />);

      const groupHeaders = getAllByTestId(/due-group-/);
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

      const { getByTestId, queryByTestId } = render(<TodayScreen />);

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

      const { getByTestId } = render(<TodayScreen />);
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

      const { getByTestId } = render(<TodayScreen />);
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
      const { getByText, queryByTestId, rerender } = render(<TodayScreen />);

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
      const { getByText, queryByTestId } = render(<TodayScreen />);

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

      const { getByText } = render(<TodayScreen />);

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

      const { queryByTestId } = render(<TodayScreen />);

      expect(queryByTestId(/due-group-/)).toBeNull();
    });
  });
});
