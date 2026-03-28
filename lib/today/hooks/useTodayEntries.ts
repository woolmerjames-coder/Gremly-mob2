/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRepo } from '../../../providers/RepoProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { eventBus } from '../../events';
import { env } from '../../env';
import { promptCommitmentReflection } from '../../commitments/reflection';
import { getDateService } from '../../date';

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
  completed_at?: string | null;
  commitment?: boolean;
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
  status?: 'active' | 'completed';
  completed_at?: string | null;
  commitment?: boolean;
};

export type TodayMergedEntry = TodayMergedTodo | TodayMergedHabit;

// ───────────────────────────────────────────────────────────────────────────────
// TodayCompletionSummary - Drives progress bar + completion dots
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Summary of today's completion status for the progress header.
 * Includes only active habits and todos in Today's Focus.
 * Excludes logs and archived items.
 */
export type TodayCompletionSummary = {
  /** Individual items with completion status */
  items: { id: string; isDone: boolean; type: 'habit' | 'todo' }[];
  /** Number of completed items */
  completedCount: number;
  /** Total number of items (habits + todos, no logs) */
  totalCount: number;
};

/**
 * Compute completion summary from today's entries.
 * Use this to drive the TodayProgressHeader component.
 *
 * @param activeItems - Incomplete items for today (from useTodayEntries.items)
 * @param doneItems - Completed items for today (from useTodayEntries.doneItems)
 * @returns TodayCompletionSummary for progress header
 */
export function getTodayCompletionSummary(
  activeItems: TodayMergedEntry[],
  doneItems: TodayMergedEntry[],
): TodayCompletionSummary {
  const items: { id: string; isDone: boolean; type: 'habit' | 'todo' }[] = [];

  // Add done items first (they show as completed dots)
  for (const entry of doneItems) {
    items.push({
      id: entry.id,
      isDone: true,
      type: entry.type,
    });
  }

  // Add active (incomplete) items
  for (const entry of activeItems) {
    items.push({
      id: entry.id,
      isDone: false,
      type: entry.type,
    });
  }

  return {
    items,
    completedCount: doneItems.length,
    totalCount: items.length,
  };
}

export interface TodayEntriesState {
  items: TodayMergedEntry[];
  doneItems: TodayMergedEntry[];
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
  const [doneItems, setDoneItems] = useState<TodayMergedEntry[]>([]);
  const [completed, setCompleted] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const reflectedCommitmentIds = useRef<Set<string>>(new Set());

  const nowIso = useMemo(() => getDateService().now().toISOString(), []);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setDoneItems([]);
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
      let remoteDone: TodayMergedEntry[] = [];
      const hasV3 = typeof (repo as any).listTodayMerged === 'function';
      const dayIso = nowIso.split('T')[0];

      if (hasV3) {
        const result = (await (repo as any).listTodayMerged(nowIso)) as TodayMergedEntry[];
        const isCompleted = (entry: TodayMergedEntry) => {
          if (entry.type === 'todo') {
            if (entry.status === 'completed') return true;
            if (entry.completed_at) {
              const completedDay = getDateService().extractLocalDate(entry.completed_at);
              return completedDay === dayIso;
            }
            return false;
          }
          const target = Math.max(1, entry.target_count ?? 1);
          if (entry.status === 'completed') return true;
          return (entry.progress_today ?? 0) >= target;
        };

        const incomplete = result.filter((entry: TodayMergedEntry) => !isCompleted(entry));
        incomplete.forEach((entry: TodayMergedEntry) => {
          if (entry.commitment === true && !reflectedCommitmentIds.current.has(entry.id)) {
            reflectedCommitmentIds.current.add(entry.id);
            void promptCommitmentReflection(entry.id);
          }
        });

        remoteDone = result.filter((entry: TodayMergedEntry) => isCompleted(entry));
        merged = incomplete;
      } else {
        const due = await repo.listDueToday(nowIso);
        merged = (due || [])
          .filter((r) => r.type === 'todo')
          .map((t: any) => ({
            type: 'todo' as const,
            id: t.id,
            name: t.name,
            due_date: t.due_date,
            due_day: t.due_day ?? null, // Use due_day from DB directly (timezone-safe)
            space_id: t.space_id ?? null,
            status: (t.status ?? 'active') as 'active' | 'completed' | 'archived',
            carry_forward: !!t.carry_forward,
            overdue: false,
            nearDue: false,
          })) as TodayMergedEntry[];
        remoteDone = [];
      }

      setItems(merged);
      setDoneItems(remoteDone);

      if (typeof (repo as any).getTodaySummary === 'function') {
        try {
          const summary = await (repo as any).getTodaySummary();
          setCompleted(summary.completed || 0);
          setRemaining(summary.remaining || 0);
        } catch (summaryError) {
          console.warn('[useTodayEntries] getTodaySummary unavailable, falling back', summaryError);
          const todoCount = merged.filter((m) => m.type === 'todo').length;
          setCompleted(0);
          setRemaining(todoCount);
        }
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
      setDoneItems([]);
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
    doneItems,
    completed,
    remaining,
    loading,
    error: null,
    reload: load,
  };
}
