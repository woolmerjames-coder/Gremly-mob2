/**
 * Gremly's questions about Worlds and Chapters for the Worlds home (stage 3):
 * the one that waits above the box, and the welcome back. Read each time
 * Worlds comes into view; an answered one leaves straight away, and comes
 * back if its Undo is tapped.
 */
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useGremlyStore } from '../store/useGremlyStore';
import { fetchWorldsQuestions, welcomeBack, worldsAsk, type WorldsQuestion } from './questions';

export function useWorldsQuestions(today: string) {
  const chapters = useGremlyStore((s) => s.chapters);
  const [open, setOpen] = useState<WorldsQuestion[]>([]);

  const refresh = useCallback(async () => {
    try {
      setOpen(await fetchWorldsQuestions());
    } catch (err) {
      console.warn('[Worlds] questions could not be read:', err);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const ask = useMemo(
    () => worldsAsk(open, { day: today, chapters: chapters ?? [] }),
    [open, today, chapters],
  );
  const away = useMemo(() => welcomeBack(open, chapters ?? []), [open, chapters]);

  /** Answered here: out of the list now, without waiting for a read. */
  const drop = useCallback((ids: string[]) => {
    setOpen((list) => list.filter((q) => !ids.includes(q.id)));
  }, []);
  /** Its Undo was tapped: back in the list. */
  const restore = useCallback((qs: WorldsQuestion[]) => {
    setOpen((list) => [...list.filter((q) => !qs.some((x) => x.id === q.id)), ...qs]);
  }, []);

  return { ask, away, refresh, drop, restore };
}
