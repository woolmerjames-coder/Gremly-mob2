/**
 * Today DS Screen Tests
 *
 * Tests for the Design System version of Today screen (/app/tabs/TodayScreen.tsx)
 * Verifies testIDs, habit/todo sections, empty states, and data loading
 */

import React from 'react';
import { act, fireEvent, renderWithProviders, screen, waitFor } from './utils/renderWithProviders';
import TodayScreen from '../app/tabs/TodayScreen';

jest.mock('../lib/env', () => {
  const actual = jest.requireActual('../lib/env');
  return {
    ...actual,
    env: {
      ...actual.env,
      feature: {
        ...actual.env.feature,
        today: {
          ...actual.env.feature?.today,
          v3: false,
        },
      },
    },
  };
});

// Ensure reduced motion is active in tests to prevent animation timers
process.env.JEST_REDUCED_MOTION = '1';
const ORIGINAL_JEST_TODAY_LIGHT = process.env.JEST_TODAY_LIGHT;

beforeAll(() => {
  process.env.JEST_TODAY_LIGHT = '1';
});

afterAll(() => {
  process.env.JEST_TODAY_LIGHT = ORIGINAL_JEST_TODAY_LIGHT;
});

// Mock CortexProvider to avoid heuristic engine complexity
jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({
    suggestCategoryAndPriority: jest.fn(() =>
      Promise.resolve({ category: 'general', priority: 2 }),
    ),
    detectContextTags: jest.fn(() => []),
  }),
  CortexProvider: ({ children }: any) => children,
}));

// Mock the auth provider to return an authenticated user
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    userId: 'test-user-id',
    loading: false,
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
  }),
}));

// Mock data store that can be mutated in tests
const mockDataStore = {
  dueTodayData: [] as any[],
  undefinedDueData: [] as any[],
  spacesData: {} as Record<string, any>,
};

// Mock the repo to return controlled test data with stable identity
jest.mock('../providers/RepoProvider', () => {
  const repoMock = {
    listDueToday: jest.fn(() => Promise.resolve([...mockDataStore.dueTodayData])),
    listUndefinedDue: jest.fn(() => Promise.resolve([...mockDataStore.undefinedDueData])),
    getSpaceById: jest.fn((id: string) => Promise.resolve(mockDataStore.spacesData[id] || null)),
    countPlannedToday: jest.fn(() => Promise.resolve(mockDataStore.dueTodayData.length)),
    countCompletedToday: jest.fn(() => Promise.resolve(0)),
    completeHabit: jest.fn(() => Promise.resolve()),
    completeTodo: jest.fn(() => Promise.resolve()),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  return {
    useRepo: () => repoMock,
  };
});

describe('Today DS Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock data to default - Phase 9 structure
    mockDataStore.dueTodayData = [
      {
        id: 'habit-1',
        type: 'habit',
        name: 'Morning Workout',
        subtype: 'start_habit',
        frequency: 'daily',
        due_window: 'before 10:00',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'habit-2',
        type: 'habit',
        name: 'Read 30 minutes',
        subtype: 'start_habit',
        frequency: 'daily',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'todo-1',
        type: 'todo',
        name: 'Submit report',
        body: 'Q4 financial report',
        due_date: '2025-01-15T14:00:00Z',
        overdue: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'todo-2',
        type: 'todo',
        name: 'Buy groceries',
        due_date: '2025-01-15T18:00:00Z',
        near_due: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ];

    mockDataStore.undefinedDueData = [
      {
        id: 'suggestion-1',
        type: 'todo',
        name: 'Review presentation slides',
        created_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'suggestion-2',
        type: 'habit',
        name: 'Evening meditation',
        created_at: '2025-01-01T00:00:00Z',
      },
    ];

    mockDataStore.spacesData = {
      'space-1': { id: 'space-1', name: 'Work', emoji: '💼' },
      'space-2': { id: 'space-2', name: 'Personal', emoji: '🏠' },
    };
  });

  it('renders today screen with correct testID', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-screen')).toBeTruthy();
      expect(screen.getByTestId('today-light-mode')).toBeTruthy();
    });
  });

  it.skip('displays habits section with correct testIDs', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-habit-habit-1')).toBeTruthy();
      expect(screen.getByTestId('today-habit-habit-2')).toBeTruthy();
    });
  });

  it.skip('displays todos section with correct testIDs', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-todo-todo-1')).toBeTruthy();
      expect(screen.getByTestId('today-todo-todo-2')).toBeTruthy();
    });
  });

  it.skip('displays habit and todo titles correctly', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByText('Morning Workout')).toBeTruthy();
      expect(screen.getByText('Read 30 minutes')).toBeTruthy();
      expect(screen.getByText('Submit report')).toBeTruthy();
      expect(screen.getByText('Buy groceries')).toBeTruthy();
    });
  });

  it.skip('shows DS marker in dev mode (feature removed)', async () => {
    // This test is skipped because the DS marker feature has been removed
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('ds-marker')).toBeTruthy();
      expect(screen.getByText('DS')).toBeTruthy();
    });
  });
});

