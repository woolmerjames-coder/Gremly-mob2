/**
 * The cards on their own, opened from today's thread (route param cards):
 * tonight's wrap up or the brief's quick sweep. No intro and no steps after:
 * each decision is saved as it is made (lib/changes/sweep.ts), handed to the
 * wrap up's session with its Undo, and closing part way loses nothing.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SweepCandidate } from '../../../lib/sweep/types';
import { emitOverlaySaved } from '../../../lib/events/overlaySaved';
import { getDateService } from '../../../lib/date/DateService';

// Mock sweep engine
const mockFetchSweepCandidates = jest.fn<Promise<SweepCandidate[]>, [string, any]>();
const mockApplySweepAction = jest.fn<Promise<void>, [any, any]>().mockResolvedValue(undefined);
jest.mock('../../../lib/sweep/engine', () => ({
  __esModule: true,
  fetchSweepCandidatesForUser: (...args: [string, any]) => mockFetchSweepCandidates(...args),
  applySweepAction: (...args: [any, any]) => mockApplySweepAction(...args),
  markSweepCompleted: () => Promise.resolve(),
}));

// The route the screen was opened with
let mockRouteParams: Record<string, unknown> = { cards: 'wrap' };

// Saving a decision, and the wrap up's session
const mockApply = jest.fn();
jest.mock('../../../lib/changes/sweep', () => ({
  __esModule: true,
  applySweepDecision: (...args: unknown[]) => mockApply(...args),
}));
const mockRecord = jest.fn();
const mockCardsOpened = jest.fn();
const mockCardsClosed = jest.fn();
let mockWrap: { decisions: { id: string; cid: string; out: string; undone_at?: string }[] } | null =
  null;
jest.mock('../../../lib/wrapup/session', () => ({
  __esModule: true,
  recordDecision: (...args: unknown[]) => mockRecord(...args),
  cardsOpened: () => mockCardsOpened(),
  cardsClosed: () => mockCardsClosed(),
  currentWrap: () => mockWrap,
}));

// Mock store selectors - useSweepCandidatesUnified returns candidates with meta from store
let mockCandidates: SweepCandidate[] = [];
// Which kind of note card a note is drawn as (general notes can be made a todo)
let mockNoteCardType: 'general' | null = null;
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
  selectWrapUp: () => ({
    cards: mockCandidates.map((candidate) => ({
      candidate,
      meta: {
        gremlyResponse: 'Test',
        noteCardType: candidate.kind === 'note' ? mockNoteCardType : null,
      },
    })),
    still: [],
  }),
  useActiveSpaces: () => [],
  useSkipBudget: () => ({ used: 0, remaining: 3, total: 3, canSkip: true }),
}));

jest.mock('../../../lib/store/useGremlyStore', () => {
  // Create the mock hook function
  const mockUseGremlyStore = (selector: (state: any) => any) => {
    const state = {
      todos: mockStoreTodos,
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
      params: mockRouteParams,
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

import { Alert } from 'react-native';

const revert = jest.fn().mockResolvedValue(undefined);
function saved(id: string, kind: 'todo' | 'note') {
  return {
    ok: true,
    record: {
      cid: `c-${id}`,
      op: 'keep',
      type: kind,
      id,
      title: id,
      out: 'kept',
      label: 'Kept',
      at: '2026-09-30T20:40:00.000Z',
    },
    revert,
  };
}

describe('SweepFlowScreen - the cards on their own', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { cards: 'wrap' };
    mockCandidates = [mockTodoCandidate, mockNoteCandidate];
    mockNoteCardType = null;
    mockStoreTodos = [];
    mockStoreNotes = [];
    mockLiveNotes = [];
    mockWrap = null;
    mockFetchSweepCandidates.mockResolvedValue([]);
    mockApply.mockImplementation(async (d: { candidateId: string; candidateKind: 'todo' }) =>
      saved(d.candidateId, d.candidateKind),
    );
  });

  it('opens straight on the first card, with no intro', async () => {
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => expect(result.getByText('Test task')).toBeTruthy());
    // before midnight the next day is Tomorrow on the card
    expect(result.getByText('Tomorrow')).toBeTruthy();
    expect(result.queryByText(/Welcome to Sweep|A quick sweep/)).toBeNull();
    expect(result.getByText('1 of 2')).toBeTruthy();
    expect(mockCardsOpened).toHaveBeenCalledTimes(1);
  });

  it('saves a decision the moment it is made, and hands it to the wrap up with its Undo', async () => {
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({
      candidateId: 'todo-1',
      candidateKind: 'todo',
      action: 'keep',
    });
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockRecord.mock.calls[0][0]).toMatchObject({ id: 'todo-1', out: 'kept' });
    expect(mockRecord.mock.calls[0][1]).toBe(revert);
    // the next card, and what is saved so far
    await waitFor(() => expect(result.getByText('Test note')).toBeTruthy());
    expect(result.getByText('1 saved so far')).toBeTruthy();
  });

  it('keeps what was decided when the cards are closed part way', async () => {
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    fireEvent.press(result.getByRole('button', { name: 'Let go of this item' }));
    await waitFor(() => result.getByText('Test note'));

    fireEvent.press(result.getAllByRole('button', { name: 'Close Sweep' })[0]);

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    // saved once, when it was decided, and not again on the way out
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply.mock.calls[0][0]).toMatchObject({ candidateId: 'todo-1', action: 'clear' });
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('says All sorted after the last card, then goes back once', async () => {
    mockCandidates = [mockTodoCandidate];
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(result.getByText('All sorted')).toBeTruthy());
    expect(result.getByText('Back to Gremly')).toBeTruthy();
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it('leaves out the cards already settled tonight', async () => {
    mockWrap = { decisions: [{ id: 'todo-1', cid: 'c1', out: 'kept' }] };
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => expect(result.getByText('Test note')).toBeTruthy());
    expect(result.queryByText('Test task')).toBeNull();
    expect(result.getByText('1 of 1')).toBeTruthy();
  });

  it('brings back a card whose decision was put back', async () => {
    mockWrap = {
      decisions: [{ id: 'todo-1', cid: 'c1', out: 'kept', undone_at: '2026-09-30T21:00:00Z' }],
    };
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => expect(result.getByText('Test task')).toBeTruthy());
    expect(result.getByText('1 of 2')).toBeTruthy();
  });

  it('has no way back to an earlier card: Undo is on the receipt', async () => {
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => result.getByText('Test note'));
    expect(result.queryByRole('button', { name: 'Go back to previous card' })).toBeNull();
    expect(result.queryByText('Need a break? Save and exit')).toBeNull();
  });

  it('says so and brings the card back when a decision could not be saved', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApply.mockResolvedValueOnce({ ok: false, reason: 'failed', message: 'offline' });
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(mockRecord).not.toHaveBeenCalled();
    await waitFor(() => expect(result.getByText('Test task')).toBeTruthy());
    expect(result.queryByText('1 saved so far')).toBeNull();
    alert.mockRestore();
  });

  it('passes over an item that has gone since the card was shown, with nothing saved', async () => {
    mockApply.mockResolvedValueOnce({ ok: false, reason: 'gone', message: 'gone' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => result.getByText('Test note'));
    expect(alert).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('saves the decision on the new todo when a note was turned into one on its card', async () => {
    mockCandidates = [mockNoteCandidate];
    mockNoteCardType = 'general';
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test note'));

    // Make it a todo opens the item sheet to make the todo
    fireEvent.press(result.getByText('Make it a todo'));
    expect(mockOpenCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'todo' }));

    // the sheet saved the new todo: the card becomes that todo, in place
    mockStoreTodos = [
      {
        id: 'todo-new',
        name: 'Test note',
        owner_id: 'test-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    act(() => {
      emitOverlaySaved({ id: 'todo-new', type: 'todo' } as any);
    });

    await waitFor(() => result.getByRole('button', { name: 'Keep this item' }));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    // the old Sweep wrote this to the note that had just been put away
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({
      candidateId: 'todo-new',
      candidateKind: 'todo',
    });
    expect(mockApply.mock.calls.some((c) => c[0].candidateId === 'note-1')).toBe(false);
  });

  it('opened with neither cards nor the week, hands over to the wrap up in the thread', async () => {
    mockRouteParams = {};
    const replace = jest.fn();
    const result = render(<SweepFlowScreen navigation={{ ...mockNavigation, replace }} />);

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace.mock.calls[0][0]).toBe('Tabs');
    expect(replace.mock.calls[0][1]).toMatchObject({
      screen: 'Gremly',
      params: { mode: 'chat', thread: 'today', step: 'wrap' },
    });
    // nothing of the old evening Sweep, and no cards, is drawn on the way
    expect(result.queryByText('Test task')).toBeNull();
    expect(result.queryByText('Lead me through it all')).toBeNull();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('saves each decision in the morning quick sweep too, without the wrap up record', async () => {
    mockRouteParams = { cards: 'quick' };
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    await waitFor(() => result.getByText('Test note'));
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockCardsOpened).not.toHaveBeenCalled();
  });
});

describe('SweepFlowScreen - the cards after midnight, before the day ends', () => {
  // 12:30 AM on Thursday 1 October in Los Angeles. The day ends at 3 AM, so
  // for the person it is still Wednesday 30 September.
  const ds = getDateService() as any;
  let was: { clock: () => Date; timezone: string; hour: number };

  beforeEach(() => {
    jest.clearAllMocks();
    was = { clock: ds.clock, timezone: ds.getTimezone(), hour: ds.getDayBoundaryHour() };
    ds.clock = () => new Date('2026-10-01T07:30:00Z');
    ds.setTimezone('America/Los_Angeles');
    ds.setDayBoundaryHour(3);

    mockRouteParams = { cards: 'wrap' };
    mockCandidates = [mockTodoCandidate];
    mockNoteCardType = null;
    mockStoreTodos = [];
    mockStoreNotes = [];
    mockLiveNotes = [];
    mockWrap = null;
    mockFetchSweepCandidates.mockResolvedValue([]);
    mockApply.mockImplementation(async (d: { candidateId: string; candidateKind: 'todo' }) =>
      saved(d.candidateId, d.candidateKind),
    );
  });

  afterEach(() => {
    ds.clock = was.clock;
    ds.setTimezone(was.timezone);
    ds.setDayBoundaryHour(was.hour);
  });

  it('the clock and the person disagree about today', () => {
    expect(getDateService().today()).toBe('2026-10-01');
    expect(getDateService().ritualDay()).toBe('2026-09-30');
  });

  it('names the next day on a card by its weekday, and means the day after the one being wrapped up', async () => {
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    // the clock already says Thursday, so the button never says Tomorrow
    expect(result.queryByText('Tomorrow')).toBeNull();
    fireEvent.press(result.getByText('Thursday'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    // Thursday: the person's tomorrow, which the clock already calls today
    expect(mockApply.mock.calls[0][0]).toMatchObject({
      candidateId: 'todo-1',
      action: 'keep',
      dueDateStr: '2026-10-01',
    });
  });

  it('Today on a card is the day being wrapped up', async () => {
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    fireEvent.press(result.getByText('Today'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({
      candidateId: 'todo-1',
      action: 'keep',
      dueDateStr: '2026-09-30',
    });
  });

  it('Next Week on a card is the Monday after the day being wrapped up', async () => {
    const result = render(<SweepFlowScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    fireEvent.press(result.getByText('Next Week'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({ dueDateStr: '2026-10-05' });
  });
});
