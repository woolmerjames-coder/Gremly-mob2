/**
 * fetchAllPaginated.test.ts
 *
 * Unit tests for the paginated Supabase fetch utility.
 */

import { fetchAllPaginated } from '../../lib/supabase/fetchAllPaginated';

/** Builds a mock queryBuilder that returns the given pages of data. */
function makeQueryBuilder(pages: Array<{ data: any[] | null; error: any }>) {
  let callCount = 0;
  return jest.fn(() => ({
    range: jest.fn(() => {
      const page = pages[callCount] ?? { data: [], error: null };
      callCount++;
      return Promise.resolve(page);
    }),
  }));
}

describe('fetchAllPaginated', () => {
  it('returns all rows from a single page smaller than pageSize', async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const qb = makeQueryBuilder([{ data: rows, error: null }]);

    const result = await fetchAllPaginated(qb, 1000);

    expect(result).toEqual(rows);
    expect(qb).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when the first page has no data', async () => {
    const qb = makeQueryBuilder([{ data: [], error: null }]);

    const result = await fetchAllPaginated(qb, 1000);

    expect(result).toEqual([]);
    expect(qb).toHaveBeenCalledTimes(1);
  });

  it('handles a null data response as an empty result', async () => {
    const qb = makeQueryBuilder([{ data: null, error: null }]);

    const result = await fetchAllPaginated(qb, 1000);

    expect(result).toEqual([]);
    expect(qb).toHaveBeenCalledTimes(1);
  });

  it('paginates across multiple full pages', async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const page2 = Array.from({ length: 3 }, (_, i) => ({ id: i + 3 }));
    const page3 = [{ id: 6 }]; // partial page → stop
    const qb = makeQueryBuilder([
      { data: page1, error: null },
      { data: page2, error: null },
      { data: page3, error: null },
    ]);

    const result = await fetchAllPaginated(qb, 3);

    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ id: 0 });
    expect(result[6]).toEqual({ id: 6 });
    expect(qb).toHaveBeenCalledTimes(3);
  });

  it('stops after exactly pageSize rows on the second page', async () => {
    const page1 = Array.from({ length: 2 }, (_, i) => ({ id: i }));
    const page2 = Array.from({ length: 2 }, (_, i) => ({ id: i + 2 }));
    // Exactly pageSize on page 2 → must fetch a third page to know if more exist
    const page3: any[] = [];
    const qb = makeQueryBuilder([
      { data: page1, error: null },
      { data: page2, error: null },
      { data: page3, error: null },
    ]);

    const result = await fetchAllPaginated(qb, 2);

    expect(result).toHaveLength(4);
    expect(qb).toHaveBeenCalledTimes(3);
  });

  it('throws when the query returns an error', async () => {
    const supabaseError = { message: 'permission denied', code: '42501' };
    const qb = makeQueryBuilder([{ data: null, error: supabaseError }]);

    await expect(fetchAllPaginated(qb, 1000)).rejects.toEqual(supabaseError);
  });

  it('throws on error mid-pagination and does not continue fetching', async () => {
    const page1 = [{ id: 0 }, { id: 1 }];
    const supabaseError = { message: 'network error' };
    const qb = makeQueryBuilder([
      { data: page1, error: null },
      { data: null, error: supabaseError },
    ]);

    await expect(fetchAllPaginated(qb, 2)).rejects.toEqual(supabaseError);
    // Only 2 calls — stops as soon as error is encountered.
    expect(qb).toHaveBeenCalledTimes(2);
  });

  it('respects a custom pageSize', async () => {
    const rows = [{ id: 0 }, { id: 1 }, { id: 2 }];
    const qb = makeQueryBuilder([{ data: rows, error: null }]);

    const result = await fetchAllPaginated(qb, 50);

    expect(result).toEqual(rows);
    // The query builder's .range() should be called with (0, 49) — pageSize=50.
    const rangeCall = qb.mock.results[0].value.range.mock.calls[0];
    expect(rangeCall).toEqual([0, 49]);
  });
});
