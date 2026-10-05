/**
 * SweepFlowScreen Decision Step Tests
 *
 * Tests for step 1: Decision cards
 * New flow: Intro (0) → Decision (1) → Mood (2) → Wrap-up (3) → Summary (4)
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SweepCandidate } from '../../../lib/sweep/types';

// Mock sweep engine
const mockFetchSweepCandidates = jest.fn<Promise<SweepCandidate[]>, [string, any]>();
const mockApplySweepAction = jest.fn<Promise<void>, [any, any]>().mockResolvedValue(undefined);
jest.mock('../../../lib/sweep/engine', () => ({
  __esModule: true,
  fetchSweepCandidatesForUser: (...args: [string, any]) => mockFetchSweepCandidates(...args),
  applySweepAction: (...args: [any, any]) => mockApplySweepAction(...args),
  markSweepCompleted: () => Promise.resolve(),
}));

// Mock store selectors - useSweepCandidatesUnified returns candidates with meta from store
let mockCandidates: SweepCandidate[] = [];
jest.mock('../../../lib/store/selectors', () => ({
  __esModule: true,
  useSweepCandidatesUnified: () =>
    mockCandidates.map((candidate) => ({
      candidate,
      meta: {
        typeChip: candidate.kind === 'todo' ? 'To-Do' : 'Log',
        todoStatus: null,
        logSubtype: null,
        isNew: false,
        resurfacingDate: null,
        spaceName: null,
        spaceId: null,
        gremlyResponse: 'Test gremly response',
      },
    })),
  useIsLoading: () => false,
  useActiveSpaces: () => [],
  useSkipBudget: () => ({ used: 0, remaining: 3, total: 3, canSkip: true }),
}));

jest.mock('../../../lib/store/useGremlyStore', () => {
  // Create the mock hook function
  const mockUseGremlyStore = (selector: (state: any) => any) => {
    const state = {
      todos: [],
      notes: mockLiveNotes,
      habits: [],
      worlds: [],
      dropWorldLinks: [],
      chapters: [],
      chapterWorldLinks: [],
      habitProgress: [],
      userCalendarEvents: [],
      isLoading: false,
      gremlyAge: 5,
      feedingGaugeValue: 0,
      isFedToday: false,
      fedDaysCount: 0,
      feedingHistory: [],
      fetchFeedingHistory: () => Promise.resolve(undefined),
      refreshSkipBudget: () => Promise.resolve(undefined),
      totalSweepCount: 10,
      demoSweepCompletedAt: '2025-01-01T00:00:00Z',
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
    demoSweepCompletedAt: '2025-01-01T00:00:00Z',
    calendarEvents: {},
    userCalendarEvents: [],
    currentDate: '2025-01-01',
    notes: [],
    worlds: [],
    dropWorldLinks: [],
    chapters: [],
    chapterWorldLinks: [],
    refreshSkipBudget: () => Promise.resolve(undefined),
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
const mockUpdateTodo = jest.fn();
const mockArchiveTodo = jest.fn();
const mockUpdateNote = jest.fn();
const mockArchiveNote = jest.fn();
const mockCreateNote = jest.fn(() => Promise.resolve({ id: 'test-note' }));
const mockCompleteHabit = jest.fn();
const mockUncompleteHabit = jest.fn();

// Store todos/notes that will be used for edit overlay lookups
let mockStoreTodos: any[] = [];
// Notes as the store has them now (an answer earlier in the Sweep may have cleared one)
let mockLiveNotes: any[] = [];
let mockStoreNotes: any[] = [];

// Mock Supabase client
jest.mock('../../../lib/supabase/client', () => ({
  __esModule: true,
  supabase: {
    auth: {
      onAuthStateChange: jest
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  },
}));

// Mock RepoProvider
const mockCreate = jest.fn(() => Promise.resolve({ id: 'test-note-id' }));
const mockGetById = jest.fn();
jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: mockCreate,
    getById: mockGetById,
  }),
}));

// Mock useOverlayController
const mockOpenEdit = jest.fn();
const mockOpenCreate = jest.fn();
const mockOpenView = jest.fn();
const mockClose = jest.fn();
jest.mock('../../../hooks/useOverlayController', () => ({
  __esModule: true,
  useOverlayController: () => ({
    state: { visible: false, mode: 'create', initialEntity: null, initialSpaceId: null },
    openEdit: mockOpenEdit,
    openCreate: mockOpenCreate,
    openView: mockOpenView,
    close: mockClose,
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

// The week planner's habits step is its own screen with its own tests: here it
// only has to show that the cards handed over to it
jest.mock('../../components/sweep/SweepHabitsCheckInStep', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    SweepHabitsCheckInStep: () => React.createElement(Text, null, 'Week habits step'),
  };
});

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
    useFocusEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useRoute: () => ({
      params: { week: true },
    }),
  };
});

// Mock OverlayContext — SweepFlowScreen uses useGlobalOverlay
jest.mock('../../../contexts/OverlayContext', () => {
  const React = require('react');
  return {
    __esModule: true,
    OverlayProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useGlobalOverlay: () => ({
      state: { visible: false, mode: 'create', entity: undefined },
      openCreate: jest.fn(),
      openEdit: jest.fn(),
      openView: jest.fn(),
      close: jest.fn(),
      openClarificationPopup: jest.fn(),
      closeClarificationPopup: jest.fn(),
    }),
  };
});

// Mock SweepSectionTransition to auto-dismiss (calls onContinue immediately)
jest.mock('../../../src/components/sweep/SweepSectionTransition', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    SweepSectionTransition: ({ onContinue }: { onContinue: () => void }) => {
      // Auto-continue to skip the transition in tests
      ReactModule.useEffect(() => {
        onContinue();
      }, [onContinue]);
      return null;
    },
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
const mockTodoCandidate: SweepCandidate = {
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
    name: 'Test task',
    owner_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

const mockNoteCandidate: SweepCandidate = {
  id: 'note-1',
  kind: 'note',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  isEventToday: false,
  isEventPassed: false,
  daysUntilEvent: null,
  raw: {
    id: 'note-1',
    title: 'Test note',
    body: 'Note body content',
    owner_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

/**
 * Helper to render and get to the cards. Sweep's whole list, saved at the
 * end, is the week planner's now: open it and take the guided path.
 */
