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
import { useThisWeek } from '../../../lib/week/thisWeek';

// The route the screen was opened with
let mockRouteParams: Record<string, unknown> = { cards: 'wrap' };

// Saving a decision, and the wrap up's session
const mockApply = jest.fn();
// the date picker's Add time switch: the native switch has no stand in under jest
jest.mock('react-native/Libraries/Components/Switch/Switch', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => React.createElement('Switch', props),
  };
});

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

// Mock store selectors: useSweepCandidatesUnified returns candidates with meta from store
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

// Store todos/notes that will be used for edit overlay lookups
let mockStoreTodos: any[] = [];
// Notes as the store has them now (an answer earlier in the Sweep may have cleared one)
let mockLiveNotes: any[] = [];

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

// Mock OverlayContext: CardDeckScreen uses useGlobalOverlay
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

import CardDeckScreen from '../CardDeckScreen';

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
  createdAt: getDateService().nowTimestamp(),
  dropId: null,
  skippedInSweepAt: null,
  isOverdue: false,
  isDueToday: false,
  isCreatedToday: true,
  raw: {
    id: 'todo-1',
    name: 'Test task',
    owner_id: 'test-user-id',
    created_at: getDateService().nowTimestamp(),
    updated_at: getDateService().nowTimestamp(),
  } as any,
};

