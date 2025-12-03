/**
 * SweepFlowScreen Summary Step Tests
 *
 * Tests for step 3: Summary/celebration and markSweepCompleted wiring
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SweepCandidate } from '../../../lib/sweep/types';

// Mock sweep engine with trackable markSweepCompleted
const mockFetchSweepCandidates = jest.fn<Promise<SweepCandidate[]>, [string, any]>();
const mockMarkSweepCompleted = jest.fn();
jest.mock('../../../lib/sweep/engine', () => {
  return {
    __esModule: true,
    fetchSweepCandidatesForUser: (...args: [string, any]) => mockFetchSweepCandidates(...args),
    applySweepAction: () => Promise.resolve(),
    markSweepCompleted: (...args: [string, any, any]) => {
      mockMarkSweepCompleted(...args);
      return Promise.resolve();
    },
  };
});

// Mock Supabase client
jest.mock('../../../lib/supabase/client', () => ({
  __esModule: true,
  supabase: { mockSupabase: true },
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
  useAuth: () => ({ user: { id: 'test-user-123' }, userId: 'test-user-123' }),
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
};

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigate through mood and wrap-up steps to reach decision step
 */
async function navigateToDecisionStep(result: ReturnType<typeof render>) {
  // Step 0: Mood - skip to step 1
  await waitFor(() => {
    result.getByText('How are you feeling?');
  });
  fireEvent.press(result.getByText('Skip for now'));

  // Step 1: Wrap Up (empty state) - advance to step 2
  await waitFor(() => {
    result.getByText('Wrap up today');
  });
  fireEvent.press(result.getByText('Start Sweep'));
}

/**
 * Navigate through all steps to reach summary step with mock candidates
 */
