/**
 * Linking an item to a World or a Chapter: the upsert names the links' whole
 * key (drop_id, drop_type and the World or Chapter), or the database refuses
 * it, and nothing is filed. A place Gremly had filed it in is merged, so their
 * choice of it becomes theirs and his filing never moves it again.
 */
import { upsertDropChapterLinks, upsertDropWorldLinks } from '../linkingRepo';

const mockCalls: { table: string; opts: unknown }[] = [];
jest.mock('../../supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (_rows: unknown, opts: unknown) => {
        mockCalls.push({ table, opts });
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

const base = {
  drop_id: 't1',
  drop_type: 'todo',
  owner_id: 'u',
  relevance_score: 1,
  assigned_by: 'user' as const,
  reason: null,
};

it('names the whole key of each kind of link, and makes a place they chose theirs', async () => {
  await upsertDropWorldLinks([{ ...base, world_id: 'w1' }]);
  await upsertDropChapterLinks([{ ...base, chapter_id: 'c1' }]);
  expect(mockCalls).toEqual([
    {
      table: 'drop_world_links',
      opts: { onConflict: 'drop_id,drop_type,world_id' },
    },
    {
      table: 'drop_chapter_links',
      opts: { onConflict: 'drop_id,drop_type,chapter_id' },
    },
  ]);
});
