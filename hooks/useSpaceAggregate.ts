import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppRecord, Space, SpaceChat } from '../lib/types';
import { startOfWeek, addDays, formatISO } from 'date-fns';
import useSpaceTimeline from './useSpaceTimeline';
import { inferSpaceIntent, type SpaceIntent } from '../lib/ai/spaceIntent';
import { useRepo } from '../providers/RepoProvider';
import { useAuth } from '../providers/AuthProvider';
import { SupabaseSpaceChatRepo } from '../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../lib/repo/memory';
import { supabase } from '../lib/supabase/client';
import { eventBus } from '../lib/events/EventBus';

export type SpaceAggregate = {
  space: Space | null;
  chats: SpaceChat[];
  items: AppRecord[];
  stats: {
    habitsCompletedThisWeek: number;
    habitsTotalThisWeek: number;
    todosOpen: number;
    notesAddedThisWeek: number;
    chatsActive: number;
    completionPct: number; // 0..1
    lastVisitAt?: string | null;
  };
  upcoming: Array<{
    id: string;
    type: 'habit' | 'todo' | 'note' | 'event';
    title: string;
    dueAt?: string | null;
    dateLabel?: string;
    progressPct?: number; // optional, 0..1 when relevant (e.g., checklists)
  }>;
  intent: SpaceIntent;
  counts: { habits: number; todosOpen: number; notes: number; chats: number };
  nextItem: {
    id: string;
    type: 'todo' | 'note' | 'event';
    title: string;
    dueAt?: string | null;
    dateLabel?: string;
  } | null;
  weekly: {
    weekStartISO: string;
    habits: Array<{
      id: string;
      title: string;
      doneCount: number;
      target: number;
      dayStreak: number; // simple within-week consecutive-day streak
      dayFlags: boolean[]; // 7 booleans for Mon-Sun, true = completed
    }>;
  };
  reload: () => Promise<void>;
};

function startOfWindow(daysBack = 7): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - daysBack * 24 * 60 * 60 * 1000;
}