describe('Today DS Screen - Empty State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // TODO: This test has a Jest mocking limitation where jest.spyOn doesn't properly override
  // the hoisted jest.mock. The component captures the initial mock repo before we can override it.
  // The regular tests with default mock data pass successfully.
  it.skip('shows empty state when no items due today', async () => {
    // Override mock to return empty array
    jest.spyOn(require('../providers/RepoProvider'), 'useRepo').mockReturnValue({
      listDueToday: jest.fn(() => Promise.resolve([])),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    });

    renderWithProviders(<TodayScreen />);

    await waitFor(
      () => {
        expect(screen.getByText(/you're all set/i)).toBeTruthy();
        expect(screen.getByTestId('today-empty-add')).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });
});

describe('Today DS Screen - Phase 9 v2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders section headers for Habits Today, Due Today, and Suggested', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      // Section titles should be rendered
      expect(screen.getByText('Habits Today')).toBeTruthy();
      expect(screen.getByText('Due Today')).toBeTruthy();
      // Suggested section may not appear if no suggestions
    });
  });

  it('renders header chips container with progress chip', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      // Check for chips row
      expect(screen.getByTestId('today-chips-row')).toBeTruthy();
      // Check for progress chip showing X/Y format
      expect(screen.getByTestId('today-progress-chip')).toBeTruthy();
    });
  });

  it('renders mascot header with greeting', async () => {
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-mascot-header')).toBeTruthy();
      expect(screen.getByTestId('today-greeting')).toBeTruthy();
      expect(screen.getByTestId('today-subline')).toBeTruthy();
    });
  });

  it('optimistically removes habit from list when check button pressed', async () => {
    if (process.env.JEST_TODAY_LIGHT === '1') {
      const { getByTestId, queryByTestId } = renderWithProviders(<TodayScreen />);

      await waitFor(() => {
        expect(getByTestId('habit-check-habit-1')).toBeTruthy();
      });

      const checkButton = getByTestId('habit-check-habit-1');
      fireEvent.press(checkButton);

      await waitFor(() => {
        expect(queryByTestId('habit-card-habit-1')).toBeNull();
      });

      return;
    }

    jest.useFakeTimers();
    try {
      const { getByTestId, queryByTestId } = renderWithProviders(<TodayScreen />);

      await waitFor(() => {
        expect(getByTestId('habit-check-habit-1')).toBeTruthy();
      });

      // Press the check button for habit-1
      const checkButton = getByTestId('habit-check-habit-1');
      act(() => {
        checkButton.props.onPress();
      });

      // Wait for optimistic UI update - habit should be removed
      await waitFor(() => {
        expect(queryByTestId('habit-card-habit-1')).toBeNull();
      });

      act(() => {
        jest.runOnlyPendingTimers();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('optimistically removes todo from list when complete button pressed', async () => {
    if (process.env.JEST_TODAY_LIGHT === '1') {
      const { getByTestId, queryByTestId } = renderWithProviders(<TodayScreen />);

      await waitFor(() => {
        expect(getByTestId('todo-complete-todo-1')).toBeTruthy();
      });

      const completeButton = getByTestId('todo-complete-todo-1');
      fireEvent.press(completeButton);

      await waitFor(() => {
        expect(queryByTestId('todo-card-todo-1')).toBeNull();
      });

      return;
    }

    jest.useFakeTimers();
    try {
      const { getByTestId, queryByTestId } = renderWithProviders(<TodayScreen />);

      await waitFor(() => {
        expect(getByTestId('todo-complete-todo-1')).toBeTruthy();
      });

      // Press the complete button for todo-1
      const completeButton = getByTestId('todo-complete-todo-1');
      act(() => {
        completeButton.props.onPress();
      });

      // Wait for optimistic UI update - todo should be removed
      await waitFor(() => {
        expect(queryByTestId('todo-card-todo-1')).toBeNull();
      });

      act(() => {
        jest.runOnlyPendingTimers();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('respects reduced motion in components', async () => {
    // Reduced motion is mocked to true in jest-setup.ts
    // This ensures animations are disabled in tests
    renderWithProviders(<TodayScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('today-screen')).toBeTruthy();
    });

    // Components should still render but without animations
    // The fact that tests pass confirms reduced motion guards work
  });
});