const mockNoteCandidate: SweepCandidate = {
  id: 'note-1',
  kind: 'note',
  createdAt: getDateService().nowTimestamp(),
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
    created_at: getDateService().nowTimestamp(),
    updated_at: getDateService().nowTimestamp(),
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

describe('CardDeckScreen: the cards on their own', () => {
  // 8:40 PM on Wednesday 30 September in Los Angeles: the evening
  const ds = getDateService() as any;
  let was: { clock: () => Date; timezone: string; hour: number };
  const at = (iso: string) => {
    ds.clock = () => new Date(iso);
  };
  afterEach(() => {
    ds.clock = was.clock;
    ds.setTimezone(was.timezone);
    ds.setDayBoundaryHour(was.hour);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    was = { clock: ds.clock, timezone: ds.getTimezone(), hour: ds.getDayBoundaryHour() };
    ds.setTimezone('America/Los_Angeles');
    ds.setDayBoundaryHour(3);
    at('2026-10-01T03:40:00Z');
    mockRouteParams = { cards: 'wrap' };
    mockCandidates = [mockTodoCandidate, mockNoteCandidate];
    mockNoteCardType = null;
    mockStoreTodos = [];
    mockLiveNotes = [];
    mockWrap = null;
    mockApply.mockImplementation(async (d: { candidateId: string; candidateKind: 'todo' }) =>
      saved(d.candidateId, d.candidateKind),
    );
  });

  it('opens straight on the first card, with no intro', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => expect(result.getByText('Test task')).toBeTruthy());
    // before midnight the next day is Tomorrow on the card, with how full it already is
    expect(result.getByText('Tomorrow · 0h')).toBeTruthy();
    expect(result.queryByText(/Welcome to Sweep|A quick sweep/)).toBeNull();
    expect(result.getByText('1 of 2')).toBeTruthy();
    expect(mockCardsOpened).toHaveBeenCalledTimes(1);
  });

  it('in the evening the next day is chosen already, and Today is not offered', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    expect(result.queryByText(/^Today/)).toBeNull();
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({ action: 'keep', dueDateStr: '2026-10-01' });
  });

  it('before the evening today still has room, and is chosen already', async () => {
    at('2026-09-30T21:00:00Z');
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    expect(result.getByText('Today · 0h')).toBeTruthy();
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({ action: 'keep', dueDateStr: '2026-09-30' });
  });

  it('shows on each day how full it already is, without counting the card’s own todo', async () => {
    at('2026-09-30T21:00:00Z');
    mockStoreTodos = [
      // today: an hour and a half of other things, and the card's own todo, which is not counted
      { id: 'a', name: 'Write the report', due_day: '2026-09-30', time_estimate_minutes: 90 },
      { id: 'todo-1', name: 'Test task', due_day: '2026-09-30', time_estimate_minutes: 45 },
      // tomorrow: six hours, one of them with no length (half an hour, as on the board)
      { id: 'b', name: 'Workshop', due_day: '2026-10-01', time_estimate_minutes: 330 },
      { id: 'c', name: 'Call the bank', due_day: '2026-10-01' },
      // done or put away: not on the day any more
      { id: 'd', name: 'Old', due_day: '2026-10-01', completed_at: '2026-09-29T10:00:00Z' },
    ];
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    expect(result.getByText('Today · 1h 30m')).toBeTruthy();
    expect(result.getByText('Tomorrow · 6h')).toBeTruthy();
  });

  it('Pick a date shows how full the day in hand is, and the picked day keeps that on its pill', async () => {
    at('2026-09-30T21:00:00Z');
    mockStoreTodos = [
      { id: 'a', name: 'Write the report', due_day: '2026-09-30', time_estimate_minutes: 90 },
      { id: 'b', name: 'Workshop', due_day: '2026-10-01', time_estimate_minutes: 360 },
    ];
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    fireEvent.press(result.getByText('Pick a date'));
    // the picker opens on today: its load is under the calendar, and on the quick chips too
    expect(result.getByTestId('date-picker-load').props.children).toBe('Wed 30 Sep · 1h 30m');
    expect(result.getAllByText('Today · 1h 30m')).toHaveLength(2);
    expect(result.getAllByText('Tomorrow · 6h')).toHaveLength(2);

    // the chip in the picker moves the day in hand, and the line follows it
    fireEvent.press(result.getAllByText('Tomorrow · 6h')[1]);
    expect(result.getByTestId('date-picker-load').props.children).toBe('Thu 1 Oct · 6h');

    fireEvent.press(result.getByText('Set'));
    expect(result.getByText('Thu 1 Oct · 6h')).toBeTruthy();
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({ action: 'keep', dueDateStr: '2026-10-01' });
  });

  it("the morning's quick sweep sorts for today, whatever the hour", async () => {
    mockRouteParams = { cards: 'quick' };
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    expect(result.getByText('Today · 0h')).toBeTruthy();
  });

  it('saves a decision the moment it is made, and hands it to the wrap up with its Undo', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
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
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
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
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(result.getByText('All sorted')).toBeTruthy());
    expect(result.getByText('Back to Gremly')).toBeTruthy();
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it('leaves out the cards already settled tonight', async () => {
    mockWrap = { decisions: [{ id: 'todo-1', cid: 'c1', out: 'kept' }] };
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => expect(result.getByText('Test note')).toBeTruthy());
    expect(result.queryByText('Test task')).toBeNull();
    expect(result.getByText('1 of 1')).toBeTruthy();
  });

  it('brings back a card whose decision was put back', async () => {
    mockWrap = {
      decisions: [{ id: 'todo-1', cid: 'c1', out: 'kept', undone_at: '2026-09-30T21:00:00Z' }],
    };
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => expect(result.getByText('Test task')).toBeTruthy());
    expect(result.getByText('1 of 2')).toBeTruthy();
  });

  it('has no way back to an earlier card: Undo is on the receipt', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => result.getByText('Test note'));
    expect(result.queryByRole('button', { name: 'Go back to previous card' })).toBeNull();
    expect(result.queryByText('Need a break? Save and exit')).toBeNull();
  });

  it('says so and brings the card back when a decision could not be saved', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockApply.mockResolvedValueOnce({ ok: false, reason: 'failed', message: 'offline' });
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
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
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
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
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
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
        created_at: getDateService().nowTimestamp(),
        updated_at: getDateService().nowTimestamp(),
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

  it('saves each decision in the morning quick sweep too, without the wrap up record', async () => {
    mockRouteParams = { cards: 'quick' };
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    await waitFor(() => result.getByText('Test note'));
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockCardsOpened).not.toHaveBeenCalled();
  });
});

