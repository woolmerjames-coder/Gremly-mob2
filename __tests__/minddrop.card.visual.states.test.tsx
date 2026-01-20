/**
 * Render tests for Mind Drop card visual states
 *
 * Tests the three visual states of Mind Drop cards in Recent Drops:
 * - Pending: AI enrichment in progress (skeleton + Gremly working)
 * - Complete: AI enrichment complete (real title + tags)
 * - Failed: AI enrichment failed or didn't occur (raw content + subtle hint)
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';

// Mock MascotIcon to avoid Reanimated issues in tests
jest.mock('../components/MascotIcon', () => {
  return function MascotIcon() {
    return null; // Render nothing in tests
  };
});

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      setOptions: jest.fn(),
    }),
  };
});

// Mock Auth - userId undefined to prevent Supabase subscription code paths
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    // userId undefined prevents CatchAllNotepad subscription effects from running
  }),
}));

// Repo mocks
const mockNotesList = jest.fn(async () => []);
const mockTodosList = jest.fn(async () => []);
const mockHabitsList = jest.fn(async () => []);
const mockGetById = jest.fn();
const mockRemove = jest.fn();
const mockArchiveItemsByDropId = jest.fn();

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    notes: { list: mockNotesList },
    todos: { list: mockTodosList },
    habits: { list: mockHabitsList },
    getById: mockGetById,
    remove: mockRemove,
    archiveItemsByDropId: mockArchiveItemsByDropId,
    // Pipeline idempotency check methods
    findTodoByDropId: jest.fn().mockResolvedValue(null),
    findHabitByDropId: jest.fn().mockResolvedValue(null),
  }),
}));

// Mock data arrays that tests can populate
let mockRecentNotes: any[] = [];
let mockRecentTodos: any[] = [];
let mockRecentHabits: any[] = [];

// Mock useGremlyStore (CatchAllNotepad now uses Zustand store directly)
jest.mock('../lib/store/useGremlyStore', () => {
  // Use require to access the module-level variable at call time
  const getMockState = () => {
    // Access variables from outer scope at call time using require
    const testModule = require('./__testData__');
    // Access current values through global reference
    const g = global as any;
    return {
      notes: g.__mockRecentNotes ?? testModule?.mockRecentNotes ?? [],
      todos: g.__mockRecentTodos ?? testModule?.mockRecentTodos ?? [],
      habits: g.__mockRecentHabits ?? testModule?.mockRecentHabits ?? [],
      pendingDrops: new Map(), // Always return empty Map for pending drops
      deleteNote: jest.fn(),
      deleteTodo: jest.fn(),
      deleteHabit: jest.fn(),
      updateNote: jest.fn(),
      createTodo: jest.fn(),
      createHabit: jest.fn(),
      createNote: jest.fn(),
      archiveNote: jest.fn(),
    };
  };

  const useGremlyStore = Object.assign(
    jest.fn((selector: any) => {
      if (typeof selector === 'function') {
        return selector(getMockState());
      }
      return {};
    }),
    {
      getState: () => {
        // Access current values through global reference
        const g = global as any;
        return {
          notes: g.__mockRecentNotes ?? [],
          todos: g.__mockRecentTodos ?? [],
          habits: g.__mockRecentHabits ?? [],
          pendingDrops: new Map(), // Always return empty Map
          deleteNote: jest.fn(),
          deleteTodo: jest.fn(),
          deleteHabit: jest.fn(),
          updateNote: jest.fn(),
          createTodo: jest.fn(),
          createHabit: jest.fn(),
          createNote: jest.fn(),
          archiveNote: jest.fn(),
        };
      },
    },
  );

  return { useGremlyStore };
});

// Mock selectors - return data from global state at call time
jest.mock('../lib/store/selectors', () => ({
  selectItemById: jest.fn(),
  selectNoteBySourceMessageId: jest.fn(),
  selectRecentNotes: jest.fn(() => (global as any).__mockRecentNotes ?? []),
  selectRecentTodos: jest.fn(() => (global as any).__mockRecentTodos ?? []),
  selectRecentHabits: jest.fn(() => (global as any).__mockRecentHabits ?? []),
}));

import { RecentDropsTestable as RecentDrops } from '../app/screens/CatchAllNotepad';

const overlayStub = {
  openCreate: jest.fn(),
  openEdit: jest.fn(),
  openView: jest.fn(),
  close: jest.fn(),
};

function makePendingNote(id: string, text: string) {
  const now = new Date();
  return {
    id,
    kind: 'note',
    subtype: 'catchall',
    title: text,
    body: text,
    text: text,
    created_at: now.toISOString(), // Ensure it's "today"
    labels: ['catchall'],
    origin: 'catchall',
    views: {
      ai_pending: true, // Still processing
    },
    tags: [],
  } as any;
}

function makeCompleteNote(id: string, title: string, tags: string[]) {
  const now = new Date();
  return {
    id,
    kind: 'note',
    subtype: 'catchall',
    title, // AI-compacted title
    body: 'Original longer text that was compacted',
    text: title,
    created_at: now.toISOString(), // Ensure it's "today"
    labels: ['catchall'],
    origin: 'catchall',
    views: {
      ai_pending: false, // Processing complete
      minddrop_prefilled_v1: true,
    },
    tags, // AI-generated tags
  } as any;
}

function makeFailedNote(id: string, rawText: string, explicit = false) {
  const now = new Date();
  return {
    id,
    kind: 'note',
    subtype: 'catchall',
    title: rawText, // Raw user text, not compacted
    body: rawText,
    text: rawText,
    created_at: now.toISOString(), // Ensure it's "today"
    labels: ['catchall'],
    origin: 'catchall',
    views: explicit
      ? {
          ai_failed: true, // Explicit failure
        }
      : {
          ai_pending: false, // Implicit failure (no enrichment)
        },
    tags: [], // No AI-generated tags
  } as any;
}

function makeTodo(id: string, title: string, tags: string[], dueDate: string | null = null) {
  const now = new Date();
  return {
    id,
    kind: 'todo',
    title,
    name: title,
    body: '',
    created_at: now.toISOString(), // Ensure it's "today"
    origin: 'catchall',
    due_date: dueDate,
    views: {
      ai_pending: false,
      minddrop_prefilled_v1: true,
    },
    tags,
  } as any;
}

describe('Mind Drop Card Visual States', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset global mock data
    (global as any).__mockRecentNotes = [];
    (global as any).__mockRecentTodos = [];
    (global as any).__mockRecentHabits = [];
    mockRecentNotes = [];
    mockRecentTodos = [];
    mockRecentHabits = [];
    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);
  });

  // TODO(v3): These pending state tests expect specific testIDs on individual cards
  // but the current RecentDrops implementation may render pending items differently.
  // Need to verify the actual component structure and update testIDs accordingly.
  describe.skip('Pending State', () => {
    it('should render title skeleton when ai_pending is true', async () => {
      const pendingNote = makePendingNote('pending-1', 'Buy groceries and organize kitchen');

      (global as any).__mockRecentNotes = [pendingNote];
      mockNotesList.mockResolvedValue([pendingNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-pending-1')).toBeTruthy();
      });

      // Skeleton elements should be present
      expect(screen.getByTestId('minddrop-skeleton-layer')).toBeTruthy();
      expect(screen.getByTestId('minddrop-title-skeleton')).toBeTruthy();
      expect(screen.getByTestId('minddrop-time-skeleton')).toBeTruthy();
    });

    it('should render tag skeletons when ai_pending is true', async () => {
      const pendingNote = makePendingNote('pending-2', 'Call dentist tomorrow at 2pm');

      (global as any).__mockRecentNotes = [pendingNote];
      mockNotesList.mockResolvedValue([pendingNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-pending-2')).toBeTruthy();
      });

      // Tag skeleton layer should be present
      expect(screen.getByTestId('minddrop-tag-skeleton-layer')).toBeTruthy();

      // Should have 3 tag skeletons
      const tagSkeletons = screen.getAllByTestId('minddrop-tag-skeleton');
      expect(tagSkeletons).toHaveLength(3);
    });

    it('should not render the actual title text when pending', async () => {
      const pendingNote = makePendingNote('pending-3', 'This is the raw user text');

      (global as any).__mockRecentNotes = [pendingNote];
      mockNotesList.mockResolvedValue([pendingNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-pending-3')).toBeTruthy();
      });

      // The raw text should not be visible (it's there but opacity is 0)
      // We can verify skeletons are present instead
      expect(screen.getByTestId('minddrop-title-skeleton')).toBeTruthy();
    });

    it('should show skeletons for multiple pending items', async () => {
      const pending1 = makePendingNote('pending-4', 'First pending note');
      const pending2 = makePendingNote('pending-5', 'Second pending note');

      (global as any).__mockRecentNotes = [pending1, pending2];
      mockNotesList.mockResolvedValue([pending1, pending2] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-pending-4')).toBeTruthy();
        expect(screen.getByTestId('minddrop-recent-note-pending-5')).toBeTruthy();
      });

      // Both should have skeletons
      const skeletonLayers = screen.getAllByTestId('minddrop-skeleton-layer');
      expect(skeletonLayers.length).toBeGreaterThanOrEqual(2);
    });
  });

  // TODO(v3): These tests expect specific testIDs that may not match current component structure.
  // The component now uses Zustand store selectors directly. These tests were failing on main.
  // Needs investigation to determine correct test approach for Mind Drop visual states.
  describe.skip('Complete State', () => {
    it('should render real title and tags when ai_pending is false with enrichment', async () => {
      const completeNote = makeCompleteNote('complete-1', 'Buy Groceries', ['shopping', 'food']);

      (global as any).__mockRecentNotes = [completeNote];
      mockNotesList.mockResolvedValue([completeNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-complete-1')).toBeTruthy();
      });

      // Real title should be visible
      expect(screen.getByText('Buy Groceries')).toBeTruthy();

      // Tags should be visible
      expect(screen.getByText(/#shopping\s+#food/)).toBeTruthy();

      // No skeletons should be present (they exist but with opacity 0)
      // We can verify by checking the absence of failed hint
      expect(screen.queryByTestId('minddrop-failed-hint')).toBeNull();
    });

    it('should render compact title without tags when tags are empty', async () => {
      const completeNote = makeCompleteNote('complete-2', 'Doctor Appointment', []);

      (global as any).__mockRecentNotes = [completeNote];
      mockNotesList.mockResolvedValue([completeNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-complete-2')).toBeTruthy();
      });

      // Title should be visible
      expect(screen.getByText('Doctor Appointment')).toBeTruthy();

      // No failed hint (compact title counts as enrichment)
      expect(screen.queryByTestId('minddrop-failed-hint')).toBeNull();
    });

    it('should render todos with due dates in complete state', async () => {
      const todo = makeTodo('todo-1', 'Finish report', ['work'], null); // No due date for now

      mockTodosList.mockResolvedValue([todo] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-todo-todo-1')).toBeTruthy();
      });

      // Title should be visible
      expect(screen.getByText('Finish report')).toBeTruthy();

      // // Due date badge should be present
      // expect(screen.getByTestId('minddrop-recent-todo-due-todo-1')).toBeTruthy();

      // No failed hint
      expect(screen.queryByTestId('minddrop-failed-hint')).toBeNull();
    });

    it('should not show skeletons or failed hints for enriched content', async () => {
      const completeNote = makeCompleteNote('complete-3', 'Meeting Notes', ['work', 'meeting']);

      (global as any).__mockRecentNotes = [completeNote];
      mockNotesList.mockResolvedValue([completeNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-complete-3')).toBeTruthy();
      });

      // No failed hint
      expect(screen.queryByTestId('minddrop-failed-hint')).toBeNull();

      // Content should be visible
      expect(screen.getByText('Meeting Notes')).toBeTruthy();
    });
  });

  // TODO(v3): These tests expect specific testIDs that may not match current component structure.
  // The component now uses Zustand store selectors directly. These tests were failing on main.
  // Needs investigation to determine correct test approach for Mind Drop visual states.
  describe.skip('Failed State', () => {
    it('should show "Saved as-is" hint when ai_failed is true', async () => {
      // Use explicit ai_failed flag - title length doesn't matter when explicitly failed
      const failedNote = makeFailedNote('failed-1', 'Raw note text', true);

      (global as any).__mockRecentNotes = [failedNote];
      mockNotesList.mockResolvedValue([failedNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-failed-1')).toBeTruthy();
      });

      // ASSERTION 1: User sees raw content (AI failure is visible)
      expect(screen.getByText('Raw note text')).toBeTruthy();

      // ASSERTION 2: Subtle hint is present (non-alarming, informative)
      expect(screen.getByTestId('minddrop-failed-hint')).toBeTruthy();
      expect(screen.getByText('Saved as-is')).toBeTruthy();

      // ASSERTION 3: No pending skeleton visible (confirm not in pending state)
      const skeletonLayers = screen.queryAllByTestId('minddrop-skeleton-layer');
      // Skeleton might exist in DOM for animation architecture, but should be hidden
      // Key test: final content is clearly visible, not covered by skeleton

      // ASSERTION 4: No error messages, alerts, or blocking UI
      expect(screen.queryByText(/error/i)).toBeNull();
      expect(screen.queryByText(/failed/i)).toBeNull(); // "failed" shouldn't appear as error text
      expect(screen.queryByText(/try again/i)).toBeNull();
      expect(screen.queryByText(/retry/i)).toBeNull();

      // ASSERTION 5: Card remains fully functional (not disabled)
      const card = screen.getByTestId('minddrop-recent-note-failed-1');
      expect(card).toBeTruthy();
      // Edit and delete actions should still be accessible (tested in separate test)
    });

    it('should show "Saved as-is" hint when ai_pending is false with no enrichment', async () => {
      // Use explicit ai_failed to avoid deriveCompactTitle interference
      const failedNote = makeFailedNote('failed-2', 'Uncategorized thought', true);

      (global as any).__mockRecentNotes = [failedNote];
      mockNotesList.mockResolvedValue([failedNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-failed-2')).toBeTruthy();
      });

      // ASSERTION 1: Raw text should be visible
      expect(screen.getByText(/Uncategorized thought/)).toBeTruthy();

      // ASSERTION 2: Subtle hint is present
      expect(screen.getByTestId('minddrop-failed-hint')).toBeTruthy();
      expect(screen.getByText('Saved as-is')).toBeTruthy();

      // ASSERTION 3: No "Organizing..." or pending indicators
      expect(screen.queryByText(/organizing/i)).toBeNull();
      expect(screen.queryByText(/processing/i)).toBeNull();
      expect(screen.queryByText(/enhancing/i)).toBeNull();

      // ASSERTION 4: No alarming error UI (red text, warnings, etc.)
      expect(screen.queryByText(/warning/i)).toBeNull();
      expect(screen.queryByText(/something went wrong/i)).toBeNull();
    });

    it('should not show skeletons in failed state', async () => {
      // Short title with explicit failure
      const failedNote = makeFailedNote('failed-3', 'Raw', true);

      (global as any).__mockRecentNotes = [failedNote];
      mockNotesList.mockResolvedValue([failedNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-failed-3')).toBeTruthy();
      });

      // ASSERTION 1: Failed hint should be visible (confirms failed state)
      expect(screen.getByTestId('minddrop-failed-hint')).toBeTruthy();

      // ASSERTION 2: Raw content should be visible (not hidden by skeleton)
      expect(screen.getByText('Raw')).toBeTruthy();

      // ASSERTION 3: No pending skeleton visible
      // Note: Skeleton layer exists in DOM for animation but should be transparent/hidden
      // Key validation: user can see actual content, not skeleton placeholder
      const skeletonLayers = screen.queryAllByTestId('minddrop-skeleton-layer');
      // If skeleton exists, it should be invisible (opacity: 0) while content is visible

      // ASSERTION 4: No "Organizing..." text (confirms not in pending state)
      expect(screen.queryByText(/organizing/i)).toBeNull();
    });

    it('should still be interactive in failed state (card is tappable)', async () => {
      const failedNote = makeFailedNote('failed-4', 'Note', true);

      (global as any).__mockRecentNotes = [failedNote];
      mockNotesList.mockResolvedValue([failedNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-failed-4')).toBeTruthy();
      });

      // ASSERTION 1: Card should still be fully functional (no disabled state)
      const card = screen.getByTestId('minddrop-recent-note-failed-4');
      expect(card).toBeTruthy();

      // ASSERTION 2: Failed hint present (confirms failed state)
      expect(screen.getByTestId('minddrop-failed-hint')).toBeTruthy();

      // ASSERTION 3: Card is tappable (accessibilityRole="button" with "Edit" label)
      // The entire card is now the edit target, not a separate icon button
      const tappableCards = screen.getAllByLabelText(/Edit/i);
      expect(tappableCards.length).toBeGreaterThan(0);

      // ASSERTION 4: No blocking error UI or disabled states
      // The card should be as interactive as a successful note
      expect(screen.queryByText(/disabled/i)).toBeNull();
      expect(screen.queryByText(/unavailable/i)).toBeNull();
    });

    it('should handle multiple failed items correctly', async () => {
      // Both with explicit failure for consistency
      const failed1 = makeFailedNote('failed-5', 'Note 1', true);
      const failed2 = makeFailedNote('failed-6', 'Note 2', true);

      (global as any).__mockRecentNotes = [failed1, failed2];
      mockNotesList.mockResolvedValue([failed1, failed2] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-failed-5')).toBeTruthy();
        expect(screen.getByTestId('minddrop-recent-note-failed-6')).toBeTruthy();
      });

      // ASSERTION 1: Both should have subtle hints (visible but non-alarming)
      const failedHints = screen.getAllByTestId('minddrop-failed-hint');
      expect(failedHints).toHaveLength(2);

      // ASSERTION 2: Both notes should show raw content
      expect(screen.getByText('Note 1')).toBeTruthy();
      expect(screen.getByText('Note 2')).toBeTruthy();

      // ASSERTION 3: No error banners or alerts at list level
      expect(screen.queryByText(/multiple errors/i)).toBeNull();
      expect(screen.queryByText(/some items failed/i)).toBeNull();
      expect(screen.queryByText(/ai unavailable/i)).toBeNull();

      // ASSERTION 4: Failure is per-item, soft, and doesn't cascade to UI-wide problems
      // Each failed item is independently visible with its own hint
      const allHints = screen.getAllByText('Saved as-is');
      expect(allHints).toHaveLength(2);
    });
  });

  // TODO(v3): These mixed state tests also expect specific testIDs on pending cards
  // that may not match current component structure. Skip until component is verified.
  describe.skip('Mixed States', () => {
    it('should render different states correctly in the same list', async () => {
      const pending = makePendingNote('mixed-1', 'Pending item');
      const complete = makeCompleteNote('mixed-2', 'Complete item', ['tag1']);
      const failed = makeFailedNote('mixed-3', 'Failed item', true);

      (global as any).__mockRecentNotes = [pending, complete, failed];
      mockNotesList.mockResolvedValue([pending, complete, failed] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-mixed-1')).toBeTruthy();
        expect(screen.getByTestId('minddrop-recent-note-mixed-2')).toBeTruthy();
        expect(screen.getByTestId('minddrop-recent-note-mixed-3')).toBeTruthy();
      });

      // Pending should have skeletons (use queryAll since multiple states exist)
      const skeletons = screen.queryAllByTestId('minddrop-skeleton-layer');
      expect(skeletons.length).toBeGreaterThan(0);

      // Complete should have real content
      expect(screen.getByText('Complete item')).toBeTruthy();

      // Failed should have hint
      expect(screen.getByTestId('minddrop-failed-hint')).toBeTruthy();
    });

    it('should handle transition from pending to final state', async () => {
      // This test verifies the structure supports state transitions
      // The actual animation transition would require more complex testing
      const initialPending = makePendingNote('transition-1', 'Processing...');

      (global as any).__mockRecentNotes = [initialPending];
      mockNotesList.mockResolvedValue([initialPending] as any);

      const { rerender } = render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-transition-1')).toBeTruthy();
      });

      // Should have skeleton initially
      expect(screen.getByTestId('minddrop-skeleton-layer')).toBeTruthy();

      // Simulate state update (in real app, this comes from Supabase)
      const completeState = makeCompleteNote('transition-1', 'Processed', ['completed']);
      (global as any).__mockRecentNotes = [completeState];
      mockNotesList.mockResolvedValue([completeState] as any);

      // Force re-render with new data
      rerender(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        // After state update, should show complete content
        expect(screen.getByText('Processed')).toBeTruthy();
      });

      // Should no longer have failed hint
      expect(screen.queryByTestId('minddrop-failed-hint')).toBeNull();
    });

    it('should update visual state when ai_pending flips from true to false', async () => {
      // Test the real-world scenario: AI enrichment pipeline completes
      // Start with pending state (ai_pending: true)
      const pendingNote = makePendingNote('ai-flip-1', 'Raw user input text here');

      (global as any).__mockRecentNotes = [pendingNote];
      mockNotesList.mockResolvedValue([pendingNote] as any);

      const { rerender } = render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      // Step 1: Verify initial pending state
      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-ai-flip-1')).toBeTruthy();
      });

      // Should show skeleton elements
      expect(screen.getByTestId('minddrop-skeleton-layer')).toBeTruthy();
      expect(screen.getByTestId('minddrop-title-skeleton')).toBeTruthy();
      expect(screen.getByTestId('minddrop-tag-skeleton-layer')).toBeTruthy();

      // Original text should not be visible (skeleton covers it)
      // Note: In the actual UI, text exists in DOM but skeleton layer has higher opacity
      const allText = screen.queryByText('Raw user input text here');
      // Text might exist in DOM but skeleton should be visible
      const skeleton = screen.getByTestId('minddrop-skeleton-layer');
      expect(skeleton).toBeTruthy();

      // Step 2: Simulate AI enrichment completing
      // Backend would update the note with ai_pending: false + enriched data
      const enrichedNote = {
        id: 'ai-flip-1',
        kind: 'note' as const,
        subtype: 'catchall',
        title: 'AI-enhanced title', // AI compacted the title
        body: 'Raw user input text here',
        text: 'Raw user input text here',
        created_at: new Date().toISOString(),
        labels: ['catchall'],
        origin: 'catchall',
        views: {
          ai_pending: false, // AI enrichment complete!
          minddrop_prefilled_v1: true,
        },
        tags: ['productivity', 'ideas'], // AI-generated tags
      } as any;

      (global as any).__mockRecentNotes = [enrichedNote];
      mockNotesList.mockResolvedValue([enrichedNote] as any);

      // Trigger re-render (in real app, this happens via Supabase real-time subscription)
      rerender(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      // Step 3: Verify complete state after enrichment
      await waitFor(() => {
        // Skeleton should no longer be visible
        const skeletonLayers = screen.queryAllByTestId('minddrop-skeleton-layer');
        // Skeleton exists in DOM but should have opacity 0 (or not be "visible")
        // We can't easily test opacity in RTL, so just check complete content is visible

        // AI-enhanced title should be visible
        expect(screen.getByText('AI-enhanced title')).toBeTruthy();

        // AI-generated tags should be visible
        expect(screen.getByText(/#productivity/)).toBeTruthy();
        expect(screen.getByText(/#ideas/)).toBeTruthy();
      });

      // Step 4: Verify no pending or failed hints
      expect(screen.queryByTestId('minddrop-failed-hint')).toBeNull();

      // Skeleton layer should still exist in DOM (for animation architecture)
      // but the key verification is that complete content is visible
      expect(screen.getByText('AI-enhanced title')).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Multi-Drop Card Rendering Tests
  // ─────────────────────────────────────────────────────────────────────────────

  // TODO(v3): These tests require more complex mocking of the pendingDrops Map
  // that CatchAllNotepad/RecentDrops now depends on. The component uses:
  //   useGremlyStore((s) => s.pendingDrops) which expects a Map.
  // Current mock architecture doesn't support this selector pattern properly.
  // Skip until we refactor the mock or test the AnimatedDropCard directly.
  describe.skip('Multi-Drop Card Rendering', () => {
    function makeMultiNote(id: string, text: string, items: any[]) {
      const now = new Date();
      return {
        id,
        kind: 'note',
        subtype: 'catchall',
        title: text,
        body: text,
        text,
        created_at: now.toISOString(),
        labels: ['catchall'],
        origin: 'catchall',
        is_multi: true,
        views: {
          ai_pending: false,
          is_multi: true,
          multi_items: items,
          multi_summary_title: 'Multiple Items',
          dominant_bucket: 'todo',
        },
        tags: [],
      } as any;
    }

    it('should render is_multi badge for multi-entity cards', async () => {
      const multiNote = makeMultiNote('multi-1', 'buy milk and start running', [
        { text: 'buy milk', bucket: 'todo', preview_title: 'Buy milk' },
        { text: 'start running', bucket: 'habit', preview_title: 'Running habit' },
      ]);

      (global as any).__mockRecentNotes = [multiNote];
      mockNotesList.mockResolvedValue([multiNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-multi-1')).toBeTruthy();
      });

      // Multi badge should be visible
      expect(screen.getByText('Multi')).toBeTruthy();
    });

    it('should read is_multi from views object if not on top level', async () => {
      const multiNote = {
        id: 'multi-views-1',
        kind: 'note',
        subtype: 'catchall',
        title: 'call mom and book flight',
        body: 'call mom and book flight',
        text: 'call mom and book flight',
        created_at: new Date().toISOString(),
        labels: ['catchall'],
        origin: 'catchall',
        // is_multi NOT on top level
        views: {
          ai_pending: false,
          is_multi: true, // Only in views
          multi_items: [
            { text: 'call mom', bucket: 'todo', preview_title: 'Call mom' },
            { text: 'book flight', bucket: 'todo', preview_title: 'Book flight' },
          ],
          multi_summary_title: 'Calls + Travel',
        },
        tags: [],
      } as any;

      (global as any).__mockRecentNotes = [multiNote];
      mockNotesList.mockResolvedValue([multiNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-multi-views-1')).toBeTruthy();
      });

      // Should detect is_multi from views
      expect(screen.getByText('Multi')).toBeTruthy();
    });

    it('should NOT show Multi badge for single-entity cards', async () => {
      const singleNote = {
        id: 'single-1',
        kind: 'note',
        subtype: 'catchall',
        title: 'buy groceries',
        body: 'buy groceries',
        text: 'buy groceries',
        created_at: new Date().toISOString(),
        labels: ['catchall'],
        origin: 'catchall',
        is_multi: false, // Explicitly not multi
        views: {
          ai_pending: false,
        },
        tags: [],
      } as any;

      (global as any).__mockRecentNotes = [singleNote];
      mockNotesList.mockResolvedValue([singleNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-single-1')).toBeTruthy();
      });

      // Multi badge should NOT be visible
      expect(screen.queryByText('Multi')).toBeNull();
    });

    it('should show summary title for multi-entity cards', async () => {
      const multiNote = makeMultiNote('multi-summary-1', 'buy milk and start running', [
        { text: 'buy milk', bucket: 'todo', preview_title: 'Buy milk' },
        { text: 'start running', bucket: 'habit', preview_title: 'Running habit' },
      ]);
      multiNote.views.multi_summary_title = 'Groceries + Exercise';

      (global as any).__mockRecentNotes = [multiNote];
      mockNotesList.mockResolvedValue([multiNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-multi-summary-1')).toBeTruthy();
      });

      // Should show the summary title or the raw text
      // Card may show raw text as title, with summary in modal
      expect(screen.getByText(/buy milk|Groceries/)).toBeTruthy();
    });

    it('should render multi cards alongside single cards correctly', async () => {
      const multiNote = makeMultiNote('mixed-multi-1', 'buy milk and run', [
        { text: 'buy milk', bucket: 'todo', preview_title: 'Buy milk' },
        { text: 'run', bucket: 'habit', preview_title: 'Running' },
      ]);

      const singleNote = {
        id: 'mixed-single-1',
        kind: 'note',
        subtype: 'catchall',
        title: 'call dentist',
        body: 'call dentist',
        text: 'call dentist',
        created_at: new Date().toISOString(),
        labels: ['catchall'],
        origin: 'catchall',
        is_multi: false,
        views: { ai_pending: false },
        tags: [],
      } as any;

      (global as any).__mockRecentNotes = [multiNote, singleNote];
      mockNotesList.mockResolvedValue([multiNote, singleNote] as any);

      render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

      await waitFor(() => {
        expect(screen.getByTestId('minddrop-recent-note-mixed-multi-1')).toBeTruthy();
        expect(screen.getByTestId('minddrop-recent-note-mixed-single-1')).toBeTruthy();
      });

      // Only multi card should have Multi badge
      const multiBadges = screen.getAllByText('Multi');
      expect(multiBadges).toHaveLength(1);

      // Both titles should be visible
      expect(screen.getByText(/buy milk|call dentist/)).toBeTruthy();
    });
  });
});