export function useSpaceAggregate(spaceId: string): SpaceAggregate {
  const repo = useRepo();
  const { user } = useAuth();
  const backend = (process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory').toLowerCase();

  const chatRepo = useMemo(() => {
    if (backend === 'supabase') return new SupabaseSpaceChatRepo(user?.id);
    return new MemorySpaceChatRepo(user?.id || 'memory-user');
  }, [backend, user?.id]);

  const [space, setSpace] = useState<Space | null>(null);
  const [items, setItems] = useState<AppRecord[]>([]);
  const [chats, setChats] = useState<SpaceChat[]>([]);
  const { days: timelineDays } = useSpaceTimeline(spaceId);

  const reloadingRef = useRef(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const computeStats = useCallback((all: AppRecord[], chatsList: SpaceChat[]) => {
    const now = Date.now();
    const windowStart = startOfWindow(7);

    const habits = all.filter((r) => r.type === 'habit');
    const todos = all.filter((r) => r.type === 'todo');
    const notes = all.filter((r) => r.type === 'note');

    // TODO(Phase 6): If/when habit completions are modeled per date, compute real values.
    // Guards: fall back to simple counts so UI remains stable.
    const habitsTotalThisWeek = Math.max(0, habits.length);
    const habitsCompletedThisWeek = 0; // Placeholder until per-day completion modeling exists

    const openTodos = todos.filter((t: any) => !t.completed_at).length;
    const completedTodos = todos.filter(
      (t: any) => !!t.completed_at && new Date(t.completed_at).getTime() >= windowStart,
    ).length;

    const notesAddedThisWeek = notes.filter(
      (n) => new Date(n.created_at).getTime() >= windowStart,
    ).length;

    const chatsActive = chatsList.length; // or refine by recent messages later

    // Progress math refinement: use available signals only; clamp to [0,1]
    const denom = Math.max(0, habitsTotalThisWeek + openTodos);
    const numer = Math.max(0, habitsCompletedThisWeek + completedTodos);
    const completionPct = denom > 0 ? Math.max(0, Math.min(1, numer / denom)) : 0;

    return {
      habitsCompletedThisWeek,
      habitsTotalThisWeek,
      todosOpen: openTodos,
      notesAddedThisWeek,
      chatsActive,
      completionPct,
      lastVisitAt: null, // TODO: wire to space_meta or local memory
    };
  }, []);

  // Phase 6: Simple date label helper for upcoming items
  const formatUpcomingLabel = (iso?: string | null): string | undefined => {
    if (!iso) return undefined;
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const isTomorrow =
        d.getFullYear() === tomorrow.getFullYear() &&
        d.getMonth() === tomorrow.getMonth() &&
        d.getDate() === tomorrow.getDate();

      // Show time when same day or tomorrow, else abbreviated date
      if (sameDay) {
        return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      }
      if (isTomorrow) {
        return `Tomorrow ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      }
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return undefined;
    }
  };

  const buildUpcoming = useCallback((all: AppRecord[]) => {
    const candidates: Array<{
      id: string;
      type: 'habit' | 'todo' | 'note' | 'event';
      title: string;
      dueAt?: string | null;
      dateLabel?: string;
      progressPct?: number;
    }> = [];

    for (const item of all) {
      if (item.type === 'todo') {
        const t: any = item;
        if (t.due_date) {
          const dueAt = t.due_time ? `${t.due_date}T${t.due_time}:00` : t.due_date;
          candidates.push({
            id: t.id,
            type: 'todo',
            title: t.title || t.name,
            dueAt,
            dateLabel: formatUpcomingLabel(dueAt),
          });
        }
      }
      // Future: include habits with next check-in and notes with reminders
    }

    candidates.sort((a, b) => {
      const at = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bt = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return at - bt;
    });

    // Only return top 3 for preview
    return candidates.slice(0, 3);
  }, []);

  // Compute nextItem = earliest dated item (todo/note/event)
  const computeNextItem = useCallback((all: AppRecord[]) => {
    type Dated = {
      id: string;
      type: 'todo' | 'note' | 'event';
      title: string;
      dueAt?: string | null;
      ts: number;
    };
    const out: Dated[] = [];
    for (const item of all) {
      if (item.type === 'todo') {
        const t: any = item;
        const dueAt = t.due_date
          ? t.due_time
            ? `${t.due_date}T${t.due_time}:00`
            : t.due_date
          : null;
        if (dueAt) {
          const ts = new Date(dueAt).getTime();
          if (!Number.isNaN(ts))
            out.push({ id: t.id, type: 'todo', title: t.title || t.name, dueAt, ts });
        }
      } else if (item.type === 'note') {
        const n: any = item;
        const dateIso = n.date || null;
        if (dateIso) {
          const ts = new Date(dateIso).getTime();
          if (!Number.isNaN(ts))
            out.push({ id: n.id, type: 'note', title: n.title || 'Note', dueAt: dateIso, ts });
        }
      }
      // events not modeled yet
    }

    if (out.length === 0) return null;

    const now = Date.now();
    const future = out.filter((d) => d.ts >= now);
    const pool = future.length > 0 ? future : out;
    pool.sort((a, b) => a.ts - b.ts);
    const next = pool[0];
    return {
      id: next.id,
      type: next.type,
      title: next.title,
      dueAt: next.dueAt,
      dateLabel: formatUpcomingLabel(next.dueAt || undefined),
    } as const;
  }, []);

  const reload = useCallback(async () => {
    if (!spaceId || reloadingRef.current) return;
    reloadingRef.current = true;
    try {
      const [sp, flat, cs] = await Promise.all([
        repo.getSpaceById(spaceId),
        repo.listBySpace(spaceId),
        chatRepo.list(spaceId),
      ]);
      setSpace(sp);
      setItems(Array.isArray(flat) ? flat : []);
      setChats(Array.isArray(cs) ? cs : []);
    } catch (err) {
      console.error('[useSpaceAggregate] reload failed:', err);
    } finally {
      reloadingRef.current = false;
    }
  }, [spaceId, repo, chatRepo]);

  // Initial load
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // Realtime subscriptions (Supabase only)
  useEffect(() => {
    if (backend !== 'supabase' || !spaceId) return;

    const scheduleReload = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => reload(), 300);
    };

    const channel = supabase
      .channel(`space-${spaceId}-agg`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'habits', filter: `space_id=eq.${spaceId}` },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos', filter: `space_id=eq.${spaceId}` },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `space_id=eq.${spaceId}` },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'space_chats', filter: `space_id=eq.${spaceId}` },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'space_chat_messages',
          filter: `space_id=eq.${spaceId}`,
        },
        scheduleReload,
      )
      .subscribe((status) => {
        if (__DEV__) console.log('[useSpaceAggregate] channel status:', status);
      });

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [backend, spaceId, reload]);

  // Optimistic updates via EventBus (faster than realtime)
  useEffect(() => {
    if (!spaceId) return;

    const handleEntityCreated = (payload: { spaceId?: string | null; type?: string }) => {
      const entitySpaceId = payload?.spaceId;

      if (__DEV__) {
        console.log('[useSpaceAggregate] entity:created received', {
          entitySpaceId,
          currentSpaceId: spaceId,
          type: payload?.type,
        });
      }

      // Reload if spaceIds match OR if entitySpaceId is unknown
      if (entitySpaceId === spaceId || !entitySpaceId) {
        if (__DEV__) {
          console.log('[useSpaceAggregate] Triggering reload for space', spaceId);
        }
        reload();
      }
    };

    const handleEntityDeleted = (payload: {
      spaceId?: string | null;
      id?: string;
      type?: string;
    }) => {
      const entitySpaceId = payload?.spaceId;
      if (__DEV__) {
        console.log('[useSpaceAggregate] entity:deleted received', {
          entitySpaceId,
          currentSpaceId: spaceId,
          id: payload?.id,
          type: payload?.type,
        });
      }
      if (entitySpaceId === spaceId || !entitySpaceId) {
        if (__DEV__) {
          console.log('[useSpaceAggregate] entity:deleted - Triggering reload');
        }
        reload();
      }
    };

    const handleItemCompleted = (payload: { id: string; type: 'habit' | 'todo' }) => {
      if (__DEV__) {
        console.log('[useSpaceAggregate] ItemCompleted received', {
          id: payload.id,
          type: payload.type,
          currentSpaceId: spaceId,
        });
      }
      // Reload to update completion stats (habits completed, todos completed)
      reload();
    };

    const unsubCreate = eventBus.on('entity:created', handleEntityCreated);
    const unsubDelete = eventBus.on('entity:deleted', handleEntityDeleted);
    const unsubComplete = eventBus.on('ItemCompleted', handleItemCompleted);

    return () => {
      if (typeof unsubCreate === 'function') unsubCreate();
      if (typeof unsubDelete === 'function') unsubDelete();
      if (typeof unsubComplete === 'function') unsubComplete();
    };
  }, [spaceId, reload]);

  const stats = useMemo(() => computeStats(items, chats), [items, chats, computeStats]);
  const upcoming = useMemo(() => buildUpcoming(items), [items, buildUpcoming]);
  const intent = useMemo(() => {
    const habits = items.filter((r) => r.type === 'habit');
    const todos = items.filter((r) => r.type === 'todo');
    const notes = items.filter((r) => r.type === 'note');
    return inferSpaceIntent({ habits, todos, notes, chats });
  }, [items, chats]);
  const counts = useMemo(
    () => ({
      habits: items.filter((r) => r.type === 'habit').length,
      todosOpen: items.filter((r) => r.type === 'todo' && !(r as any).completed_at).length,
      notes: items.filter((r) => r.type === 'note').length,
      chats: chats.length,
    }),
    [items, chats],
  );
  const nextItem = useMemo(() => computeNextItem(items), [items, computeNextItem]);

  // Helper: Calculate weekly target from habit frequency
  const calculateWeeklyTarget = useCallback((habit: any): number => {
    const freq = habit.frequency;
    const freqValue = habit.frequency_value;

    // If frequency_value is a simple number, use it directly as the weekly target
    if (typeof freqValue === 'number' && freqValue > 0) {
      // If frequency is 'weekly', freqValue is the times per week
      if (freq === 'weekly') return freqValue;
      // If frequency is 'daily', freqValue might mean something else - default to 7
      if (freq === 'daily') return 7;
      // For other frequencies, use the number directly
      return freqValue;
    }

    // If frequency_value is an object with explicit target
    if (freqValue && typeof freqValue === 'object') {
      if (freqValue.kind === 'n_per_period' && freqValue.period === 'week') {
        return freqValue.n || 1;
      }
      if (freqValue.kind === 'custom_days' && Array.isArray(freqValue.days)) {
        return freqValue.days.length;
      }
    }

    // Fallback: parse simple frequency string
    if (typeof freq === 'string') {
      // "daily" → 7 times/week
      if (freq === 'daily') return 7;
      // "weekly" → 1 time/week
      if (freq === 'weekly') return 1;
      // "monthly" → ~0.25 times/week (round to 1 for UI)
      if (freq === 'monthly') return 1;
      // Parse "3× this week" pattern from custom freq strings
      const match = freq.match(/(\d+)\s*[×x]/i);
      if (match) return parseInt(match[1], 10);
    }

    // Default fallback
    return 3;
  }, []);

  // Weekly aggregation (Mon–Sun) using timeline days
  const weekly = useMemo(() => {
    const start = startOfWeek(new Date());
    const weekDates = Array.from({ length: 7 }, (_v, i) => addDays(start, i));
    const weekISO = formatISO(start, { representation: 'date' });
    const habits = items.filter((r) => r.type === 'habit');
    const out: Array<{
      id: string;
      title: string;
      doneCount: number;
      target: number;
      dayStreak: number;
      dayFlags: boolean[];
    }> = [];
    for (const h of habits as any[]) {
      // Build done flags for the week by checking timeline days
      const flags = weekDates.map((d) => {
        const iso = formatISO(d, { representation: 'date' });
        const day = (timelineDays || []).find((x: any) => x.dateISO === iso);
        const match = (day?.items || []).find((it: any) => it.type === 'habit' && it.id === h.id);
        return !!match?.done;
      });
      const doneCount = flags.filter(Boolean).length;
      // Simple within-week trailing streak
      let streak = 0;
      for (let i = flags.length - 1; i >= 0; i--) {
        if (flags[i]) streak++;
        else break;
      }
      const target = calculateWeeklyTarget(h);
      out.push({
        id: h.id,
        title: h.title || h.name,
        doneCount,
        target,
        dayStreak: streak,
        dayFlags: flags,
      });
    }
    return { weekStartISO: weekISO, habits: out };
  }, [items, timelineDays, calculateWeeklyTarget]);

  return {
    space,
    chats,
    items,
    stats,
    upcoming,
    intent,
    counts,
    nextItem,
    weekly,
    reload,
  };
}
