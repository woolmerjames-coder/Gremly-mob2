/**
 * fileDrop: filing a drop's saved item (Mind Drop rethink stage 9): it starts
 * once per drop, says where it went, and puts Gremly's filing on the store's
 * links so the card and the place picker read what the database has.
 */
const mockState: Record<string, any> = {};
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockState,
    setState: (patch: Record<string, unknown>) => Object.assign(mockState, patch),
  },
}));
jest.mock('../../env', () => ({ env: { cortexUrl: 'https://test.cortex' } }));
jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: () => Promise.resolve('tok'),
}));

import { fileDropItem, startDropFiling, startedDropFiling } from '../fileDrop';
import type { QueuedDrop } from '../dropQueue';

let reply: Record<string, unknown> = {};
const realFetch = global.fetch;
beforeEach(() => {
  Object.assign(mockState, {
    userId: 'u1',
    notes: [],
    dropWorldLinks: [
      { drop_id: 'row-1', drop_type: 'todo', world_id: 'old', assigned_by: 'classifier' },
      { drop_id: 'row-1', drop_type: 'todo', world_id: 'mine', assigned_by: 'user' },
      { drop_id: 'other', drop_type: 'todo', world_id: 'old', assigned_by: 'classifier' },
    ],
    dropChapterLinks: [],
    setDropFiling: jest.fn(),
  });
  reply = {
    filed: {
      by: 'gremly',
      world: { id: 'w1', name: 'Travel' },
      chapter: { id: 'c1', title: 'Lisbon trip' },
      starts_something: false,
    },
  };
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => reply })) as any;
});
afterEach(() => {
  global.fetch = realFetch;
});

const drop = (over: Partial<QueuedDrop> = {}) =>
  ({
    localId: 'd1',
    text: 'book flights for lisbon',
    smartTitle: 'Book flights for Lisbon',
    bucket: 'todo',
    supabaseId: 'row-1',
    entityType: 'todo',
    ...over,
  }) as QueuedDrop;

describe('filing a drop', () => {
  it('says where it went, and keeps it for the card', async () => {
    const filing = await fileDropItem(drop());
    expect(filing).toMatchObject({ by: 'gremly', world: { id: 'w1' }, chapter: { id: 'c1' } });
    expect(mockState.setDropFiling).toHaveBeenCalledWith('row-1', filing);
  });

  it('puts Gremly’s filing on the store’s links, replacing its own earlier one and never the person’s', async () => {
    await fileDropItem(drop());
    expect(
      mockState.dropWorldLinks.map((l: any) => [l.drop_id, l.world_id, l.assigned_by]),
    ).toEqual([
      ['row-1', 'mine', 'user'],
      ['other', 'old', 'classifier'],
      ['row-1', 'w1', 'classifier'],
    ]);
    expect(mockState.dropChapterLinks.map((l: any) => [l.drop_id, l.chapter_id])).toEqual([
      ['row-1', 'c1'],
    ]);
  });

  it('starts once for a drop, and the same filing is found again', async () => {
    const a = startDropFiling(drop({ localId: 'once' }));
    const b = startDropFiling(drop({ localId: 'once' }));
    expect(a).toBe(b);
    expect(startedDropFiling('once')).toBe(a);
    await a.promise;
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('files nothing without a saved item, or for an event from their calendar', async () => {
    await expect(fileDropItem(drop({ supabaseId: undefined }))).resolves.toBeNull();
    mockState.notes = [{ id: 'cal', external_source: 'google' }];
    await expect(fileDropItem(drop({ supabaseId: 'cal', entityType: 'note' }))).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
