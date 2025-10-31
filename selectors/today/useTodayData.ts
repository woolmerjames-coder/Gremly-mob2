import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
import { eventBus } from '../../lib/events';
import { mergeTodayData, splitLanes, calcProgress } from './index';
import type { TodayItem, TodayItemKind } from './today.types';

type SetterArg = TodayItem[] | ((prev: TodayItem[]) => TodayItem[]);

export function useTodayData() {
  const [items, setItems] = useState<TodayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  const setItemsWithProgress = useCallback((updater: SetterArg) => {
    setItems((prev) => {
      const next =
        typeof updater === 'function'
          ? (updater as (prev: TodayItem[]) => TodayItem[])(prev)
          : updater;
      setProgress(calcProgress(next));
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [todosResult, rollingResult] = await Promise.all([
        supabase.from('view_today_items').select('*'),
        supabase.rpc('get_rolling_habits'),
      ]);

      if (todosResult.error) {
        throw todosResult.error;
      }
      if (rollingResult.error) {
        throw rollingResult.error;
      }

      const todos = (todosResult.data ?? []).filter((row) => row.kind === 'todo');
      const rollingHabits = rollingResult.data ?? [];
      const merged = mergeTodayData(todos, rollingHabits);
      setItemsWithProgress(merged);
    } catch (error) {
      console.error('[useTodayData] fetch error', error);
    } finally {
      setLoading(false);
    }
  }, [setItemsWithProgress]);

  const completeItem = useCallback(
    async (id: string, kind: TodayItemKind) => {
      setItemsWithProgress((prev) =>
        prev.map((item) =>
          item.id === id && item.kind === kind ? { ...item, completed: true } : item,
        ),
      );

      const { error } =
        kind === 'habit'
          ? await supabase.rpc('complete_habit', { _id: id })
          : await supabase.rpc('complete_item', { _kind: 'todo', _id: id });

      if (error) {
        console.error('[useTodayData] complete_item error', error);
        setItemsWithProgress((prev) =>
          prev.map((item) =>
            item.id === id && item.kind === kind ? { ...item, completed: false } : item,
          ),
        );
        return;
      }

      fetchData();
    },
    [fetchData, setItemsWithProgress],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const unsubscribes = [
      eventBus.on('ItemSaved', () => void fetchData()),
      eventBus.on('ItemCompleted', () => void fetchData()),
      eventBus.on('ItemUpdated', () => void fetchData()),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [fetchData]);

  const lanes = useMemo(() => splitLanes(items), [items]);

  return {
    items,
    left: lanes.left,
    right: lanes.right,
    loading,
    progress,
    completeItem,
    refresh: fetchData,
  };
}
