/**
 * The Save button under a reply worth keeping (Worlds rebuild, stage 2): it
 * names where it goes, keeps it there in one tap, the arrow picks somewhere
 * else, and once saved it says where, with Undo and Open it.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { KeepOffer } from '../KeepOffer';
import { useGremlyStore } from '../../../lib/store/useGremlyStore';
import { saveKept, undoKept } from '../../../lib/worlds/keep';
import type { KeepOfferMeta } from '../../../lib/brief/types';

jest.mock('../../../lib/store/useGremlyStore', () => {
  const { create } = require('zustand');
  return { useGremlyStore: create(() => ({})) };
});
jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({ ritualDay: () => '2026-10-08' }),
}));
jest.mock('../../../lib/worlds/keep', () => {
  const actual = jest.requireActual('../../../lib/worlds/keep');
  return { ...actual, saveKept: jest.fn(), undoKept: jest.fn(), canUndoKept: () => false };
});

const store = useGremlyStore as unknown as { setState: (s: object) => void };

const lisbon = { type: 'chapter' as const, id: 'ch1', name: 'Lisbon trip' };
const offer = (over: Partial<KeepOfferMeta> = {}): KeepOfferMeta => ({
  type: 'keep-offer',
  kind: 'note',
  title: 'Lisbon ideas',
  lines: ['Tram 28 early', 'A day in Sintra'],
  place: lisbon,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  store.setState({
    worlds: [
      {
        id: 'w1',
        name: 'Travel',
        display_name: 'Travel',
        phase: 'active',
        created_at: '2026-01-01',
      },
      { id: 'w2', name: 'Band', display_name: 'Band', phase: 'archived', created_at: '2026-01-02' },
    ],
    chapters: [
      {
        id: 'ch1',
        title: 'Lisbon trip',
        phase: 'active',
        primary_world_id: 'w1',
        start_date: '2026-11-20',
        end_date: '2026-11-22',
        closed_at: null,
      },
      {
        id: 'ch2',
        title: 'Summer move',
        phase: 'closed',
        primary_world_id: 'w1',
        closed_at: '2026-08-30T12:00:00Z',
      },
    ],
  });
  (saveKept as jest.Mock).mockResolvedValue({ id: 'n1' });
  (undoKept as jest.Mock).mockResolvedValue(undefined);
});

function draw(meta: KeepOfferMeta) {
  const onSaved = jest.fn();
  const onUndone = jest.fn();
  const onOpen = jest.fn();
  const view = render(
    <KeepOffer messageId="m1" meta={meta} onSaved={onSaved} onUndone={onUndone} onOpen={onOpen} />,
  );
  return { ...view, onSaved, onUndone, onOpen };
}

it('names where it goes, and one tap keeps it there', async () => {
  const { getByText, getByTestId, onSaved } = draw(offer());
  expect(getByText('Save to Lisbon trip')).toBeTruthy();
  await act(async () => fireEvent.press(getByTestId('keep-save')));
  expect(saveKept).toHaveBeenCalledWith(
    'm1',
    expect.objectContaining({ title: 'Lisbon ideas' }),
    lisbon,
  );
  expect(onSaved).toHaveBeenCalledWith({ id: 'n1', place: lisbon });
});

it('a list shows its first rows with their tick boxes', () => {
  const lines = ['Passport', 'Charger', 'Shoes', 'Jacket', 'Sunglasses'];
  const { getByText, queryByText } = draw(offer({ kind: 'list', title: 'Packing', lines }));
  expect(getByText('5 items')).toBeTruthy();
  expect(getByText('Shoes')).toBeTruthy();
  expect(queryByText('Jacket')).toBeNull();
  expect(getByText('and 2 more')).toBeTruthy();
});

it('the arrow picks somewhere else: Chapters in motion, then the Worlds they see', async () => {
  const { getByTestId, queryByTestId, onSaved } = draw(offer());
  fireEvent.press(getByTestId('keep-else'));
  expect(getByTestId('keep-to-ch1')).toBeTruthy();
  expect(queryByTestId('keep-to-ch2')).toBeNull();
  expect(queryByTestId('keep-to-w2')).toBeNull();
  await act(async () => fireEvent.press(getByTestId('keep-to-w1')));
  const travel = { type: 'world', id: 'w1', name: 'Travel' };
  expect(saveKept).toHaveBeenCalledWith('m1', expect.anything(), travel);
  expect(onSaved).toHaveBeenCalledWith({ id: 'n1', place: travel });
});

it('with no place named, or one that has closed, Save asks where', async () => {
  const { getByText, getByTestId } = draw(offer({ place: { ...lisbon, id: 'ch2' } }));
  expect(getByText('Save it')).toBeTruthy();
  await act(async () => fireEvent.press(getByTestId('keep-save')));
  expect(saveKept).not.toHaveBeenCalled();
  expect(getByTestId('keep-where')).toBeTruthy();
});

it('says so when it could not be saved, and claims nothing', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  (saveKept as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const { getByTestId, getByText, onSaved } = draw(offer());
  await act(async () => fireEvent.press(getByTestId('keep-save')));
  expect(getByText('That did not go through. Try again in a moment.')).toBeTruthy();
  expect(onSaved).not.toHaveBeenCalled();
  warn.mockRestore();
});

it('once saved: where it went, Undo while the chat is open, and Open it', async () => {
  const { getByTestId, queryByTestId, getByText, rerender, onSaved, onUndone, onOpen } =
    draw(offer());
  await act(async () => fireEvent.press(getByTestId('keep-save')));
  expect(onSaved).toHaveBeenCalled();
  rerender(
    <KeepOffer
      messageId="m1"
      meta={offer({ saved: { id: 'n1', place: lisbon } })}
      onSaved={onSaved}
      onUndone={onUndone}
      onOpen={onOpen}
    />,
  );
  expect(getByText('Saved to Lisbon trip')).toBeTruthy();
  expect(getByText('Note: Lisbon ideas')).toBeTruthy();
  fireEvent.press(getByTestId('keep-open'));
  expect(onOpen).toHaveBeenCalledWith('n1', 'Lisbon ideas');
  await act(async () => fireEvent.press(getByTestId('keep-undo')));
  expect(undoKept).toHaveBeenCalledWith('m1');
  await waitFor(() => expect(onUndone).toHaveBeenCalled());
  expect(queryByTestId('keep-undo')).toBeNull();
});

it('opened again later, a saved one has no Undo', () => {
  const { queryByTestId, getByText } = draw(offer({ saved: { id: 'n1', place: lisbon } }));
  expect(getByText('Saved to Lisbon trip')).toBeTruthy();
  expect(queryByTestId('keep-undo')).toBeNull();
});
