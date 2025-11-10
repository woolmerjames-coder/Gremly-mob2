import { useEffect, useState, useCallback } from 'react';
import { useRepo } from '../../../providers/RepoProvider';
import { eventBus } from '../../events';

export interface CommitmentItem {
  id: string;
  type: 'habit' | 'todo';
  name: string;
  commitment_started_at?: string | null;
  commitment_note?: string | null;
}

export function useCommitments(enabled: boolean) {
  const repo = useRepo();
  const [items, setItems] = useState<CommitmentItem[]>([]);
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = (await repo.listCommitments()) as CommitmentItem[];
      setItems(list);
    } catch (e) {
      if (__DEV__) console.warn('[useCommitments] load failed', e);
    }
  }, [repo, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    const unsub = eventBus.on('CommitmentsChanged', () => {
      void load();
    });
    return () => unsub();
  }, [enabled, load]);

  return { items: enabled ? items : [], reload: load };
}