describe('CardDeckScreen: the cards after midnight, before the day ends', () => {
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
    useThisWeek.setState({ weeklyDay: 0, loaded: false });

    mockRouteParams = { cards: 'wrap' };
    mockCandidates = [mockTodoCandidate];
    mockNoteCardType = null;
    mockStoreTodos = [];
    mockLiveNotes = [];
    mockWrap = null;
    mockApply.mockImplementation(async (d: { candidateId: string; candidateKind: 'todo' }) =>
      saved(d.candidateId, d.candidateKind),
    );
  });

  afterEach(() => {
    ds.clock = was.clock;
    ds.setTimezone(was.timezone);
    ds.setDayBoundaryHour(was.hour);
  });

  it('the clock says Thursday, and today is still Wednesday', () => {
    expect(getDateService().calendarDay()).toBe('2026-10-01');
    expect(getDateService().today()).toBe('2026-09-30');
  });

  it('names the next day on a card by its weekday, and means the day after the one being wrapped up', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    // the clock already says Thursday, so the button never says Tomorrow
    expect(result.queryByText(/^Tomorrow/)).toBeNull();
    fireEvent.press(result.getByText('Thursday · 0h'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    // Thursday: the person's tomorrow, which the clock already calls today
    expect(mockApply.mock.calls[0][0]).toMatchObject({
      candidateId: 'todo-1',
      action: 'keep',
      dueDateStr: '2026-10-01',
    });
  });

  it('the next day is chosen already, and Today is not offered', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    expect(result.queryByText(/^Today/)).toBeNull();
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({
      candidateId: 'todo-1',
      action: 'keep',
      dueDateStr: '2026-10-01',
    });
  });

  it('Later puts the todo off until after their week, on the day the pill names', async () => {
    // Sunday is their weekly day: the week being wrapped up ends on Sunday 4 October
    useThisWeek.setState({ weeklyDay: 0, loaded: true });
    // two things already come back on Monday 5 and one on Tuesday 6, so Wednesday 7 has the fewest
    mockStoreTodos = [
      { id: 'l1', name: 'One', resurface_at: '2026-10-05' },
      { id: 'l2', name: 'Two', resurface_at: '2026-10-05' },
      { id: 'l3', name: 'Three', resurface_at: '2026-10-06' },
    ];
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));

    expect(result.getByText('Add a reminder')).toBeTruthy();
    fireEvent.press(result.getByText('Later · Wed 7'));
    // put off, it has no day for a reminder to go by: the reminder row goes with the choice
    expect(result.queryByText('Add a reminder')).toBeNull();
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));

    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    // the week's Later: a back day and no day of its own
    expect(mockApply.mock.calls[0][0]).toEqual({
      candidateId: 'todo-1',
      candidateKind: 'todo',
      action: 'keep',
      resurfaceDateStr: '2026-10-07',
    });
  });

  it('does not offer Later until their week has been read', async () => {
    useThisWeek.setState({ weeklyDay: 0, loaded: false });
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    expect(result.queryByText(/^Later/)).toBeNull();
    expect(result.getByText('Pick a date')).toBeTruthy();
  });
});

