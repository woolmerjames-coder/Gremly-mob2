/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepo } from '../../../providers/RepoProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { eventBus } from '../../events';
import { env } from '../../env';

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
  completed: number;
  remaining: number;
  loading: boolean;
  error: string | null; // kept for telemetry; UI should not render raw DB errors
  reload: () => Promise<void>;
}

export function useTodayEntries(): TodayEntriesState {
  const repo = useRepo();
  const { user } = useAuth();

  const [items, setItems] = useState<TodayMergedEntry[]>([]);
  const [completed, setCompleted] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  const nowIso = useMemo(() => new Date().toISOString(), []);

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
      const hasV3 = typeof (repo as any).listTodayMerged === 'function';

      if (hasV3) {
        merged = await (repo as any).listTodayMerged(nowIso);
      } else {
        const due = await repo.listDueToday(nowIso);
        merged = (due || [])
          .filter((r) => r.type === 'todo')
          .map((t: any) => ({
            type: 'todo' as const,
            id: t.id,
            name: t.name,
            due_date: t.due_date,
            due_day: t.due_date ? new Date(t.due_date).toISOString().split('T')[0] : null,
            space_id: t.space_id ?? null,
            status: (t.status ?? 'active') as 'active' | 'completed' | 'archived',
            carry_forward: !!t.carry_forward,
            overdue: false,
            nearDue: false,
          })) as TodayMergedEntry[];
      }

      setItems(merged);

      if (typeof (repo as any).getTodaySummary === 'function') {
        const summary = await (repo as any).getTodaySummary();
        setCompleted(summary.completed || 0);
        setRemaining(summary.remaining || 0);
      } else {
        const todoCount = merged.filter((m) => m.type === 'todo').length;
        setCompleted(0);
        setRemaining(todoCount);
      }

      setLoading(false);
      setError(null);
    } catch (e: any) {
      console.error('[useTodayEntries] load failed:', e);
      setItems([]);
      setCompleted(0);
      setRemaining(0);
      setLoading(false);
      setError('load_failed');
    }
  }, [user, repo, nowIso, setError]);

  useEffect(() => {
    if (!env.feature.today.v3) return;

    const unsub: Array<() => void> = [];
    unsub.push(eventBus.on('ItemSaved', () => void load()));
    unsub.push(eventBus.on('ItemUpdated', () => void load()));
    unsub.push(eventBus.on('ItemCompleted', () => void load()));
    return () => unsub.forEach((u) => u());
  }, [load]);

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
    error: null,
    reload: load,
  };
}
