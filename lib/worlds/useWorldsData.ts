/**
 * The rows every Worlds screen reads, and the index of what is filed where,
 * worked out once per change.
 */
import { useMemo } from 'react';
import { useGremlyStore } from '../store/useGremlyStore';
import { useToday } from '../date/useDateService';
import { filedIndex } from './model';

export function useWorldsData() {
  const worlds = useGremlyStore((s) => s.worlds);
  const chapters = useGremlyStore((s) => s.chapters);
  const dropWorldLinks = useGremlyStore((s) => s.dropWorldLinks);
  const dropChapterLinks = useGremlyStore((s) => s.dropChapterLinks);
  const todos = useGremlyStore((s) => s.todos);
  const notes = useGremlyStore((s) => s.notes);
  const habits = useGremlyStore((s) => s.habits);
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  const today = useToday();
  const filed = useMemo(
    () => filedIndex(dropWorldLinks, dropChapterLinks),
    [dropWorldLinks, dropChapterLinks],
  );
  return { worlds, chapters, todos, notes, habits, habitProgress, filed, today };
}

export type WorldsDataView = ReturnType<typeof useWorldsData>;