async function navigateToSummaryStep(result: ReturnType<typeof render>) {
  await navigateToDecisionStep(result);

  // Wait for decision step to load (empty state since no candidates)
  await waitFor(() => {
    result.getByText("Nothing to Sweep right now — you're all clear.");
  });

  // Press Done to go to Summary
  fireEvent.press(result.getByText('Done'));

  // Wait for Summary step
  await waitFor(() => {
    result.getByText('Sweep complete');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SweepFlowScreen - Summary Step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchSweepCandidates.mockResolvedValue([]);
  });

  describe('Summary Display', () => {
    it('shows "Sweep complete" title', async () => {
      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToSummaryStep(result);

      expect(result.getByText('Sweep complete')).toBeTruthy();
    });

    it('shows the subtitle message', async () => {
      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToSummaryStep(result);

      expect(
        result.getByText("You made clear choices about your day. Here's what you just did."),
      ).toBeTruthy();
    });

    it('shows the Done button', async () => {
      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToSummaryStep(result);

      expect(result.getByText('Done')).toBeTruthy();
    });

    it('shows empty state message when no items were processed', async () => {
      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToSummaryStep(result);

      expect(
        result.getByText("Nothing needed your attention this time — you're all clear."),
      ).toBeTruthy();
    });
  });

  describe('Stats Display with Items', () => {
    const mockTodoCandidate: SweepCandidate = {
      id: 'todo-1',
      kind: 'todo',
      createdAt: new Date().toISOString(),
      dropId: 'drop-1',
      skippedInSweepAt: null,
      raw: {
        id: 'todo-1',
        name: 'Test task',
        owner_id: 'test-user-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any,
    };

    it('shows kept count after keeping items', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToDecisionStep(result);

      // Wait for card to load
      await waitFor(() => {
        result.getByText('Test task');
      });

      // Keep the item
      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      // Wait for completion state
      await waitFor(() => {
        result.getByText('Finish Sweep');
      });

      // Finish the sweep
      fireEvent.press(result.getByText('Finish Sweep'));

      // Verify summary shows kept count
      await waitFor(() => {
        expect(result.getByText('Sweep complete')).toBeTruthy();
        expect(result.getByText('Kept')).toBeTruthy();
        expect(result.getByText('1')).toBeTruthy();
      });
    });

    it('shows cleared count after clearing items', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToDecisionStep(result);

      await waitFor(() => {
        result.getByText('Test task');
      });

      // Clear the item
      fireEvent.press(result.getByRole('button', { name: 'Clear this item' }));

      await waitFor(() => {
        result.getByText('Finish Sweep');
      });

      fireEvent.press(result.getByText('Finish Sweep'));

      await waitFor(() => {
        expect(result.getByText('Sweep complete')).toBeTruthy();
        expect(result.getByText('Cleared')).toBeTruthy();
        expect(result.getByText('1')).toBeTruthy();
      });
    });

    it('shows skipped count after skipping items', async () => {
      mockFetchSweepCandidates.mockResolvedValue([mockTodoCandidate]);

      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToDecisionStep(result);

      await waitFor(() => {
        result.getByText('Test task');
      });

      // Skip the item
      fireEvent.press(result.getByText('Skip until next Sweep'));

      await waitFor(() => {
        result.getByText('Finish Sweep');
      });

      fireEvent.press(result.getByText('Finish Sweep'));

      await waitFor(() => {
        expect(result.getByText('Sweep complete')).toBeTruthy();
        expect(result.getByText('Skipped for later')).toBeTruthy();
        expect(result.getByText('1')).toBeTruthy();
      });
    });
  });

  describe('Done Button Behavior', () => {
    it('calls navigation.goBack when Done is pressed', async () => {
      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToSummaryStep(result);

      fireEvent.press(result.getByText('Done'));

      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('markSweepCompleted Integration', () => {
    it('calls markSweepCompleted when finishing from empty state', async () => {
      mockFetchSweepCandidates.mockResolvedValue([]);

      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToSummaryStep(result);

      // markSweepCompleted should have been called
      expect(mockMarkSweepCompleted).toHaveBeenCalledTimes(1);
      expect(mockMarkSweepCompleted).toHaveBeenCalledWith(
        'test-user-123',
        { mockSupabase: true },
        { kept: 0, cleared: 0, skipped: 0 },
      );
    });

    it('calls markSweepCompleted with correct summary after processing items', async () => {
      const mockCandidates: SweepCandidate[] = [
        {
          id: 'todo-1',
          kind: 'todo',
          createdAt: new Date().toISOString(),
          dropId: 'drop-1',
          skippedInSweepAt: null,
          raw: {
            id: 'todo-1',
            name: 'Task 1',
            owner_id: 'test-user-123',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any,
        },
        {
          id: 'todo-2',
          kind: 'todo',
          createdAt: new Date().toISOString(),
          dropId: 'drop-2',
          skippedInSweepAt: null,
          raw: {
            id: 'todo-2',
            name: 'Task 2',
            owner_id: 'test-user-123',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any,
        },
        {
          id: 'todo-3',
          kind: 'todo',
          createdAt: new Date().toISOString(),
          dropId: 'drop-3',
          skippedInSweepAt: null,
          raw: {
            id: 'todo-3',
            name: 'Task 3',
            owner_id: 'test-user-123',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any,
        },
      ];
      mockFetchSweepCandidates.mockResolvedValue(mockCandidates);

      const result = render(<SweepFlowScreen navigation={mockNavigation} />);

      await navigateToDecisionStep(result);

      // Process each card: Keep, Clear, Skip
      await waitFor(() => {
        result.getByText('Task 1');
      });
      fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

      await waitFor(() => {
        result.getByText('Task 2');
      });
      fireEvent.press(result.getByRole('button', { name: 'Clear this item' }));

      await waitFor(() => {
        result.getByText('Task 3');
      });
      fireEvent.press(result.getByText('Skip until next Sweep'));

      // Finish the sweep
      await waitFor(() => {
        result.getByText('Finish Sweep');
      });
      fireEvent.press(result.getByText('Finish Sweep'));

      // Verify markSweepCompleted was called with correct summary
      await waitFor(() => {
        expect(mockMarkSweepCompleted).toHaveBeenCalledTimes(1);
      });

      expect(mockMarkSweepCompleted).toHaveBeenCalledWith(
        'test-user-123',
        { mockSupabase: true },
        { kept: 1, cleared: 1, skipped: 1 },
      );
    });
  });
});
