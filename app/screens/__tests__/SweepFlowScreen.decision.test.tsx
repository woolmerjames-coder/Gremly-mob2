/**
 * SweepFlowScreen Decision Step Tests
 *
 * Tests for step 2: Decision cards
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
  raw: {
    id: 'todo-1',
    name: 'Test task',
    owner_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};

const mockHabitCandidate: SweepCandidate = {
  id: 'habit-1',
  kind: 'habit',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
  raw: {
    id: 'habit-1',
    name: 'Test habit',
    owner_id: 'test-user-id',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as any,
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockHabitCandidate = mockHabitCandidate; // Keep for future tests

const mockNoteCandidate: SweepCandidate = {
  id: 'note-1',
  kind: 'note',
  createdAt: new Date().toISOString(),
  dropId: null,
  skippedInSweepAt: null,
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
 * Helper to render and navigate to decision step (step 2)
 */
async function renderAtDecisionStep() {
  const result = render(<SweepFlowScreen navigation={mockNavigation} />);

  // Step 0: Mood step - skip to step 1
  await waitFor(() => {
    result.getByText('How are you feeling?');
  });
  fireEvent.press(result.getByText('Skip for now'));

  // Step 1: Wrap up step (empty state) - advance to step 2
  await waitFor(() => {
    result.getByText('Wrap up today');
  });
  fireEvent.press(result.getByText('Start Sweep'));

  return result;
}

