/**
 * A Chapter Gremly offered in a chat that the person said no to: what of each
 * row is kept, and that only a new Chapter counts.
 */
import { offeredChapters, sayNoToChapters } from '../saidNo';
import { callChapterSaidNo } from '../../cortex/CortexClient';

jest.mock('../../cortex/CortexClient', () => ({ callChapterSaidNo: jest.fn() }));

const rows = [
  {
    cid: 'c1',
    op: 'add',
    type: 'chapter',
    id: null,
    title: 'Lisbon trip',
    fields: {
      name: ' Lisbon trip ',
      world: 'w1',
      start_day: '2026-10-28',
      end_day: '2026-11-02',
      items: [
        { type: 'todo', id: 't1' },
        { type: 'note', id: 'n1', extra: true },
        { type: 'todo' },
      ],
    },
  },
  { cid: 'c2', op: 'add', type: 'todo', id: null, title: 'Book flights', fields: {} },
  {
    cid: 'c3',
    op: 'change',
    type: 'chapter',
    id: 'ch1',
    title: 'Garden',
    fields: { name: 'Yard' },
  },
  { cid: 'c4', op: 'add', type: 'chapter', id: null, title: 'Choir', fields: {} },
  { cid: 'c5', op: 'add', type: 'chapter', id: null, title: '', fields: { name: ' ' } },
] as any;

beforeEach(() => jest.clearAllMocks());

it('keeps each new Chapter offered, with its World, dates and items', () => {
  expect(offeredChapters(rows)).toEqual([
    {
      title: 'Lisbon trip',
      world_id: 'w1',
      start_date: '2026-10-28',
      end_date: '2026-11-02',
      items: [
        { type: 'todo', id: 't1' },
        { type: 'note', id: 'n1' },
      ],
    },
    { title: 'Choir', world_id: null, start_date: null, end_date: null, items: [] },
  ]);
});

it('tells cortex only when a new Chapter was offered', async () => {
  (callChapterSaidNo as jest.Mock).mockResolvedValue({ ok: true, data: { kept: 2 } });
  sayNoToChapters([rows[1], rows[2]]);
  expect(callChapterSaidNo).not.toHaveBeenCalled();
  sayNoToChapters(rows);
  expect(callChapterSaidNo).toHaveBeenCalledTimes(1);
  expect((callChapterSaidNo as jest.Mock).mock.calls[0][0]).toHaveLength(2);
});

it('a failure only goes to the log', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  (callChapterSaidNo as jest.Mock).mockRejectedValue(new Error('offline'));
  expect(() => sayNoToChapters(rows)).not.toThrow();
  await new Promise((r) => setTimeout(r, 0));
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
