import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepo } from '../../../providers/RepoProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { eventBus } from '../../events';
import { env } from '../../env';
import type { AppRecord } from '../../types';

export type TodayMergedTodo = {
  type: 'todo';
  id: string;
  name: string;
  due_date?: string | null;
  due_day?: string | null;
  space_id?: string | null;
  tags?: string[];
  status?: 'active' | 'completed' | 'archived';
  carry_forward?: boolean;
  overdue?: boolean;
  nearDue?: boolean;
};

export type TodayMergedHabit = {
  type: 'habit';
  id: string;
  name: string;
  space_id?: string | null;
  tags?: string[];
  cadence?: 'day' | 'week' | 'month';
  target_count?: number;
  period_unit?: 'day' | 'week' | 'month';
  time_window?: 'any' | 'morning' | 'midday' | 'evening';
  progress_today?: number;
};

export type TodayMergedEntry = TodayMergedTodo | TodayMergedHabit;

export interface TodayEntriesState {
  items: TodayMergedEntry[];
  completed: number; // from repo summary when available
  remaining: number; // from repo summary when available
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * useTodayEntries - Phase 10.9 (Today v3)
 * Returns merged Habits+Todos for "What's on today" and a (completed/remaining) summary.
 * Requires Phase 2 repo methods; falls back to v2 helpers when absent.
 */
export function useTodayEntries(): TodayEntriesState {
  const repo = useRepo();
  const { user } = useAuth();

  const [items, setItems] = useState<TodayMergedEntry[]>([]);
  const [completed, setCompleted] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nowIso = useMemo(() => new Date().toISOString(), []);

  type RepoTodo = AppRecord & {
    type: 'todo';
    space_id?: string | null;
    status?: 'active' | 'completed' | 'archived';
    carry_forward?: boolean;
    due_date?: string | null;
  };

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setCompleted(0);
      setRemaining(0);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      let merged: TodayMergedEntry[] = [];
      if (typeof repo.listTodayMerged === 'function') {
        merged = await repo.listTodayMerged(nowIso);
      } else {
        // Fallback to existing v2 behavior: listDueToday() only returns todos
        const due = await repo.listDueToday(nowIso);
        merged = (due || [])
          .filter((record): record is RepoTodo => record.type === 'todo')
          .map((todo) => ({
            type: 'todo',
            id: todo.id,
            name: todo.name,
            due_date: todo.due_date,
            due_day: todo.due_date ? new Date(todo.due_date).toISOString().split('T')[0] : null,
            space_id: todo.space_id ?? null,
            status: (todo.status ?? 'active') as 'active' | 'completed' | 'archived',
            carry_forward: !!todo.carry_forward,
            overdue: false,
            nearDue: false,
          })) as TodayMergedEntry[];
      }

      setItems(merged);

      // Summary
      if (typeof repo.getTodaySummary === 'function') {
        const summary = await repo.getTodaySummary();
        setCompleted(summary.completed || 0);
        setRemaining(summary.remaining || 0);
      } else {
        // Fallback heuristic for v2: all todos shown are remaining; completed=0
        const todoCount = merged.filter((m) => m.type === 'todo').length;
        setCompleted(0);
        setRemaining(todoCount);
      }

      setLoading(false);
      setError(null);
    } catch (error: unknown) {
      setLoading(false);
      const message = error instanceof Error ? error.message : 'Failed to load Today entries';
      setError(message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, repo, nowIso]);

  // Auto-reload on relevant events
  useEffect(() => {
    if (!env.feature.today.v3) return;

    const unsub: Array<() => void> = [];
    unsub.push(eventBus.on('ItemSaved', () => void load()));
    unsub.push(eventBus.on('ItemUpdated', () => void load()));
    unsub.push(eventBus.on('ItemCompleted', () => void load()));
    return () => unsub.forEach((u) => u());
  }, [load]);

  // Initial load
  useEffect(() => {
    const timeout = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timeout);
  }, [load]);

  return {
    items,
    completed,
    remaining,
    loading,
    error,
    reload: load,
  };
}
