/**
 * Saving something new in a chat feeds Gremly like a drop: a card's applied
 * rows count when one of them added a todo, habit or note, and not for
 * edits, ticks, rows that did not go through, or a World or Chapter.
 */
import { feedForChatSave, savedSomethingNew } from '../feedsGremly';
import { withFeedAnimation } from '../../brief/feeding';

const mockCreditChatSave = jest.fn(async () => {});
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => ({ creditChatSave: mockCreditChatSave }) },
}));
jest.mock('../../brief/feeding', () => ({
  withFeedAnimation: jest.fn(async (credit: () => Promise<unknown>) => {
    await credit();
  }),
}));

const ok = (cid: string) => ({ cid, ok: true as const, summary: '', revert: async () => {} });
const failed = (cid: string) => ({
  cid,
  ok: false as const,
  reason: 'failed' as const,
  message: 'It was not saved.',
});

const addTodo = { cid: 'a', op: 'add', type: 'todo', title: 'Call Mum' } as any;
const addHabit = { cid: 'h', op: 'add', type: 'habit', title: 'Run' } as any;
const addNote = { cid: 'n', op: 'add', type: 'note', title: 'Wifi password' } as any;
const move = {
  cid: 'm',
  op: 'change',
  type: 'todo',
  id: 't1',
  fields: { day: '2026-10-11' },
} as any;
const tick = { cid: 'd', op: 'done', type: 'todo', id: 't2' } as any;
const chapter = { cid: 'c', op: 'add', type: 'chapter', title: 'Lisbon trip' } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreditChatSave.mockImplementation(async () => {});
  (withFeedAnimation as jest.Mock).mockImplementation(async (credit: () => Promise<unknown>) => {
    await credit();
  });
});

describe('what counts as saving something new', () => {
  it('a todo, habit or note added on the card', () => {
    expect(savedSomethingNew([addTodo], [ok('a')])).toBe(true);
    expect(savedSomethingNew([addHabit], [ok('h')])).toBe(true);
    expect(savedSomethingNew([addNote], [ok('n')])).toBe(true);
  });

  it('an add among other changes', () => {
    expect(savedSomethingNew([move, addTodo, tick], [ok('m'), ok('a'), ok('d')])).toBe(true);
  });

  it('not edits, moves or ticks on their own', () => {
    expect(savedSomethingNew([move, tick], [ok('m'), ok('d')])).toBe(false);
  });

  it('not an add that did not go through', () => {
    expect(savedSomethingNew([addTodo, move], [failed('a'), ok('m')])).toBe(false);
  });

  it('not a World or a Chapter made in the chat', () => {
    expect(savedSomethingNew([chapter], [ok('c')])).toBe(false);
  });

  it('nothing applied, nothing new', () => {
    expect(savedSomethingNew([], [])).toBe(false);
  });
});

describe('feeding for the save', () => {
  it('credits the store once and plays the feeding animation', async () => {
    await feedForChatSave();
    expect(withFeedAnimation).toHaveBeenCalledTimes(1);
    expect(mockCreditChatSave).toHaveBeenCalledTimes(1);
  });

  it('a credit that fails is reported, not thrown into the chat', async () => {
    mockCreditChatSave.mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(feedForChatSave()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
