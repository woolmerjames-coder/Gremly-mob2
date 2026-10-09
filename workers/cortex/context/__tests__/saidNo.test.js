/**
 * @jest-environment node
 */
// A Chapter Gremly offered in chat that the person said no to (Worlds
// rebuild, stage 2): kept as the brief's own suggestions are, so neither
// offers it again.

import { chatNoKey, rememberChapterNo, saidNoRow } from '../saidNo.js';
import { startNoKey } from '../../../inngest-jobs/context/chapterQuestions.js';

const USER = '0b7c6f0e-1d2a-4c3b-9e8f-112233445566';
const NOW = '2026-10-08T09:00:00.000Z';
const id = (n) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;

const trip = {
  title: '  Lisbon   trip ',
  world_id: id(1),
  start_date: '2026-10-28',
  end_date: '2026-11-02',
  items: [
    { type: 'todo', id: id(3) },
    { type: 'note', id: id(2) },
    { type: 'step', id: id(4) },
    { type: 'habit', id: 'not-an-id' },
  ],
};

describe('the row kept for a no', () => {
  it('is the brief’s own kind of no, resting on the same items', () => {
    const row = saidNoRow(USER, trip, NOW);
    expect(row).toEqual({
      user_id: USER,
      kind: 'start_chapter',
      question: 'Start a Chapter for Lisbon trip?',
      status: 'dismissed',
      answer: 'no',
      answered_at: NOW,
      record_table: 'worlds',
      record_id: id(1),
      rests_on: [
        { table: 'todos', id: id(3) },
        { table: 'notes', id: id(2) },
      ],
      proposed_change: {
        type: 'start',
        title: 'Lisbon trip',
        world_id: id(1),
        start_date: '2026-10-28',
        end_date: '2026-11-02',
        from: 'chat',
      },
      no_key: startNoKey(row.rests_on),
      prompt_version: 'chat-said-no',
    });
  });

  it('with no items, is kept by its name', () => {
    expect(chatNoKey(' Choir ', [])).toBe('start:named:choir');
    const row = saidNoRow(USER, { title: 'Choir', world_id: 'nope', end_date: '2 Nov' }, NOW);
    expect(row.record_table).toBeNull();
    expect(row.record_id).toBeNull();
    expect(row.proposed_change.end_date).toBeNull();
    expect(row.no_key).toBe('start:named:choir');
  });

  it('is nothing without a name or a person', () => {
    expect(saidNoRow(USER, { title: '  ' }, NOW)).toBeNull();
    expect(saidNoRow(USER, null, NOW)).toBeNull();
    expect(saidNoRow(null, trip, NOW)).toBeNull();
  });
});

describe('keeping them', () => {
  it('writes each one, at most ten', async () => {
    const insertQuiet = jest.fn(async () => {});
    const list = Array.from({ length: 12 }, (_, i) => ({ title: `Chapter ${i}` }));
    const out = await rememberChapterNo({}, USER, [...list, { title: '' }], {
      db: { insertQuiet },
      now: () => NOW,
    });
    expect(out).toEqual({ kept: 10 });
    expect(insertQuiet).toHaveBeenCalledWith('gremly_questions', expect.any(Array));
    expect(insertQuiet.mock.calls[0][1]).toHaveLength(10);
  });

  it('writes nothing for nothing, and never throws', async () => {
    const insertQuiet = jest.fn(async () => {
      throw new Error('down');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await rememberChapterNo({}, USER, 'nope', { db: { insertQuiet } })).toEqual({
      kept: 0,
    });
    expect(insertQuiet).not.toHaveBeenCalled();
    expect(await rememberChapterNo({}, USER, [trip], { db: { insertQuiet } })).toEqual({
      kept: 0,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