async function renderAtDecisionStep() {
  const result = render(<SweepFlowScreen navigation={mockNavigation} />);

  await waitFor(() => {
    expect(result.getByText('Lead me through it all')).toBeTruthy();
  });
  fireEvent.press(result.getByText('Lead me through it all'));

  return result;
}

describe('SweepFlowScreen - Decision Step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default to empty candidates (will show empty state after loading)
    mockFetchSweepCandidates.mockResolvedValue([]);
    mockCandidates = [];
    mockStoreTodos = [];
    mockStoreNotes = [];
    mockLiveNotes = [];
  });

  describe('Card Display', () => {
    it('shows card content when candidates exist', async () => {
      mockCandidates = [mockTodoCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByText('Test task')).toBeTruthy();
      });
    });

    it('shows progress indicator', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByText(/1 of 2 items/)).toBeTruthy();
      });
    });

    it('shows action buttons (Let Go, Keep)', async () => {
      mockCandidates = [mockTodoCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByRole('button', { name: 'Let go of this item' })).toBeTruthy();
        expect(result.getByRole('button', { name: 'Keep this item' })).toBeTruthy();
      });
    });

    it('advances to next card when Keep is pressed', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText(/1 of 2 items/);
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      await waitFor(() => {
        expect(result.getByText(/2 of 2 items/)).toBeTruthy();
        expect(result.getByText('Test note')).toBeTruthy();
      });
    });

    it('advances to next card when Let Go is pressed', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText(/1 of 2 items/);
      });

      fireEvent.press(result.getByRole('button', { name: 'Let go of this item' }));

      await waitFor(() => {
        expect(result.getByText(/2 of 2 items/)).toBeTruthy();
      });
    });
  });

  describe('Store Mutations Integration', () => {
    beforeEach(() => {
      mockUpdateTodo.mockClear();
      mockArchiveTodo.mockClear();
    });

    // NOTE: With deferred commit pattern, mutations don't happen immediately.
    // Decisions are recorded locally and committed when sweep completes.
    // See SweepFlowScreen.deferred.test.tsx for comprehensive deferred commit tests.

    it('does NOT call updateTodo immediately when Keep is pressed (deferred commit)', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Keep this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      // Wait for card to advance to verify action was processed
      await waitFor(() => {
        result.getByText('Test note');
      });

      // With deferred commit, skip doesn't write to DB at all
      expect(mockUpdateTodo).not.toHaveBeenCalled();
    });

    it('does NOT call archiveTodo immediately when Let Go is pressed (deferred commit)', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Let go of this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Let go of this item' }));

      // Wait for card to advance to verify action was processed
      await waitFor(() => {
        result.getByText('Test note');
      });

      // With deferred commit, archiveTodo is NOT called until sweep completes
      expect(mockArchiveTodo).not.toHaveBeenCalled();
    });

    it('still advances when store mutation throws error', async () => {
      mockUpdateTodo.mockRejectedValueOnce(new Error('Network error'));
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText(/1 of 2 items/);
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      // Should still advance despite error
      await waitFor(() => {
        expect(result.getByText(/2 of 2 items/)).toBeTruthy();
      });
    });
  });

  describe('Completion State', () => {
    it('passes over a card whose item an answer earlier in the Sweep cleared', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);
      mockLiveNotes = [{ ...mockNoteCandidate.raw, archived: true }];

      const result = await renderAtDecisionStep();
      await waitFor(() => {
        result.getByText(/1 of 2 items/);
      });
      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      await waitFor(() => {
        expect(result.getByText('Week habits step')).toBeTruthy();
      });
      expect(result.queryByText('Test note')).toBeNull();
    });

    it('moves on to the habits step after all cards are processed', async () => {
      mockCandidates = [mockTodoCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Keep this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      // On to the week planner's habits step (step 2)
      await waitFor(() => {
        expect(result.getByText('Week habits step')).toBeTruthy();
      });
    });
  });

  describe('Open Edit / Fix This', () => {
    beforeEach(() => {
      mockOpenEdit.mockClear();
    });

    it('calls openEdit with todo from store when Fix button is pressed', async () => {
      const storeTodo = {
        id: 'todo-1',
        type: 'todo',
        name: 'Test task',
        owner_id: 'test-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockStoreTodos = [storeTodo];
      mockCandidates = [mockTodoCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Test task');
      });

      // Open Gremly menu, then tap 'Open details'
      fireEvent.press(result.getByRole('button', { name: 'Open Gremly menu' }));
      await waitFor(() => {
        result.getByText('Open details');
      });
      fireEvent.press(result.getByText('Open details'));

      await waitFor(() => {
        expect(mockOpenEdit).toHaveBeenCalledWith({
          record: expect.objectContaining({
            id: 'todo-1',
            type: 'todo',
            name: 'Test task',
          }),
        });
      });
    });

    it('falls back to raw data when todo not found in store', async () => {
      mockStoreTodos = []; // Empty store
      mockCandidates = [mockTodoCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Test task');
      });

      fireEvent.press(result.getByRole('button', { name: 'Open Gremly menu' }));
      await waitFor(() => {
        result.getByText('Open details');
      });
      fireEvent.press(result.getByText('Open details'));

      await waitFor(() => {
        expect(mockOpenEdit).toHaveBeenCalledWith({
          record: expect.objectContaining({
            id: 'todo-1',
            type: 'todo',
            name: 'Test task',
          }),
        });
      });
    });

    it('calls openEdit with note from store when Fix button is pressed', async () => {
      const storeNote = {
        id: 'note-1',
        type: 'note',
        title: 'Test note',
        body: 'Note body content',
        owner_id: 'test-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockStoreNotes = [storeNote];
      mockCandidates = [mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Test note');
      });

      fireEvent.press(result.getByRole('button', { name: 'Open Gremly menu' }));
      await waitFor(() => {
        result.getByText('Open details');
      });
      fireEvent.press(result.getByText('Open details'));

      await waitFor(() => {
        expect(mockOpenEdit).toHaveBeenCalledWith({
          record: expect.objectContaining({
            id: 'note-1',
            type: 'note',
            title: 'Test note',
          }),
        });
      });
    });

    it('does not advance card after opening edit', async () => {
      const storeTodo = {
        id: 'todo-1',
        type: 'todo',
        name: 'Test task',
        owner_id: 'test-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockStoreTodos = [storeTodo];
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText(/1 of 2 items/);
      });

      fireEvent.press(result.getByRole('button', { name: 'Open Gremly menu' }));
      await waitFor(() => {
        result.getByText('Open details');
      });
      fireEvent.press(result.getByText('Open details'));

      await waitFor(() => {
        expect(mockOpenEdit).toHaveBeenCalled();
      });

      // Card should still show item 1, not advance
      expect(result.getByText(/1 of 2 items/)).toBeTruthy();
      expect(result.getByText('Test task')).toBeTruthy();
    });
  });
});
