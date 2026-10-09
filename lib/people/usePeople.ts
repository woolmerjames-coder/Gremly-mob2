/**
 * Everyone in their life Gremly keeps, read each time the screen comes into
 * view, for the People row on the Worlds home. Null until read; an empty
 * list when it could not be read, so the row stays out of the way.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchChapterPeople, fetchPeople, type PersonListEntry } from './people';

export function usePeople(): PersonListEntry[] | null {
  const [people, setPeople] = useState<PersonListEntry[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchPeople().then(
        (p) => live && setPeople(p),
        (err) => {
          console.warn('[People] could not be read for Worlds:', err);
          if (live) setPeople((p) => p ?? []);
        },
      );
      return () => {
        live = false;
      };
    }, []),
  );
  return people;
}

/** The people the weekly pass linked to a Chapter; empty until read, or when it cannot be. */
export function useChapterPeople(chapterId: string) {
  const [linked, setLinked] = useState<Awaited<ReturnType<typeof fetchChapterPeople>>>([]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchChapterPeople(chapterId).then(
        (p) => live && setLinked(p),
        (err) => console.warn('[People] the Chapter’s people could not be read:', err),
      );
      return () => {
        live = false;
      };
    }, [chapterId]),
  );
  return linked;
}
