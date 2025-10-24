import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppRecord, Space, SpaceChat } from '../lib/types';
import { useRepo } from '../providers/RepoProvider';
import { useAuth } from '../providers/AuthProvider';
import { SupabaseSpaceChatRepo } from '../lib/repo/supabase';
import { MemorySpaceChatRepo } from '../lib/repo/memory';
import { supabase } from '../lib/supabase/client';

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
  }>;
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

  const reloadingRef = useRef(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const computeStats = useCallback((all: AppRecord[], chatsList: SpaceChat[]) => {
    const now = Date.now();
    const windowStart = startOfWindow(7);

    const habits = all.filter((r) => r.type === 'habit');
    const todos = all.filter((r) => r.type === 'todo');
    const notes = all.filter((r) => r.type === 'note');

    // TODO: If/when habit completions are modeled, compute actuals
    const habitsTotalThisWeek = habits.length;
    const habitsCompletedThisWeek = 0;

    const openTodos = todos.filter((t: any) => !t.completed_at).length;
    const completedTodos = todos.filter(
      (t: any) => !!t.completed_at && new Date(t.completed_at).getTime() >= windowStart,
    ).length;

    const notesAddedThisWeek = notes.filter(
      (n) => new Date(n.created_at).getTime() >= windowStart,
    ).length;

    const chatsActive = chatsList.length; // or refine by recent messages later

    const denom = habitsTotalThisWeek + openTodos;
    const numer = habitsCompletedThisWeek + completedTodos;
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

  const buildUpcoming = useCallback((all: AppRecord[]) => {
    const candidates: Array<{
      id: string;
      type: 'habit' | 'todo' | 'note' | 'event';
      title: string;
      dueAt?: string | null;
      dateLabel?: string;
    }> = [];

    for (const item of all) {
      if (item.type === 'todo') {
        const t: any = item;
        if (t.due_date) {
          candidates.push({ id: t.id, type: 'todo', title: t.title || t.name, dueAt: t.due_date });
        }
      }
      // Future: include habits with next check-in and notes with reminders
    }

    candidates.sort((a, b) => {
      const at = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bt = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return at - bt;
    });

    return candidates.slice(0, 3);
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

  const stats = useMemo(() => computeStats(items, chats), [items, chats, computeStats]);
  const upcoming = useMemo(() => buildUpcoming(items), [items, buildUpcoming]);

  return {
    space,
    chats,
    items,
    stats,
    upcoming,
    reload,
  };
}
