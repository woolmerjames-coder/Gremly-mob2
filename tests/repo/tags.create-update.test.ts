import { MemoryRepo } from '../../lib/repo/memory';
import type { CreateRecordInput } from '../../lib/repo/IRepo';

describe('MemoryRepo tags persistence', () => {
  const baseTodo: CreateRecordInput = {
    type: 'todo',
    name: 'Test task',
    ai_placed: false,
  };

  test('create() persists provided tags array', async () => {
    const repo = new MemoryRepo('test-user');
    const tags = ['@JohnDoe', '*list', '#work'];

    const created = await repo.create({
      ...baseTodo,
      tags,
    });

    expect(created.tags).toEqual(tags);

    const fetched = await repo.getById(created.id);
    expect(fetched?.tags).toEqual(tags);
  });

  test('update() replaces tags array', async () => {
    const repo = new MemoryRepo('test-user');
    const created = await repo.create({
      ...baseTodo,
      tags: ['#initial'],
    });

    const updated = await repo.update({
      id: created.id,
      patch: {
        tags: ['#followup', '@owner'],
      },
    });

    expect(updated.tags).toEqual(['#followup', '@owner']);

    const fetched = await repo.getById(created.id);
    expect(fetched?.tags).toEqual(['#followup', '@owner']);
  });

  test('update() can clear tags by setting null', async () => {
    const repo = new MemoryRepo('test-user');
    const created = await repo.create({
      ...baseTodo,
      tags: ['#initial'],
    });

    const updated = await repo.update({
      id: created.id,
      patch: {
        tags: null,
      },
    });

    expect(updated.tags).toBeNull();

    const fetched = await repo.getById(created.id);
    expect(fetched?.tags).toBeNull();
  });
});

describe('SupabaseRepo tags wiring', () => {
  test.todo('includes tags in insert/update payload (requires Supabase client mock)');
});
