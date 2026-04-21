import { useCallback } from 'react';
import { useMascotStore } from '../lib/store/useMascotStore';

/**
 * Stable mascot action callbacks for one-shot celebration triggers.
 */
export function useMascotActions() {
  const requestMode = useMascotStore((s) => s.requestMode);

  const celebrate = useCallback(() => {
    requestMode('drop');
  }, [requestMode]);

  const celebrateFed = useCallback(() => {
    requestMode('fed');
  }, [requestMode]);

  return { celebrate, celebrateFed };
}