describe('CardDeckScreen: a todo that has come back twice', () => {
  const ds = getDateService() as any;
  let was: { clock: () => Date; timezone: string; hour: number };
  // put off twice, with no day of its own, and back today
  const twice: SweepCandidate = {
    ...mockTodoCandidate,
    raw: {
      ...(mockTodoCandidate.raw as any),
      due_day: null,
      resurface_at: '2026-09-30',
      resurface_count: 2,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    was = { clock: ds.clock, timezone: ds.getTimezone(), hour: ds.getDayBoundaryHour() };
    // 2 PM on Wednesday 30 September in Los Angeles
    ds.clock = () => new Date('2026-09-30T21:00:00Z');
    ds.setTimezone('America/Los_Angeles');
    ds.setDayBoundaryHour(3);
    useThisWeek.setState({ weeklyDay: 0, loaded: true });
    mockRouteParams = { cards: 'wrap' };
    mockCandidates = [twice];
    mockNoteCardType = null;
    mockStoreTodos = [];
    mockLiveNotes = [];
    mockWrap = null;
    mockApply.mockImplementation(async (d: { candidateId: string; candidateKind: 'todo' }) =>
      saved(d.candidateId, d.candidateKind),
    );
  });

  afterEach(() => {
    ds.clock = was.clock;
    ds.setTimezone(was.timezone);
    ds.setDayBoundaryHour(was.hour);
    useThisWeek.setState({ weeklyDay: 0, loaded: false });
  });

  it('asks keep or let go before offering any day', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    expect(result.getByTestId('todo-keep-or-let-go')).toBeTruthy();
    expect(result.getByText("You've put this off twice now. Keep it, or let it go?")).toBeTruthy();
    expect(result.queryByText(/^Today/)).toBeNull();
    expect(result.queryByText(/^Tomorrow/)).toBeNull();
    expect(result.queryByText(/^Later/)).toBeNull();
    expect(result.queryByText('Pick a date')).toBeNull();
  });

  it('Keep opens Today, Tomorrow and Pick a date, without Later, and saves nothing yet', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    expect(mockApply).not.toHaveBeenCalled();
    expect(result.queryByTestId('todo-keep-or-let-go')).toBeNull();
    expect(result.getByText('Today · 0h')).toBeTruthy();
    expect(result.getByText('Tomorrow · 0h')).toBeTruthy();
    expect(result.getByText('Pick a date')).toBeTruthy();
    expect(result.queryByText(/^Later/)).toBeNull();
    // Keep now decides, for the day chosen
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({ action: 'keep', dueDateStr: '2026-09-30' });
  });

  it('in the evening Keep opens the next day and Pick a date: today is past, and Later stays away', async () => {
    // 8:40 PM on Wednesday 30 September in Los Angeles
    ds.clock = () => new Date('2026-10-01T03:40:00Z');
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    expect(result.getByTestId('todo-keep-or-let-go')).toBeTruthy();
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    expect(mockApply).not.toHaveBeenCalled();
    expect(result.queryByText(/^Today/)).toBeNull();
    expect(result.getByText('Tomorrow · 0h')).toBeTruthy();
    expect(result.getByText('Pick a date')).toBeTruthy();
    expect(result.queryByText(/^Later/)).toBeNull();
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({ action: 'keep', dueDateStr: '2026-10-01' });
  });

  it('asks again on the next card that has come back twice: one Keep does not answer for both', async () => {
    const second: SweepCandidate = {
      ...twice,
      id: 'todo-2',
      raw: { ...(twice.raw as any), id: 'todo-2', name: 'Second task' },
    };
    mockCandidates = [twice, second];
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    // the first: Keep opens its days, then Keep decides
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    // the second is asked its own question, with no day offered yet
    await waitFor(() => result.getByText('Second task'));
    expect(result.getByTestId('todo-keep-or-let-go')).toBeTruthy();
    expect(result.queryByText(/^Today/)).toBeNull();
    fireEvent.press(result.getByRole('button', { name: 'Keep this item' }));
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(result.getByText('Today · 0h')).toBeTruthy();
  });

  it('Let go puts it away straight from the question', async () => {
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    fireEvent.press(result.getByRole('button', { name: 'Let go of this item' }));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    expect(mockApply.mock.calls[0][0]).toMatchObject({ candidateId: 'todo-1', action: 'clear' });
  });

  it('a todo put off twice and since given a day is offered its days as usual, without Later', async () => {
    mockCandidates = [
      {
        ...twice,
        raw: { ...(twice.raw as any), due_day: '2026-09-30', resurface_at: null },
      },
    ];
    const result = render(<CardDeckScreen navigation={mockNavigation} />);
    await waitFor(() => result.getByText('Test task'));
    expect(result.queryByTestId('todo-keep-or-let-go')).toBeNull();
    expect(result.getByText('Today · 0h')).toBeTruthy();
    expect(result.queryByText(/^Later/)).toBeNull();
  });
});
