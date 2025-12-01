import type { IRepo } from '../IRepo';
import type { AppRecord } from '../../types';

type ListOpts = { createdAfter?: string };

/**
 * augmentRepoWithListAdapters
 *
 * Adds thin list adapters under repo.notes/todos/habits with a minimal API:
 *   .list({ createdAfter?: string }) => Promise<AppRecord[]>
 *
 * Behavior:
 * - If createdAfter is provided, filters by created_at >= createdAfter (client-side for now).
 * - Otherwise, returns recent N items (N=100) sorted by created_at desc.
 *
 * Notes:
 * - Intentionally non-invasive: does not modify IRepo interface. Consumers can access via (repo as any).
 * - TODO: Optimize Supabase backend to push createdAfter filter into the SQL query for efficiency.
 * - TODO: Add pagination support when needed.
 */
export function augmentRepoWithListAdapters<T extends IRepo>(
  repo: T,
): T & {
  notes: { list: (opts?: ListOpts) => Promise<AppRecord[]> };
  todos: { list: (opts?: ListOpts) => Promise<AppRecord[]> };
  habits: { list: (opts?: ListOpts) => Promise<AppRecord[]> };
} {
  const adaptList = (type: AppRecord['type']) => async (opts?: ListOpts) => {
    const all = await repo.listByType(type);

    // Additional client-side filter for notes: exclude archived items
    // (Database filter should already handle this, but this is a safeguard)
    let filtered = all;
    if (type === 'note') {
      filtered = all.filter((item) => !(item as any).archived);
    }

    const sorted = [...filtered].sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || ''),
    );
    if (opts?.createdAfter) {
      const after = opts.createdAfter;
      return sorted.filter((i) => (i.created_at || '') >= after).slice(0, 100);
    }
    return sorted.slice(0, 100);
  };

  const withAdapters: any = repo as any;
  if (!withAdapters.notes) withAdapters.notes = {};
  if (!withAdapters.todos) withAdapters.todos = {};
  if (!withAdapters.habits) withAdapters.habits = {};

  withAdapters.notes.list = adaptList('note');
  withAdapters.todos.list = adaptList('todo');
  withAdapters.habits.list = adaptList('habit');

  return withAdapters;
}
