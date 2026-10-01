import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchOpenQuestions,
  fetchStory,
  fetchUsage,
  type GremlyQuestion,
  type Story,
  type UsageGrain,
  type UsagePeriod,
} from './storyApi';

interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Loads on every focus, so a correction made elsewhere shows on return. */
function useFocusedLoad<T>(load: () => Promise<T>, initial: T): Loadable<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, loading, error, reload };
}

const EMPTY_STORY: Story = { header: { storyForThem: null, writtenAt: null }, items: [] };

export function useStory(): Loadable<Story> {
  return useFocusedLoad(fetchStory, EMPTY_STORY);
}

export function useOpenQuestions(): Loadable<GremlyQuestion[]> {
  return useFocusedLoad(fetchOpenQuestions, [] as GremlyQuestion[]);
}

export function useUsage(grain: UsageGrain): Loadable<UsagePeriod | null> {
  const load = useCallback(() => fetchUsage(grain), [grain]);
  return useFocusedLoad(load, null);
}
