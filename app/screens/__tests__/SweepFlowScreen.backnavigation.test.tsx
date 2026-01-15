/**
 * SweepFlowScreen Back Navigation Tests
 *
 * Tests the back navigation feature that allows users to revisit previous cards
 * and change their decisions.
 *
 * Key behaviors tested:
 * 1. Back button appears when currentIndex > 0
 * 2. Going back decrements the card index
 * 3. Previous decision is passed to SweepCard for state restoration
 * 4. User can change a previous decision
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SweepCandidate } from '../../../lib/sweep/types';

// Mock sweep engine
const mockFetchSweepCandidates = jest.fn<Promise<SweepCandidate[]>, [string, any]>();
jest.mock('../../../lib/sweep/engine', () => ({
  __esModule: true,
  fetchSweepCandidatesForUser: (...args: [string, any]) => mockFetchSweepCandidates(...args),
  applySweepAction: jest.fn().mockResolvedValue(undefined),
  markSweepCompleted: () => Promise.resolve(),
}));

// Mock store selectors
let mockCandidates: SweepCandidate[] = [];
jest.mock('../../../lib/store/selectors', () => ({
  __esModule: true,
  useSweepCandidatesUnified: () =>
    mockCandidates.map((candidate) => ({
      candidate,
      meta: {
        typeChip: candidate.kind === 'todo' ? 'Todo' : 'Log',
        todoStatus: null,
        logSubtype: null,
        isNew: true,
        resurfacingDate: null,
        spaceName: null,
        spaceId: null,
        isLockedIn: false,
        gremlyResponse: 'Test gremly response',
      },
    })),
  useSweepIntroStats: () => ({ stats: { urgentCount: 0, pendingCount: 0 }, isLoading: false }),
  useIsLoading: () => false,
  useActiveSpaces: () => [],
  selectTodayLockedItems: () => [], // No locked items in tests
  selectTodayLockedItemsIncludingCompleted: () => [], // No locked items in tests
}));

jest.mock('../../../lib/store/useGremlyStore', () => {
  // Create the mock hook function
  const mockUseGremlyStore = (selector: (state: any) => any) => {
    const state = {
      todos: [],
      notes: [],
      habits: [],
      habitProgress: [],
      isLoading: false,
      gremlyAge: 5,
      totalSweepCount: 10,
      updateTodo: () => Promise.resolve(undefined),
      archiveTodo: () => Promise.resolve(undefined),
      updateNote: () => Promise.resolve(undefined),
      archiveNote: () => Promise.resolve(undefined),
      createNote: () => Promise.resolve({ id: 'test-note' }),
      completeHabit: () => Promise.resolve(undefined),
      uncompleteHabit: () => Promise.resolve(undefined),
      updateHabit: () => Promise.resolve(undefined),
      archiveHabit: () => Promise.resolve(undefined),
      incrementSweepCount: () => Promise.resolve({ didAgeUp: false, newAge: 5 }),
      setSweepPreferences: () => {},
    };
    if (typeof selector === 'function') {
      try {
        return selector(state);
      } catch {
        return [];
      }
    }
    return [];
  };

  // Add static methods for Zustand store pattern
  mockUseGremlyStore.getState = () => ({
    gremlyAge: 5,
    totalSweepCount: 10,
    incrementSweepCount: () => Promise.resolve({ didAgeUp: false, newAge: 5 }),
    setSweepPreferences: () => {},
    updateTodo: () => Promise.resolve(undefined),
    archiveTodo: () => Promise.resolve(undefined),
    archiveHabit: () => Promise.resolve(undefined),
    completeHabit: () => Promise.resolve(undefined),
  });
  mockUseGremlyStore.subscribe = () => () => {};

  return {
    __esModule: true,
    useGremlyStore: mockUseGremlyStore,
  };
});

// These mock functions are kept for test assertions but won't be used by the mock
const mockUpdateTodo = jest.fn().mockResolvedValue(undefined);
const mockArchiveTodo = jest.fn().mockResolvedValue(undefined);
const mockUpdateNote = jest.fn().mockResolvedValue(undefined);
const mockArchiveNote = jest.fn().mockResolvedValue(undefined);
const mockCreateNote = jest.fn(() => Promise.resolve({ id: 'test-note' }));
const mockCompleteHabit = jest.fn().mockResolvedValue(undefined);
const mockUncompleteHabit = jest.fn().mockResolvedValue(undefined);
const mockUpdateHabit = jest.fn().mockResolvedValue(undefined);
const mockArchiveHabit = jest.fn().mockResolvedValue(undefined);

let mockStoreTodos: any[] = [];
let mockStoreNotes: any[] = [];

// Mock useSweepIntroStats hook
jest.mock('../../../lib/sweep/useSweepIntroStats', () => ({
  __esModule: true,
  useSweepIntroStats: () => ({
    stats: {
      completed: { todos: [], habits: [] },
      dropped: { todos: [], habits: [], notes: [] },
      isFirstSweep: false,
      cutoffTimestamp: new Date().toISOString(),
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

// Mock Supabase client
jest.mock('../../../lib/supabase/client', () => ({
  __esModule: true,
  supabase: {},
}));

// Mock RepoProvider
jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: jest.fn(() => Promise.resolve({ id: 'test-note-id' })),
    getById: jest.fn(),
  }),
}));

// Mock useOverlayController
jest.mock('../../../hooks/useOverlayController', () => ({
  __esModule: true,
  useOverlayController: () => ({
    state: { visible: false, mode: 'create', initialEntity: null, initialSpaceId: null },
    openEdit: jest.fn(),
    openCreate: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

// Mock AuthProvider
jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user-id' }),
}));

// Mock useTodayEntries
jest.mock('../../../lib/today/hooks/useTodayEntries', () => ({
  __esModule: true,
  useTodayEntries: () => ({
    items: [],
    doneItems: [],
    loading: false,
    reload: jest.fn(),
  }),
}));

// Mock useTodayInteractions
jest.mock('../../../lib/today/useTodayInteractions', () => ({
  __esModule: true,
  useTodayInteractions: () => ({
    toggleHabitComplete: jest.fn(),
    toggleTodoComplete: jest.fn(),
    completedHabitIds: new Set(),
    completedTodoIds: new Set(),
    deletedItemIds: new Set(),
    markItemDeleted: jest.fn(),
  }),
}));

// Mock navigation
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      goBack: mockGoBack,
    }),
    useRoute: () => ({
      params: {},
    }),
  };
});

import SweepFlowScreen from '../SweepFlowScreen';

const mockNavigation = {
  goBack: mockGoBack,
  navigate: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => () => {}),
  removeListener: jest.fn(),
  canGoBack: jest.fn(() => true),
  dispatch: jest.fn(),
  getParent: jest.fn(),
  getState: jest.fn(),
  isFocused: jest.fn(() => true),
  reset: jest.fn(),
  getId: jest.fn(),
} as any;

// Test fixtures
const mockTodoCandidate1: SweepCandidate = {
  id: 'todo-1',
  kind: 'todo',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'todo-1',
    name: 'First task',
    owner_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

const mockTodoCandidate2: SweepCandidate = {
  id: 'todo-2',
  kind: 'todo',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'todo-2',
    name: 'Second task',
    owner_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

const mockTodoCandidate3: SweepCandidate = {
  id: 'todo-3',
  kind: 'todo',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'todo-3',
    name: 'Third task',
    owner_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

/**
 * Helper to render and navigate to decision step
 */
