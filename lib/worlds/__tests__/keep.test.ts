/**
 * Save from chat: the offer as the app keeps it, the note it makes, and
 * keeping it in a Chapter or a World with Undo.
 */
import { useGremlyStore } from '../../store/useGremlyStore';
import {
  canUndoKept,
  keepOfferFrom,
  keptNote,
  pagePlace,
  placeNow,
  saveKept,
  undoKept,
} from '../keep';

jest.mock('../../store/useGremlyStore', () => ({ useGremlyStore: { getState: jest.fn() } }));

const page = { type: 'chapter' as const, id: 'ch1', name: 'Lisbon trip' };

describe('the offer', () => {
  it('takes the place Gremly named, or else the page it was said on', () => {
    const raw = { kind: 'list', title: ' Packing ', lines: ['Passport', ' ', 3, 'Shoes '] };
    expect(keepOfferFrom(raw, page)).toEqual({
      kind: 'list',
      title: 'Packing',
      lines: ['Passport', 'Shoes'],
      place: page,
    });
    const named = { ...raw, place: { type: 'world', id: 'w1', name: 'Travel' }, version: 'k1' };
    expect(keepOfferFrom(named, page)).toMatchObject({
      place: { type: 'world', id: 'w1', name: 'Travel' },
      version: 'k1',
    });
    expect(keepOfferFrom({ ...raw, kind: 'poem' }, null)).toMatchObject({
      kind: 'note',
      place: null,
    });
  });

  it('is nothing without a name or a line', () => {
    expect(keepOfferFrom({ title: '', lines: ['a'] }, page)).toBeNull();
    expect(keepOfferFrom({ title: 'a', lines: [] }, page)).toBeNull();
    expect(keepOfferFrom(null, page)).toBeNull();
  });

  it('a World’s or a Chapter’s chat is a place; any other chat is not', () => {
    expect(pagePlace({ type: 'chapter', id: 'ch1', title: 'Lisbon trip' })).toEqual(page);
    expect(pagePlace({ type: 'todo', id: 't1', title: 'Vet' })).toBeNull();
    expect(pagePlace(null)).toBeNull();
  });
});

describe('the note it makes', () => {
  it('a list keeps its tick boxes, a note its lines', () => {
    const offer = {
      kind: 'list' as const,
      title: 'Packing',
      lines: ['Passport', 'Shoes'],
      place: null,
    };
    expect(keptNote(offer, () => 'x')).toEqual({
      title: 'Packing',
      subtype: 'general',
      ai_placed: true,
      origin: 'chat_save',
      body: '',
      has_list: true,
      list_items: [
        { id: 'item-0-x', text: 'Passport', checked: false },
        { id: 'item-1-x', text: 'Shoes', checked: false },
      ],
    });
    expect(keptNote({ ...offer, kind: 'note' })).toEqual({
      title: 'Packing',
      subtype: 'general',
      ai_placed: true,
      origin: 'chat_save',
      body: 'Passport\nShoes',
    });
  });
});

describe('keeping it', () => {
  const offer = { kind: 'note' as const, title: 'Ideas', lines: ['Sintra'], place: page };
  let s: Record<string, jest.Mock | unknown[]>;
  beforeEach(() => {
    const unplace = jest.fn(async () => {});
    s = {
      chapters: [{ id: 'ch1', title: 'Lisbon with Sam', phase: 'active', closed_at: null }],
      worlds: [
        { id: 'w1', name: 'Travel', display_name: 'Travel', phase: 'active' },
        { id: 'w2', name: 'Band', display_name: 'Band', phase: 'archived' },
      ],
      createNote: jest.fn(async () => ({ id: 'n1', type: 'note' })),
      placeItem: jest.fn(async () => unplace),
      deleteNote: jest.fn(async () => {}),
      unplace,
    };
    (useGremlyStore.getState as jest.Mock).mockReturnValue(s);
  });

  it('makes the note in the Chapter, and Undo takes it away', async () => {
    await saveKept('m1', offer, page);
    expect(s.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Ideas', body: 'Sintra' }),
    );
    expect(s.placeItem).toHaveBeenCalledWith({ id: 'n1', type: 'note' }, { chapterId: 'ch1' });
    expect(canUndoKept('m1')).toBe(true);
    await undoKept('m1');
    expect(s.unplace).toHaveBeenCalled();
    expect(s.deleteNote).toHaveBeenCalledWith('n1');
    expect(canUndoKept('m1')).toBe(false);
  });

  it('in a World, straight in', async () => {
    await saveKept('m2', offer, { type: 'world', id: 'w1', name: 'Travel' });
    expect(s.placeItem).toHaveBeenCalledWith({ id: 'n1', type: 'note' }, { worldId: 'w1' });
  });

  it('leaves nothing half made when it cannot be put in its place', async () => {
    (s.placeItem as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(saveKept('m3', offer, page)).rejects.toThrow('offline');
    expect(s.deleteNote).toHaveBeenCalledWith('n1');
    expect(canUndoKept('m3')).toBe(false);
  });

  it('names the place as it reads now, and not one closed or hidden', () => {
    expect(placeNow(page)).toEqual({ ...page, name: 'Lisbon with Sam' });
    expect(placeNow({ type: 'world', id: 'w2', name: 'Band' })).toBeNull();
    expect(placeNow({ type: 'chapter', id: 'gone', name: 'x' })).toBeNull();
    expect(placeNow(null)).toBeNull();
  });
});
