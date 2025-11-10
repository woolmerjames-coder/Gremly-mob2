import { MemoryRepo } from '../../lib/repo/memory';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type { AppRecord } from '../../lib/types';

describe('MemoryRepo tagNames filtering', () => {
  let repo: MemoryRepo;
  let focusProject: AppRecord;
  let focusOnly: AppRecord;

  const baseNote: CreateRecordInput = {
    type: 'note',
    subtype: 'idea',
    title: 'Temp title',
    body: 'Body',
  };

  beforeEach(async () => {
    repo = new MemoryRepo('tag-filter-user');

    focusProject = await repo.create({
      ...baseNote,
      title: 'Deep Work Plan',
      tags: ['#Focus', '*Project'],
    });

    focusOnly = await repo.create({
      ...baseNote,
      title: 'Focus Only',
      tags: ['#focus'],
    });

    await repo.create({
      ...baseNote,
      title: 'Project Only',
      tags: ['*project'],
    });
  });

  test('matches items containing requested tag name (case-insensitive)', async () => {
    const results = await repo.listByType('note', { tagNames: ['#focus'] });
    const ids = results.map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining([focusProject.id, focusOnly.id]));
  });

  test('requires all provided tag names (AND semantics)', async () => {
    const results = await repo.listByType('note', { tagNames: ['#focus', '*project'] });

    expect(results.map((item) => item.id)).toEqual([focusProject.id]);
  });

  test('returns empty array when any tag is missing', async () => {
    const results = await repo.listByType('note', { tagNames: ['#focus', '@missing'] });

    expect(results).toHaveLength(0);
  });
});
