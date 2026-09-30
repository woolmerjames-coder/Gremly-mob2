/**
 * RelationPopup: the question for a held drop. The actions are mocked; the
 * popup only has to show the right words and call the right one.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { RelationPopup, CONFIRM_MS } from '../RelationPopup';
import {
  NEXT_QUESTION_CONFIRM_MS,
  POPUP_FADE_MS,
  TOAST_AFTER_CARDS_MS,
} from '../../../lib/minddrop/popupTiming';
import { applyDropRelation, keepDropAsNew } from '../../../lib/minddrop/relationActions';
import { eventBus } from '../../../lib/events/EventBus';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('lucide-react-native', () => ({
  ArrowRight: () => null,
  CalendarCheck: () => null,
  CheckCircle: () => null,
  ChevronRight: () => null,
  Repeat: () => null,
  StickyNote: () => null,
}));

const mockStore: any = { notes: [], todos: [], habits: [] };
jest.mock('../../../lib/store/useGremlyStore', () => {
  const useGremlyStore: any = (sel: (s: any) => unknown) => sel(mockStore);
  useGremlyStore.getState = () => mockStore;
  return { useGremlyStore };
});
jest.mock('../../../lib/minddrop/relationActions', () => ({
  applyDropRelation: jest.fn(),
  keepDropAsNew: jest.fn(),
  currentEntity: (e: any) => ({ entity: e, gone: null }),
  changeNow: (rel: any) => rel.change ?? null,
  leavingCardIds: (noteId: string) => [noteId, 't1'],
}));

const todo = {
  id: 't1',
  type: 'todo',
  title: 'Arrange a Pet Sitter for Bella',
  due_day: null,
  due_time: null,
};
const other = {
  id: 't2',
  type: 'todo',
  title: 'Book the dog groomer',
  due_day: null,
  due_time: null,
};
const classified = {
  bucket: 'log',
  subtype: 'general',
  habitSubtype: null,
  needsClarification: false,
  ambiguityType: null,
  clarificationQuestion: null,
  clarificationOptions: null,
};

function held(relation: any) {
  mockStore.notes = [
    {
      id: 'note-1',
      title: 'Booked the pet sitter',
      body: 'Booked the pet sitter',
      views: { relation: { ...relation, status: 'pending', classified } },
    },
  ];
  mockStore.todos = [{ id: 't1', created_at: '2026-09-30T09:00:00Z' }];
}

const done = {
  kind: 'edit',
  intent: 'complete',
  entity: todo,
  others: [other],
  confidence: 95,
  change: { field: 'completed', from: null, to: 'done' },
};

describe('RelationPopup', () => {
  it('shows the drop, the item and the two answers', async () => {
    held(done);
    const { findByText, getByText } = render(
      <RelationPopup visible noteId="note-1" onClose={jest.fn()} />,
    );
    await findByText('Mark this one done?');
    expect(getByText('“Booked the pet sitter”')).toBeTruthy();
    expect(getByText('Arrange a Pet Sitter for Bella')).toBeTruthy();
    expect(getByText('Yes, mark it done')).toBeTruthy();
    expect(getByText('Not that one')).toBeTruthy();
    expect(getByText('Skip for now')).toBeTruthy();
  });

  it('applies on yes, ticks briefly, then hands over to the toast and closes', async () => {
    held(done);
    const undo = jest.fn(async () => {});
    const toast = {
      icon: 'done',
      title: 'Marked “Arrange a Pet Sitter for Bella” done',
      detail: 'Drop archived',
    };
    (applyDropRelation as jest.Mock).mockResolvedValue({
      summary: 'Arrange a Pet Sitter for Bella is done.',
      confirm: 'Done',
      toast,
      targetId: 't1',
      targetType: 'todo',
      undo,
    });
    const order: string[] = [];
    const leaving = jest.fn();
    const go = jest.fn(() => order.push('cards'));
    const toasts = jest.fn(() => order.push('toast'));
    const offLeaving = eventBus.on('minddrop:cards_leaving', leaving);
    const offGo = eventBus.on('minddrop:cards_go', go);
    const offToast = eventBus.on('minddrop:relation_done', toasts);
    const onClose = jest.fn(() => order.push('popup closes'));
    const onResolved = jest.fn();
    const { findByText } = render(
      <RelationPopup visible noteId="note-1" onClose={onClose} onResolved={onResolved} />,
    );
    fireEvent.press(await findByText('Yes, mark it done'));
    // the cards are held in place while the popup shows its tick
    expect(leaving).toHaveBeenCalledWith({ ids: ['note-1', 't1'], hold: true });
    await findByText('Done');
    expect(applyDropRelation).toHaveBeenCalledWith('note-1', undefined);
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: CONFIRM_MS + 1000 });
    expect(onResolved).toHaveBeenCalledWith('applied', 't1');
    expect(go).not.toHaveBeenCalled();
    expect(toasts).not.toHaveBeenCalled();
    // once it has faded: the cards go, then the toast
    await waitFor(() => expect(toasts).toHaveBeenCalled(), {
      timeout: POPUP_FADE_MS + TOAST_AFTER_CARDS_MS + 1000,
    });
    expect(go).toHaveBeenCalledWith({ ids: ['note-1', 't1'] });
    expect(toasts).toHaveBeenCalledWith({ ...toast, undo, target: { id: 't1', type: 'todo' } });
    expect(order).toEqual(['popup closes', 'cards', 'toast']);
    offLeaving();
    offGo();
    offToast();
  });

  it('keeps the cards when the change did not go through', async () => {
    held(done);
    (applyDropRelation as jest.Mock).mockRejectedValue(new Error('That one is already done.'));
    const stay = jest.fn();
    const off = eventBus.on('minddrop:cards_stay', stay);
    const { findByText } = render(<RelationPopup visible noteId="note-1" onClose={jest.fn()} />);
    fireEvent.press(await findByText('Yes, mark it done'));
    await findByText('That one is already done.');
    expect(stay).toHaveBeenCalledWith({ ids: ['note-1', 't1'] });
    off();
  });

  it('offers the other items after Not that one', async () => {
    held(done);
    (applyDropRelation as jest.Mock).mockResolvedValue({ summary: 'ok', undo: jest.fn() });
    const { findByText, getByTestId } = render(
      <RelationPopup visible noteId="note-1" onClose={jest.fn()} />,
    );
    fireEvent.press(await findByText('Not that one'));
    await findByText('Which one did you mean?');
    fireEvent.press(getByTestId('relation-choice-t2'));
    await waitFor(() =>
      expect(applyDropRelation).toHaveBeenCalledWith(
        'note-1',
        expect.objectContaining({ id: 't2' }),
      ),
    );
  });

  it('files it as new on Skip for now and tells the caller', async () => {
    held(done);
    (keepDropAsNew as jest.Mock).mockResolvedValue('kept');
    const onResolved = jest.fn();
    const onClose = jest.fn();
    const { findByText } = render(
      <RelationPopup visible noteId="note-1" onClose={onClose} onResolved={onResolved} />,
    );
    fireEvent.press(await findByText('Skip for now'));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('kept'));
    expect(keepDropAsNew).toHaveBeenCalledWith('note-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('after Keep both, the question the drop has of its own follows once this popup has gone', async () => {
    held({ kind: 'same', intent: 'same', entity: todo, others: [], confidence: 95, extra: null });
    (keepDropAsNew as jest.Mock).mockResolvedValue('clarify');
    const order: string[] = [];
    const onClose = jest.fn(() => order.push('popup closes'));
    const onResolved = jest.fn(() => order.push('resolved'));
    const onNextQuestion = jest.fn(() => order.push('next question'));
    const { findByText, getByText } = render(
      <RelationPopup
        visible
        noteId="note-1"
        onClose={onClose}
        onResolved={onResolved}
        onNextQuestion={onNextQuestion}
      />,
    );
    fireEvent.press(await findByText('Keep both'));
    await findByText('Kept');
    expect(getByText('One more quick question about it')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onNextQuestion).toHaveBeenCalledWith('note-1'), {
      timeout: NEXT_QUESTION_CONFIRM_MS + POPUP_FADE_MS + 1000,
    });
    expect(onResolved).toHaveBeenCalledWith('clarify');
    expect(order).toEqual(['popup closes', 'resolved', 'next question']);
  });

  it('Skip for now leaves the question the drop has of its own on the card', async () => {
    held(done);
    (keepDropAsNew as jest.Mock).mockResolvedValue('clarify');
    const onClose = jest.fn();
    const onNextQuestion = jest.fn();
    const { findByText } = render(
      <RelationPopup visible noteId="note-1" onClose={onClose} onNextQuestion={onNextQuestion} />,
    );
    fireEvent.press(await findByText('Skip for now'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, NEXT_QUESTION_CONFIRM_MS + POPUP_FADE_MS + 100));
    expect(onNextQuestion).not.toHaveBeenCalled();
  });

  it('opens the item in full when it is tapped', async () => {
    held(done);
    const onOpenItem = jest.fn();
    const { findByText, getByTestId } = render(
      <RelationPopup visible noteId="note-1" onClose={jest.fn()} onOpenItem={onOpenItem} />,
    );
    await findByText('Mark this one done?');
    fireEvent.press(getByTestId('relation-item'));
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(applyDropRelation).not.toHaveBeenCalled();
  });

  it('asks same as this one with Keep just one and Keep both', async () => {
    held({ kind: 'same', intent: 'same', entity: todo, others: [], confidence: 95, extra: null });
    (keepDropAsNew as jest.Mock).mockResolvedValue('kept');
    const { findByText } = render(<RelationPopup visible noteId="note-1" onClose={jest.fn()} />);
    await findByText('Same as this one?');
    fireEvent.press(await findByText('Keep both'));
    await waitFor(() => expect(keepDropAsNew).toHaveBeenCalledWith('note-1'));
    expect(applyDropRelation).not.toHaveBeenCalled();
  });
});