describe('SweepFlowScreen - Decision Step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default to empty candidates (will show empty state after loading)
    mockFetchSweepCandidates.mockResolvedValue([]);
  });

  describe('Loading State', () => {
    it('shows loading indicator while fetching candidates', async () => {
      // Make fetch hang
      mockFetchSweepCandidates.mockImplementation(() => new Promise(() => {}));

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByText('Preparing your Sweep…')).toBeTruthy();
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

    it('transitions to summary step when Done is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Done');
      });

      fireEvent.press(result.getByText('Done'));

      // Should now be on Summary step
      await waitFor(() => {
        expect(result.getByText('Sweep complete')).toBeTruthy();
      });

      // Press Done on Summary step to go back
      fireEvent.press(result.getByText('Done'));

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Card Display', () => {
    it('shows card content when candidates exist', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByText('Test task')).toBeTruthy();
      });
    });

    it('shows progress indicator', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByText('Item 1 of 2')).toBeTruthy();
      });
    });

    it('shows action buttons (Clear, Skip, Keep)', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        expect(result.getByRole('button', { name: 'Clear this item' })).toBeTruthy();
        expect(result.getByText('Skip until next Sweep')).toBeTruthy();
        expect(result.getByRole('button', { name: 'Keep this item' })).toBeTruthy();
      });
    });

    it('advances to next card when Keep is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Item 1 of 2');
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      await waitFor(() => {
        expect(result.getByText('Item 2 of 2')).toBeTruthy();
        expect(result.getByText('Test note')).toBeTruthy();
      });
    });

    it('advances to next card when Clear is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Item 1 of 2');
      });

      fireEvent.press(result.getByRole('button', { name: 'Clear this item' }));

      await waitFor(() => {
        expect(result.getByText('Item 2 of 2')).toBeTruthy();
      });
    });

    it('advances to next card when Skip is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Item 1 of 2');
      });

      fireEvent.press(result.getByText('Skip until next Sweep'));

      await waitFor(() => {
        expect(result.getByText('Item 2 of 2')).toBeTruthy();
      });
    });
  });

  describe('applySweepAction Integration', () => {
    beforeEach(() => {
      mockApplySweepAction.mockClear();
    });

    it('calls applySweepAction with type "keep" when Keep is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Keep this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      await waitFor(() => {
        expect(mockApplySweepAction).toHaveBeenCalledWith(
          { type: 'keep', id: 'todo-1', kind: 'todo' },
          expect.anything(),
        );
      });
    });

    it('calls applySweepAction with type "clear" when Clear is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Clear this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Clear this item' }));

      await waitFor(() => {
        expect(mockApplySweepAction).toHaveBeenCalledWith(
          { type: 'clear', id: 'todo-1', kind: 'todo' },
          expect.anything(),
        );
      });
    });

    it('calls applySweepAction with type "skip" when Skip is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Skip until next Sweep');
      });

      fireEvent.press(result.getByText('Skip until next Sweep'));

      await waitFor(() => {
        expect(mockApplySweepAction).toHaveBeenCalledWith(
          { type: 'skip', id: 'note-1', kind: 'note' },
          expect.anything(),
        );
      });
    });

    it('still advances when applySweepAction throws error', async () => {
      mockApplySweepAction.mockRejectedValueOnce(new Error('Network error'));
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Item 1 of 2');
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      // Should still advance despite error
      await waitFor(() => {
        expect(result.getByText('Item 2 of 2')).toBeTruthy();
      });
    });
  });

  describe('Completion State', () => {
    it('shows completion message after all cards processed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Keep this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      await waitFor(() => {
        expect(result.getByText('Sweep complete!')).toBeTruthy();
      });
    });

    it('shows Finish Sweep button after completion', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Keep this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      await waitFor(() => {
        expect(result.getByText('Finish Sweep')).toBeTruthy();
      });
    });

    it('transitions to summary step when Finish Sweep is pressed', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByRole('button', { name: 'Keep this item' });
      });

      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      await waitFor(() => {
        result.getByText('Finish Sweep');
      });

      fireEvent.press(result.getByText('Finish Sweep'));

      // Should now be on Summary step with stats
      await waitFor(() => {
        expect(result.getByText('Sweep complete')).toBeTruthy();
        expect(result.getByText('1')).toBeTruthy(); // keptCount
      });

      // Press Done on Summary step to go back
      fireEvent.press(result.getByText('Done'));

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Step Navigation', () => {
    it('hides previous step content after advancing', async () => {
      mockFetchSweepCandidates.mockResolvedValue([]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText("Nothing to Sweep right now — you're all clear.");
      });

      expect(result.queryByText('Wrap up today')).toBeNull();
      expect(result.queryByText('How are you feeling?')).toBeNull();
    });
  });

  describe('Open Edit / Fix This', () => {
    beforeEach(() => {
      mockOpenEdit.mockClear();
      mockGetById.mockReset();
    });

    it('calls openEdit when Fix button is pressed', async () => {
      const fullRecord = {
        id: 'todo-1',
        type: 'todo',
        name: 'Test task',
        owner_id: 'test-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockGetById.mockResolvedValue(fullRecord);
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Test task');
      });

      // Press the Fix button (shows as "✏️ Fix")
      fireEvent.press(result.getByLabelText('Fix this item'));

      await waitFor(() => {
        expect(mockGetById).toHaveBeenCalledWith('todo-1');
        expect(mockOpenEdit).toHaveBeenCalledWith({ record: fullRecord });
      });
    });

    it('calls openEdit when primary button is pressed', async () => {
      const fullRecord = {
        id: 'todo-1',
        type: 'todo',
        name: 'Test task',
        owner_id: 'test-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockGetById.mockResolvedValue(fullRecord);
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Review to-do details');
      });

      fireEvent.press(result.getByText('Review to-do details'));

      await waitFor(() => {
        expect(mockGetById).toHaveBeenCalledWith('todo-1');
        expect(mockOpenEdit).toHaveBeenCalledWith({ record: fullRecord });
      });
    });

    it('falls back to raw data when getById returns null', async () => {
      mockGetById.mockResolvedValue(null);
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Test task');
      });

      fireEvent.press(result.getByLabelText('Fix this item'));

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

    it('falls back to raw data when getById throws error', async () => {
      mockGetById.mockRejectedValue(new Error('Network error'));
      mockFetchSweepCandidates.mockResolvedValue([mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Test note');
      });

      fireEvent.press(result.getByLabelText('Fix this item'));

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
      const fullRecord = {
        id: 'todo-1',
        type: 'todo',
        name: 'Test task',
        owner_id: 'test-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockGetById.mockResolvedValue(fullRecord);
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate, mockNoteCandidate]);

      const result = await renderAtDecisionStep();

      await waitFor(() => {
        result.getByText('Item 1 of 2');
      });

      fireEvent.press(result.getByLabelText('Fix this item'));

      await waitFor(() => {
        expect(mockOpenEdit).toHaveBeenCalled();
      });

      // Card should still show item 1, not advance
      expect(result.getByText('Item 1 of 2')).toBeTruthy();
      expect(result.getByText('Test task')).toBeTruthy();
    });
  });
});
