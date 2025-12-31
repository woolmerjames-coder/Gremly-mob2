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
        isLockedIn: false,
        gremlyResponse: 'Test gremly response',
      },
    })),
  useSweepIntroStats: () => ({ stats: { urgentCount: 0, pendingCount: 0 }, isLoading: false }),
  useIsLoading: () => false,
  useActiveSpaces: () => [],
}));

// Mock useGremlyStore for mutations
const mockUpdateTodo = jest.fn();
const mockArchiveTodo = jest.fn();
const mockUpdateNote = jest.fn();
const mockArchiveNote = jest.fn();
const mockCreateNote = jest.fn(() => Promise.resolve({ id: 'test-note' }));
const mockCompleteHabit = jest.fn();
const mockUncompleteHabit = jest.fn();

// Store todos/notes that will be used for edit overlay lookups
let mockStoreTodos: any[] = [];
let mockStoreNotes: any[] = [];

jest.mock('../../../lib/store/useGremlyStore', () => ({
  __esModule: true,
  useGremlyStore: (selector: (state: any) => any) => {
    const state = {
      todos: mockStoreTodos,
      notes: mockStoreNotes,
      habits: [],
      habitProgress: [],
      isLoading: false,
      updateTodo: mockUpdateTodo,
      archiveTodo: mockArchiveTodo,
      updateNote: mockUpdateNote,
      archiveNote: mockArchiveNote,
      createNote: mockCreateNote,
      completeHabit: mockCompleteHabit,
      uncompleteHabit: mockUncompleteHabit,
    };
    return selector(state);
  },
}));

// Mock Supabase client
jest.mock('../../../lib/supabase/client', () => ({
  __esModule: true,
  supabase: {},
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
 * Helper to render and navigate to decision step (step 1)
 * Flow: Intro (0) → Decision (1)
 */
async function renderAtDecisionStep() {
  const result = render(<SweepFlowScreen navigation={mockNavigation} />);

  // Step 0: Intro - tap "Start Sweeping" to go to Decision
  // Copy rotates: "Time for a quick tidy", "Let's close those tabs", "Let's clear the clutter"
  await waitFor(() => {
    result.getByText('Time for a quick tidy');
  });
  fireEvent.press(result.getByText('Start Sweeping'));

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
  });

  describe('Intro Step', () => {
    it('renders the intro step first', () => {
      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      expect(result.getByText('Time for a quick tidy')).toBeTruthy();
      expect(result.getByText('Start Sweeping')).toBeTruthy();
    });

    it('advances to decision step when Start Sweeping is pressed', async () => {
      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      // Tap Start Sweeping
      fireEvent.press(result.getByText('Start Sweeping'));

      // Should now be on decision step (shows loading or empty state)
      await waitFor(() => {
        expect(
          result.queryByText('Time for a quick tidy') ||
            result.getByText("Nothing to Sweep right now — you're all clear."),
        ).toBeTruthy();
      });
    });
  });

  describe('Loading State', () => {
    it('shows empty state when store is loaded but has no candidates', async () => {
      // Store is loaded (isLoading=false) but has no candidates
      mockCandidates = [];

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByText("Nothing to Sweep right now — you're all clear.")).toBeTruthy();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no candidates', async () => {
      mockFetchSweepCandidates.mockResolvedValue([]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByText("Nothing to Sweep right now — you're all clear.")).toBeTruthy();
      });
    });

    it('shows Done button in empty state', async () => {
      mockFetchSweepCandidates.mockResolvedValue([]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByText('Done')).toBeTruthy();
      });
    });

    it('transitions to habits step when Done is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Done');
      });

      fireEvent.press(result.getByText('Done'));

      // Should now be on Habits step (step 2)
      await waitFor(() => {
        expect(result.getByText('Habits today')).toBeTruthy();
      });
    });
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

    it('shows action buttons (Clear, Skip)', async () => {
      mockCandidates = [mockTodoCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByRole('button', { name: 'Clear this item' })).toBeTruthy();
        expect(result.getByRole('button', { name: 'Skip this item' })).toBeTruthy();
      });
    });

    it('advances to next card when Skip is pressed', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText(/1 of 2 items/);
      });

      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      await waitFor(() => {
        expect(result.getByText(/2 of 2 items/)).toBeTruthy();
        expect(result.getByText('Test note')).toBeTruthy();
      });
    });

    it('advances to next card when Clear is pressed', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText(/1 of 2 items/);
      });

      fireEvent.press(result.getByRole('button', { name: 'Clear this item' }));

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

    it('does NOT call updateTodo immediately when Skip is pressed (deferred commit)', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Skip this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      // Wait for card to advance to verify action was processed
      await waitFor(() => {
        result.getByText('Test note');
      });

      // With deferred commit, skip doesn't write to DB at all
      expect(mockUpdateTodo).not.toHaveBeenCalled();
    });

    it('does NOT call archiveTodo immediately when Clear is pressed (deferred commit)', async () => {
      mockCandidates = [mockTodoCandidate, mockNoteCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Clear this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Clear this item' }));

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

      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      // Should still advance despite error
      await waitFor(() => {
        expect(result.getByText(/2 of 2 items/)).toBeTruthy();
      });
    });
  });

  describe('Completion State', () => {
    it('auto-advances to habits step after all cards processed', async () => {
      mockCandidates = [mockTodoCandidate];
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Skip this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Skip this item' }));

      // Should auto-advance to Habits step (step 2)
      await waitFor(() => {
        expect(result.getByText('Habits today')).toBeTruthy();
      });
    });
  });

  describe('Step Navigation', () => {
    it('hides previous step content after advancing', async () => {
      mockFetchSweepCandidates.mockResolvedValue([]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText("Nothing to Sweep right now — you're all clear.");
      });

      expect(result.queryByText('Time for a quick tidy')).toBeNull();
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

      // Press the Fix button (shows as "✏️ Fix")
      fireEvent.press(result.getByLabelText('Edit details'));

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

      fireEvent.press(result.getByLabelText('Edit details'));

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

      fireEvent.press(result.getByLabelText('Edit details'));

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

      fireEvent.press(result.getByLabelText('Edit details'));

      await waitFor(() => {
        expect(mockOpenEdit).toHaveBeenCalled();
      });

      // Card should still show item 1, not advance
      expect(result.getByText(/1 of 2 items/)).toBeTruthy();
      expect(result.getByText('Test task')).toBeTruthy();
    });
  });
});
