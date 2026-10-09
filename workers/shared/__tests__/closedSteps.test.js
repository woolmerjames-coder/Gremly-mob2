// The steps left on a closed Chapter stay with it and leave what Gremly reads
// of the day (Worlds rebuild): the ids, and the rows without them.
import { memoryDb } from '../../inngest-jobs/context/__tests__/memoryDb.js';
import { stepsOnClosedChapters, withoutClosedSteps } from '../closedSteps.js';

const d = memoryDb({
  chapters: [
    { id: 'cA', owner_id: 'u', phase: 'closed', closed_at: '2026-10-01T10:00:00Z' },
    { id: 'cB', owner_id: 'u', phase: 'active', closed_at: null },
    { id: 'cC', owner_id: 'u', phase: 'active', closed_at: '2026-10-02T10:00:00Z' },
    { id: 'cX', owner_id: 'someone', phase: 'closed', closed_at: '2026-10-01T10:00:00Z' },
  ],
  drop_chapter_links: [
    { drop_id: 't1', drop_type: 'todo', chapter_id: 'cA', owner_id: 'u' },
    { drop_id: 'n1', drop_type: 'note', chapter_id: 'cA', owner_id: 'u' },
    { drop_id: 't2', drop_type: 'todo', chapter_id: 'cB', owner_id: 'u' },
    { drop_id: 't3', drop_type: 'todo', chapter_id: 'cC', owner_id: 'u' },
    { drop_id: 't9', drop_type: 'todo', chapter_id: 'cX', owner_id: 'someone' },
  ],
});

test('the todos filed in their closed Chapters, closed by phase or by date', async () => {
  expect([...(await stepsOnClosedChapters(d, 'u'))].sort()).toEqual(['t1', 't3']);
});

test('nothing left out when there is no closed Chapter, or it cannot be read', async () => {
  expect((await stepsOnClosedChapters(memoryDb({ chapters: [] }), 'u')).size).toBe(0);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const broken = {
    select: async () => {
      throw new Error('down');
    },
  };
  expect((await stepsOnClosedChapters(broken, 'u')).size).toBe(0);
  warn.mockRestore();
});

test('rows without the steps left on a closed Chapter', () => {
  const rows = [{ id: 't1' }, { id: 't2' }];
  expect(withoutClosedSteps(rows, new Set(['t1']))).toEqual([{ id: 't2' }]);
  expect(withoutClosedSteps(rows, new Set())).toBe(rows);
  expect(withoutClosedSteps(null, new Set(['t1']))).toEqual([]);
});
