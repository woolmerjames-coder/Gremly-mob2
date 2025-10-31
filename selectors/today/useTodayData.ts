import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase/client';
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
      const [{ data: todayRows, error: todayError }, { data: habitRows, error: habitError }] =
        await Promise.all([
          supabase.from('view_today_items').select('*'),
          supabase.from('habits').select('*'),
        ]);

      if (todayError) {
        throw todayError;
      }
      if (habitError) {
        throw habitError;
      }

      const todos = (todayRows ?? []).filter((row) => row.kind === 'todo');
      const habits = habitRows ?? [];
      const merged = mergeTodayData(todos, habits);
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

      const { error } = await supabase.rpc('complete_item', {
        _kind: kind,
        _id: id,
      });

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
