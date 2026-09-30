/**
 * RelationPopup: the question for a held drop. The actions are mocked; the
 * popup only has to show the right words and call the right one.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { RelationPopup } from '../RelationPopup';
import { applyDropRelation, keepDropAsNew } from '../../../lib/minddrop/relationActions';

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

  it('applies on yes and offers Undo', async () => {
    held(done);
    const undo = jest.fn(async () => {});
    (applyDropRelation as jest.Mock).mockResolvedValue({
      summary: 'Arrange a Pet Sitter for Bella is done.',
      undo,
    });
    const { findByText, getByTestId } = render(
      <RelationPopup visible noteId="note-1" onClose={jest.fn()} />,
    );
    fireEvent.press(await findByText('Yes, mark it done'));
    await findByText('Arrange a Pet Sitter for Bella is done.');
    expect(applyDropRelation).toHaveBeenCalledWith('note-1', undefined);
    fireEvent.press(getByTestId('relation-undo'));
    await waitFor(() => expect(undo).toHaveBeenCalled());
    await findByText('Mark this one done?');
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