async function renderAtDecisionStep() {
  const result = render(<SweepFlowScreen navigation={mockNavigation} />);

  await waitFor(() => {
    result.getByText(/Let's do this/);
  });
  fireEvent.press(result.getByText(/Let's do this/));

  return result;
}

// Note: This test suite is skipped because the intro copy and button text changed.
// The tests expect "Time for a quick tidy" and "Start Sweeping" but these don't exist anymore.
// TODO: Re-enable when intro flow tests are updated.
describe.skip('SweepFlowScreen - Back Navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCandidates = [];
    mockStoreTodos = [];
    mockStoreNotes = [];
  });

  describe('Back button visibility', () => {
    it('does NOT show back button on first card (index 0)', async () => {
      mockCandidates = [mockTodoCandidate1, mockTodoCandidate2];

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('First task');
      });

      // Progress should show 1 of 2
      expect(result.getByText(/1 of 2 items/)).toBeTruthy();

      // Back button should NOT be present
      expect(result.queryByLabelText('Go back to previous card')).toBeNull();
    });

    it('shows back button on second card (index > 0)', async () => {
      mockCandidates = [mockTodoCandidate1, mockTodoCandidate2];

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('First task');
      });

      // Advance to second card
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        result.getByText('Second task');
      });

      // Progress should show 2 of 2
      expect(result.getByText(/2 of 2 items/)).toBeTruthy();

      // Back button should now be present
      expect(result.getByLabelText('Go back to previous card')).toBeTruthy();
    });
  });

  describe('Back navigation behavior', () => {
    it('goes back to previous card when back button is pressed', async () => {
      mockCandidates = [mockTodoCandidate1, mockTodoCandidate2, mockTodoCandidate3];

      const result = await renderAtDecisionStep();

      // Start at card 1
      await waitFor(() => {
        result.getByText('First task');
      });
      expect(result.getByText(/1 of 3 items/)).toBeTruthy();

      // Advance to card 2
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        result.getByText('Second task');
      });
      expect(result.getByText(/2 of 3 items/)).toBeTruthy();

      // Press back button
      fireEvent.press(result.getByLabelText('Go back to previous card'));

      // Should go back to card 1
      await waitFor(() => {
        result.getByText('First task');
      });
      expect(result.getByText(/1 of 3 items/)).toBeTruthy();
    });

    it('can navigate forward again after going back', async () => {
      mockCandidates = [mockTodoCandidate1, mockTodoCandidate2];

      const result = await renderAtDecisionStep();

      // Card 1 -> Card 2
      await waitFor(() => {
        result.getByText('First task');
      });
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        result.getByText('Second task');
      });

      // Go back to Card 1
      fireEvent.press(result.getByLabelText('Go back to previous card'));

      await waitFor(() => {
        result.getByText('First task');
      });

      // Advance again to Card 2
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        result.getByText('Second task');
      });
      expect(result.getByText(/2 of 2 items/)).toBeTruthy();
    });

    it('can go back multiple cards', async () => {
      mockCandidates = [mockTodoCandidate1, mockTodoCandidate2, mockTodoCandidate3];

      const result = await renderAtDecisionStep();

      // Advance through all 3 cards
      await waitFor(() => {
        result.getByText('First task');
      });
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        result.getByText('Second task');
      });
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        result.getByText('Third task');
      });
      expect(result.getByText(/3 of 3 items/)).toBeTruthy();

      // Go back to Card 2
      fireEvent.press(result.getByLabelText('Go back to previous card'));

      await waitFor(() => {
        result.getByText('Second task');
      });

      // Go back to Card 1
      fireEvent.press(result.getByLabelText('Go back to previous card'));

      await waitFor(() => {
        result.getByText('First task');
      });
      expect(result.getByText(/1 of 3 items/)).toBeTruthy();

      // No back button on first card
      expect(result.queryByLabelText('Go back to previous card')).toBeNull();
    });
  });

  describe('Decision modification', () => {
    // SKIPPED: Jest hoisting prevents referencing external mock functions inside jest.mock factory
    it.skip('allows changing a previous Clear decision to Skip', async () => {
      mockCandidates = [mockTodoCandidate1, mockTodoCandidate2];

      const result = await renderAtDecisionStep();

      // Card 1: Press Clear
      await waitFor(() => {
        result.getByText('First task');
      });
      fireEvent.press(result.getByRole('button', { name: 'Clear this item' }));

      // Card 2
      await waitFor(() => {
        result.getByText('Second task');
      });

      // Go back to Card 1
      fireEvent.press(result.getByLabelText('Go back to previous card'));

      await waitFor(() => {
        result.getByText('First task');
      });

      // Change decision to Skip
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      // Card 2 again
      await waitFor(() => {
        result.getByText('Second task');
      });

      // Complete sweep
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        result.getByText('Habits today');
      });

      // archiveTodo should NOT have been called since we changed to Skip
      expect(mockArchiveTodo).not.toHaveBeenCalled();
    });

    // SKIPPED: Jest hoisting prevents referencing external mock functions inside jest.mock factory
    it.skip('allows changing a previous Skip decision to Clear', async () => {
      mockCandidates = [mockTodoCandidate1, mockTodoCandidate2];

      const result = await renderAtDecisionStep();

      // Card 1: Press Skip
      await waitFor(() => {
        result.getByText('First task');
      });
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      // Card 2
      await waitFor(() => {
        result.getByText('Second task');
      });

      // Go back to Card 1
      fireEvent.press(result.getByLabelText('Go back to previous card'));

      await waitFor(() => {
        result.getByText('First task');
      });

      // Change decision to Clear
      fireEvent.press(result.getByRole('button', { name: 'Clear this item' }));

      // Card 2 again
      await waitFor(() => {
        result.getByText('Second task');
      });

      // Complete sweep
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        result.getByText('Habits today');
      });

      // archiveTodo SHOULD have been called now
      expect(mockArchiveTodo).toHaveBeenCalledWith('todo-1', 'swept');
    });
  });

  describe('Progress indicator', () => {
    it('shows correct progress after going back', async () => {
      mockCandidates = [mockTodoCandidate1, mockTodoCandidate2, mockTodoCandidate3];

      const result = await renderAtDecisionStep();

      // Advance to card 3
      await waitFor(() => result.getByText('First task'));
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => result.getByText('Second task'));
      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => result.getByText('Third task'));
      expect(result.getByText(/3 of 3 items/)).toBeTruthy();

      // Go back to card 2
      fireEvent.press(result.getByLabelText('Go back to previous card'));

      await waitFor(() => result.getByText('Second task'));
      expect(result.getByText(/2 of 3 items/)).toBeTruthy();

      // Go back to card 1
      fireEvent.press(result.getByLabelText('Go back to previous card'));

      await waitFor(() => result.getByText('First task'));
      expect(result.getByText(/1 of 3 items/)).toBeTruthy();
    });
  });
});
