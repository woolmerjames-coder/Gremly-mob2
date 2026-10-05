/**
 * The add and edit overlay's controller (contexts/OverlayContext) and the
 * journal: an entry opened or started through it goes to the journal page,
 * and everything else opens in the overlay as before.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

// the test setup stands a no-op controller in for every other test: this one tests the real one
jest.unmock('../OverlayContext');

let mockNotes: Record<string, unknown>[] = [];
const mockTodos: Record<string, unknown>[] = [];
jest.mock('../../lib/store/useGremlyStore', () => {
  const state = () => ({
    notes: mockNotes,
    todos: mockTodos,
    habits: [],
    queueItems: [],
    resolveEntityClarification: jest.fn(),
    resolveSkippedClarification: jest.fn(),
    ensureEntityClarification: jest.fn(),
  });
  const useGremlyStore = (pick: (s: ReturnType<typeof state>) => unknown) => pick(state());
  useGremlyStore.getState = state;
  return { useGremlyStore };
});
jest.mock('../../components/minddrop/ClarificationPopup', () => ({
  ClarificationPopup: () => null,
}));
jest.mock('../../components/minddrop/RelationPopup', () => ({ RelationPopup: () => null }));
jest.mock('../../components/minddrop/RelationToast', () => ({ RelationToastHost: () => null }));

import { OverlayProvider, useGlobalOverlay } from '../OverlayContext';
import { getDateService } from '../../lib/date/DateService';
import { closeJournal, useJournalSession } from '../../lib/journal/session';
import type { AppRecord } from '../../lib/types';

const page = () => useJournalSession.getState().open;
const journal = {
  id: 'j1',
  type: 'note',
  subtype: 'journal',
  created_at: '2026-09-24T19:00:00Z',
  views: { sweep_reflection: true, sweep_date: '2026-09-24' },
};
const idea = { id: 'i1', type: 'note', subtype: 'idea', created_at: '2026-09-24T19:00:00Z' };
const record = (r: Record<string, unknown>) => r as unknown as AppRecord;

function overlay() {
  return renderHook(() => useGlobalOverlay(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <OverlayProvider>{children}</OverlayProvider>
    ),
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockNotes = [journal, idea];
  useJournalSession.setState({ open: null });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a new journal entry', () => {
  it('is written on the journal page, not in the overlay', () => {
    const { result } = overlay();
    act(() => result.current.openCreate({ type: 'log', logSubtype: 'journal' }));
    expect(page()).toMatchObject({ day: getDateService().ritualDay() });
    expect(page()?.entryId).toBeUndefined();
    expect(result.current.state.visible).toBe(false);
  });

  it('starts with the words already typed', () => {
    const { result } = overlay();
    act(() =>
      result.current.openCreate({
        type: 'log',
        logSubtype: 'journal',
        initialText: 'Tired but pleased.',
      }),
    );
    expect(page()?.carry).toBe('Tired but pleased.');
  });

  it('leaves every other kind of new item to the overlay', () => {
    const { result } = overlay();
    act(() => result.current.openCreate({ type: 'log', logSubtype: 'idea' }));
    expect(result.current.state).toMatchObject({ visible: true, mode: 'create' });
    expect(page()).toBeNull();
  });
});

describe('opening an item', () => {
  it('shows a journal entry on the journal page, to read', () => {
    const { result } = overlay();
    act(() => result.current.openEdit({ record: record(journal) }));
    expect(page()).toMatchObject({ day: '2026-09-24', entryId: 'j1', reading: true });
    expect(result.current.state.visible).toBe(false);
  });

  it('does the same for one opened to view, as chat opens it', () => {
    const { result } = overlay();
    act(() => result.current.openView({ record: record(journal), fromChat: true }));
    expect(page()).toMatchObject({ entryId: 'j1', reading: true });
    expect(result.current.state.visible).toBe(false);
  });

  it('knows a journal entry from its id alone, as a card in chat gives it', () => {
    const { result } = overlay();
    act(() => result.current.openEdit({ record: record({ id: 'j1', type: 'note' }) }));
    expect(page()).toMatchObject({ entryId: 'j1' });
  });

  it('opens any other note in the overlay', () => {
    const { result } = overlay();
    act(() => result.current.openEdit({ record: record(idea) }));
    expect(result.current.state).toMatchObject({
      visible: true,
      mode: 'edit',
      initialEntity: { type: 'log', id: 'i1', logSubtype: 'idea' },
    });
    expect(page()).toBeNull();
  });

  it('opens a todo in the overlay even when a journal entry shares nothing with it', () => {
    const { result } = overlay();
    act(() => result.current.openEdit({ record: record({ id: 'j1', type: 'todo' }) }));
    expect(result.current.state).toMatchObject({ visible: true, initialEntity: { type: 'todo' } });
    expect(page()).toBeNull();
  });
});

describe('a question that steps aside while its item is open', () => {
  it('comes back once the journal page is closed, not before', () => {
    const { result } = overlay();
    const onReturn = jest.fn();
    act(() => result.current.openItemThenReturn({ id: 'j1', type: 'note' }, onReturn));
    // the popup closes first, then the page opens
    expect(page()).toBeNull();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(page()).toMatchObject({ entryId: 'j1', reading: true });
    expect(result.current.state.visible).toBe(false);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onReturn).not.toHaveBeenCalled();

    act(() => closeJournal());
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('opens any other item in the overlay, and comes back when that closes', () => {
    const { result } = overlay();
    const onReturn = jest.fn();
    act(() => result.current.openItemThenReturn({ id: 'i1', type: 'note' }, onReturn));
    expect(result.current.state).toMatchObject({ visible: true, mode: 'edit' });
    expect(page()).toBeNull();
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onReturn).not.toHaveBeenCalled();
    act(() => result.current.close());
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
