import { memoryRepo } from '../../lib/repo/memory';

describe('MemoryRepo', () => {
  test('can create and get habit', async () => {
    const h = await memoryRepo.create({
      type: 'habit',
      title: 'Read 10 pages',
      frequency: 'daily',
    });
    const got = await memoryRepo.get(h.id);
    expect(got?.title).toBe('Read 10 pages');
  });

  test('lists undefined due todos', async () => {
    const t = await memoryRepo.create({ type: 'todo', title: 'Buy milk' });
    const undated = await memoryRepo.listUndefinedDue();
    expect(undated.find((x) => x.id === t.id)).toBeTruthy();
  });

  test('search works', async () => {
    await memoryRepo.create({
      type: 'note',
      title: 'Groceries',
      subtype: 'list',
      body: '- milk',
    });
    const hit = await memoryRepo.search('milk');
    expect(hit.length).toBeGreaterThan(0);
  });
});
