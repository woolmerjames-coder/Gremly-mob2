/**
 * The item overlay while its item changes underneath it: Gremly adds to the
 * item's notes from the item's own chat, which sits on top of the overlay.
 * The notes field shows the new text straight away, unless the person is
 * mid-edit, and their own words are never lost.
 */
import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import '../../tests/overlay/__testutils__/mockUnifiedOverlayDeps';

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn().mockResolvedValue({ id: 'x1', type: 'todo' }),
    update: jest.fn().mockResolvedValue({ id: 'x1', type: 'todo' }),
    getById: jest.fn(),
    remove: jest.fn(),
    listSpaces: jest.fn(() => Promise.resolve([])),
    getAll: jest.fn(() => []),
  }),
}));

jest.mock('../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: () => ({
    shouldRunMindDropPrefill: false,
    suggestedTitle: null,
    suggestedTags: [],
    aiTags: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock('../../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({
    state: { visible: false, mode: 'create', record: null, spaceId: null },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useOverlayDraft } from '../../components/overlay/useOverlayDraft';

const todo = {
  id: 't-vet',
  name: 'Vet visit',
  title: 'Vet visit',
  body: 'Call the surgery first',
  origin: 'manual',
  due_day: '2026-10-08',
  created_at: '2026-10-01T09:12:00Z',
  updated_at: '2026-10-01T09:12:00Z',
  user_id: 'test-user',
  space_id: null,
  tags: [],
  views: {},
};
const record = { ...todo, type: 'todo' as const };

/** What the chat's card writes when it adds to the item's notes. */
const ADDED = "Bring Bella's vaccination record";
const afterAdd = {
  ...todo,
  body: `${todo.body}\n\n${ADDED}`,
  updated_at: '2026-10-07T10:00:00Z',
  views: {
    change_log: [
      {
        id: 'c1',
        field: 'body',
        from: null,
        to: null,
        was: '',
        now: 'Added to its notes',
        at: '2026-10-07T10:00:00Z',
        source: 'chat',
      },
    ],
  },
};

const input = (r: ReturnType<typeof render>) => r.getByLabelText('Overlay content input');

describe('UnifiedOverlayV2: the item changes while it is open', () => {
  beforeEach(() => {
    useGremlyStore.setState({ todos: [todo] as any, notes: [], habits: [] });
  });
  afterEach(() => {
    useOverlayDraft.getState().discard();
    useGremlyStore.setState({ todos: [], notes: [], habits: [] });
  });

  it('shows the new notes straight away', () => {
    const r = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
    );
    expect(input(r).props.value).toBe('Call the surgery first');
    act(() => {
      useGremlyStore.setState({ todos: [afterAdd] as any });
    });
    expect(input(r).props.value).toBe(`Call the surgery first\n\n${ADDED}`);
    // and a Save from here builds on the item as it is now, history and all
    expect((useOverlayDraft.getState().draft?.originalEntity as any).views).toEqual(afterAdd.views);
    expect((useOverlayDraft.getState().draft?.originalEntity as any).type).toBe('todo');
  });

  it('gives an item with no notes the added text alone', () => {
    const bare = { ...todo, body: null };
    useGremlyStore.setState({ todos: [bare] as any });
    const r = render(
      <UnifiedOverlayV2
        visible
        mode="edit"
        onClose={jest.fn()}
        initialEntity={{ ...bare, type: 'todo' as const }}
      />,
    );
    act(() => {
      useGremlyStore.setState({ todos: [{ ...bare, body: ADDED }] as any });
    });
    expect(input(r).props.value).toBe(ADDED);
  });

  it('keeps what they have typed, with what was added on the end', () => {
    const r = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
    );
    fireEvent.changeText(input(r), 'Call the surgery before nine');
    act(() => {
      useGremlyStore.setState({ todos: [afterAdd] as any });
    });
    expect(input(r).props.value).toBe(`Call the surgery before nine\n\n${ADDED}`);
  });

  it('keeps what they have typed when the notes were changed some other way', () => {
    const r = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
    );
    fireEvent.changeText(input(r), 'Call the surgery before nine');
    act(() => {
      useGremlyStore.setState({ todos: [{ ...todo, body: 'Ring them' }] as any });
    });
    expect(input(r).props.value).toBe('Call the surgery before nine');
  });

  it('follows a change to another part of the item, and leaves the notes they typed', () => {
    const r = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
    );
    fireEvent.changeText(input(r), 'Call the surgery before nine');
    act(() => {
      useGremlyStore.setState({ todos: [{ ...todo, due_day: '2026-10-09' }] as any });
    });
    const draft = useOverlayDraft.getState().draft!;
    expect(draft.todo.due_day).toBe('2026-10-09');
    expect(draft.todo.details).toBe('Call the surgery before nine');
  });

  it('puts the field back to what they typed when the addition is undone', () => {
    const r = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
    );
    fireEvent.changeText(input(r), 'Call the surgery before nine');
    act(() => {
      useGremlyStore.setState({ todos: [afterAdd] as any });
    });
    expect(input(r).props.value).toBe(`Call the surgery before nine\n\n${ADDED}`);
    // Undo on the card: the item's notes go back
    act(() => {
      useGremlyStore.setState({ todos: [{ ...todo, updated_at: '2026-10-07T10:01:00Z' }] as any });
    });
    expect(input(r).props.value).toBe('Call the surgery before nine');
  });

  it('shows a habit its new notes too', () => {
    const habit = {
      id: 'h-run',
      name: 'Run',
      notes: 'Three times a week',
      cadence: 'weekly',
      target_per_period: 3,
      origin: 'manual',
      created_at: '2026-10-01T09:12:00Z',
      user_id: 'test-user',
      views: {},
    };
    useGremlyStore.setState({ habits: [habit] as any, todos: [] });
    const r = render(
      <UnifiedOverlayV2
        visible
        mode="edit"
        onClose={jest.fn()}
        initialEntity={{ ...habit, type: 'habit' as const }}
      />,
    );
    act(() => {
      useGremlyStore.setState({
        habits: [{ ...habit, notes: 'Three times a week\n\nEasy pace on Sundays' }] as any,
      });
    });
    expect(useOverlayDraft.getState().draft?.habit.notes).toBe(
      'Three times a week\n\nEasy pace on Sundays',
    );
  });

  describe("the overlay's own Save", () => {
    // Save writes the draft to the store while `saving` is set, and the store
    // takes the write back if the save fails
    const typed = 'Call the surgery first, before nine';
    const optimistic = { ...todo, body: typed, updated_at: '2026-10-07T10:02:00Z' };

    it('is not news to the draft: what they typed is not added to itself', () => {
      const r = render(
        <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
      );
      fireEvent.changeText(input(r), typed);
      act(() => {
        useOverlayDraft.getState().setUI({ saving: true });
        useGremlyStore.setState({ todos: [optimistic] as any });
      });
      expect(input(r).props.value).toBe(typed);
    });

    it('keeps their edits when the save fails and the store takes its write back', () => {
      const r = render(
        <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
      );
      fireEvent.changeText(input(r), typed);
      act(() => {
        useOverlayDraft.getState().setUI({ saving: true });
        useGremlyStore.setState({ todos: [optimistic] as any });
        // the write fails: the store goes back, and then the overlay stops saving
        useGremlyStore.setState({ todos: [todo] as any });
        useOverlayDraft.getState().setUI({ saving: false });
      });
      expect(input(r).props.value).toBe(typed);
      // a change from outside after that is still brought in, on top of theirs
      act(() => {
        useGremlyStore.setState({ todos: [afterAdd] as any });
      });
      expect(input(r).props.value).toBe(`${typed}\n\n${ADDED}`);
    });
  });

  it('takes a change once when two overlays are drawn from the one draft', () => {
    // the cards screen draws its own overlay beside the app's
    const r = render(
      <>
        <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />
        <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />
      </>,
    );
    act(() => {
      useGremlyStore.setState({ todos: [afterAdd] as any });
    });
    expect(useOverlayDraft.getState().draft?.todo.details).toBe(
      `Call the surgery first\n\n${ADDED}`,
    );
    expect(r.getAllByLabelText('Overlay content input')[0].props.value).toBe(
      `Call the surgery first\n\n${ADDED}`,
    );
  });

  it('does nothing when the store hands back the same item', () => {
    const r = render(
      <UnifiedOverlayV2 visible mode="edit" onClose={jest.fn()} initialEntity={record} />,
    );
    fireEvent.changeText(input(r), 'Call the surgery before nine');
    act(() => {
      useGremlyStore.setState({ todos: [{ ...todo }] as any });
    });
    expect(input(r).props.value).toBe('Call the surgery before nine');
  });
});
