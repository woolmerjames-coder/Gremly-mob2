import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startOfWeek, addDays, formatISO, isSameDay, parseISO } from 'date-fns';
import { useRepo } from '../providers/RepoProvider';
import { supabase } from '../lib/supabase/client';
import { eventBus } from '../lib/events/EventBus';
import type { AppRecord } from '../lib/types';

export type TimelineItem = {
  id: string;
  type: 'habit' | 'todo' | 'note' | 'event';
  title: string;
  dueAt?: string | null;
  done?: boolean;
};

export type TimelineDay = {
  dateISO: string; // YYYY-MM-DD
  items: TimelineItem[];
};

export type UseSpaceTimeline = {
  days: TimelineDay[];
  next7Days: () => string[];
  reload: () => Promise<void>;
};

function toISODate(dateLike?: string | Date | null): string | null {
  try {
    if (!dateLike) return null;
    const d = typeof dateLike === 'string' ? new Date(dateLike) : dateLike;
    return formatISO(d, { representation: 'date' });
  } catch {
    return null;
  }
}

function safeTitle(rec: AppRecord): string {
  if (rec.type === 'habit') return (rec as any).name || (rec as any).title || 'Habit';
  if (rec.type === 'todo') return (rec as any).name || (rec as any).title || 'To-do';
  // note
  const n = rec as any;
  return n.title || (n.body ? String(n.body).split('\n')[0].slice(0, 80) : 'Note');
}

export function useSpaceTimeline(spaceId: string | null | undefined): UseSpaceTimeline {
  const repo = useRepo();
  const [days, setDays] = useState<TimelineDay[]>([]);
  const reloadingRef = useRef(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const backend = (process.env.EXPO_PUBLIC_REPO_BACKEND || 'memory').toLowerCase();

  const computeWindow = useCallback(() => {
    const start = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return formatISO(d, { representation: 'date' });
    });
  }, []);

  const groupIntoWindow = useCallback(
    (all: AppRecord[], windowDays: string[]): TimelineDay[] => {
      const dayMap = new Map<string, TimelineItem[]>();
      for (const iso of windowDays) dayMap.set(iso, []);

      const push = (iso: string | null, item: TimelineItem) => {
        if (!iso) return;
        if (!dayMap.has(iso)) return;
        dayMap.get(iso)!.push(item);
      };

      for (const rec of all) {
        if ((rec as any)?.space_id !== spaceId) continue;
        if (rec.type === 'todo') {
          const t = rec as any;
          const dueIso = toISODate(t.due_date || null);
          const createdIso = toISODate(t.created_at);
          const placeIso = dueIso || createdIso; // prefer due date, fallback to created
          const dueAt = t.due_date
            ? t.due_time
              ? `${t.due_date}T${t.due_time}:00`
              : t.due_date
            : null;
          push(placeIso, {
            id: t.id,
            type: 'todo',
            title: safeTitle(rec),
            dueAt,
            done: !!(t as any).completed_at,
          });
        } else if (rec.type === 'habit') {
          const h = rec as any;
          // Habits aren't date-specific yet; show on each day with done=true if completed_at falls on that day
          for (const iso of windowDays) {
            const completedAt = h.completed_at ? new Date(h.completed_at) : null;
            const done = completedAt ? isSameDay(completedAt, parseISO(iso)) : false;
            dayMap.get(iso)!.push({ id: h.id, type: 'habit', title: safeTitle(rec), done });
          }
        } else if (rec.type === 'note') {
          const n = rec as any;
          // Journal notes can have explicit date, else use created_at
          const noteIso = toISODate(n.date || n.created_at);
          push(noteIso, { id: n.id, type: 'note', title: safeTitle(rec) });
        }
      }

      // Sort items per day by dueAt or created_at fallback via id stable order
      const out: TimelineDay[] = windowDays.map((iso) => ({
        dateISO: iso,
        items: dayMap.get(iso)!,
      }));
      return out;
    },
    [spaceId],
  );

  const reload = useCallback(async () => {
    if (!spaceId || reloadingRef.current) return;
    reloadingRef.current = true;
    try {
      const [all] = await Promise.all([repo.listBySpace(spaceId)]);
      const windowDays = computeWindow();
      setDays(groupIntoWindow(all || [], windowDays));
    } catch (e) {
      if (__DEV__) console.warn('[useSpaceTimeline] reload failed', e);
      setDays(computeWindow().map((d) => ({ dateISO: d, items: [] })));
    } finally {
      reloadingRef.current = false;
    }
  }, [spaceId, repo, computeWindow, groupIntoWindow]);

  // initial load
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // realtime updates (Supabase only)
  useEffect(() => {
    if (backend !== 'supabase' || !spaceId) return;

    const scheduleReload = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => reload(), 250);
    };

    const channel = supabase
      .channel(`space-${spaceId}-timeline`)
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
      .subscribe((status) => {
        if (__DEV__) console.log('[useSpaceTimeline] channel status:', status);
      });

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      supabase.removeChannel(channel);
    };
  }, [backend, spaceId, reload]);

  // Optimistic updates via EventBus (faster than realtime)
  useEffect(() => {
    if (!spaceId) return;

    const handleEntityCreated = ({ entity, type, spaceId: entitySpaceId }: any) => {
      if (__DEV__) {
        console.log('[useSpaceTimeline] entity:created received', {
          entitySpaceId,
          currentSpaceId: spaceId,
          type,
          entityId: entity?.id,
        });
      }
      // Reload if:
      // 1. entitySpaceId matches this space, OR
      // 2. entitySpaceId is null/undefined (assume it might belong here)
      if (entitySpaceId !== spaceId && entitySpaceId != null) {
        if (__DEV__) console.log('[useSpaceTimeline] Skipping - different space');
        return;
      }

      // Trigger immediate reload
      if (__DEV__) console.log('[useSpaceTimeline] Triggering reload for space', spaceId);
      reload();
    };

    const unsub = eventBus.on('entity:created', handleEntityCreated);
    return () => unsub();
  }, [spaceId, reload]);

  const next7Days = useCallback(() => {
    // Start today forward 7 days
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return formatISO(d, { representation: 'date' });
    });
  }, []);

  return {
    days,
    next7Days,
    reload,
  };
}

export default useSpaceTimeline;
