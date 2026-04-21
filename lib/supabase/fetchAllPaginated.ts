/**
 * Fetches all rows from a Supabase query, bypassing the default
 * 1000-row cap by paginating through .range() calls until a page
 * returns fewer rows than the page size.
 *
 * Pass a callback that returns a PostgrestFilterBuilder (everything
 * up to but NOT including .range() or .limit()). The helper will add
 * .range() internally.
 *
 * Example:
 *   const notes = await fetchAllPaginated<Note>(() =>
 *     supabase.from('notes')
 *       .select('*')
 *       .eq('owner_id', userId)
 *       .order('created_at', { ascending: false })
 *   );
 */
export async function fetchAllPaginated<T>(queryBuilder: () => any, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await queryBuilder().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
      continue;
    }
    all.push(...(data as T[]));
    if (data.length < pageSize) {
      hasMore = false;
      continue;
    }
    from += pageSize;
  }
  return all;
}
