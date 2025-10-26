import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRepo } from '../providers/RepoProvider';
import { useAuth } from '../providers/AuthProvider';

export type Note = {
  id: string;
  user_id: string;
  space_id: string;
  type: 'note' | 'journal';
  title?: string | null;
  content: string;
  date?: string | null;
  created_at: string;
  updated_at: string;
};

export function useSpaceNotes(spaceId: string) {
  const repo = useRepo();
  const { userId } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const list = useCallback(
    async (query?: string) => {
      if (!userId) return;
      try {
        setLoading(true);
        const results = await repo.listNotes(spaceId, { query });
        setNotes(results);
      } catch (error) {
        console.error('[useSpaceNotes] list failed', error);
      } finally {
        setLoading(false);
      }
    },
    [repo, spaceId, userId],
  );

  const create = useCallback(
    async (payload: Partial<Note>): Promise<Note> => {
      if (!userId) throw new Error('No user');
      // Derive title from first line if not provided
      const title =
        payload.title || payload.content?.split('\n')[0]?.trim().slice(0, 60) || 'Untitled';
      const note = await repo.createNote({
        space_id: spaceId,
        user_id: userId,
        type: payload.type || 'note',
        content: payload.content || '',
        date: payload.date || null,
        title,
      });
      setNotes((prev) => [note, ...prev]);
      return note;
    },
    [repo, spaceId, userId],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Note>) => {
      const cleanPatch: Partial<{ content: string; title: string; date: string | null }> = {};
      if (patch.content !== undefined) cleanPatch.content = patch.content;
      if (patch.title !== undefined && patch.title !== null) cleanPatch.title = patch.title;
      if (patch.date !== undefined) cleanPatch.date = patch.date;

      await repo.updateNote(id, cleanPatch);
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                ...patch,
                title: patch.title || patch.content?.split('\n')[0]?.trim().slice(0, 60) || n.title,
                updated_at: new Date().toISOString(),
              }
            : n,
        ),
      );
    },
    [repo],
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    },
    [repo],
  );

  useEffect(() => {
    list();
  }, [list]);

  // Realtime subscription
  useEffect(() => {
    if (!userId) return;
    const channel = repo.subscribeToNotes?.(spaceId, (payload: any) => {
      if (payload.eventType === 'INSERT') {
        setNotes((prev) => [payload.new as Note, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        setNotes((prev) => prev.map((n) => (n.id === payload.new.id ? payload.new : n)));
      } else if (payload.eventType === 'DELETE') {
        setNotes((prev) => prev.filter((n) => n.id !== payload.old.id));
      }
    });
    return () => {
      channel?.unsubscribe();
    };
  }, [repo, spaceId, userId]);

  const journals = notes.filter((n) => n.type === 'journal');
  const lists: Note[] = []; // Placeholder for future list support

  // Total count for badge: notes + journals + lists
  const totalCount = useMemo(
    () => notes.length + journals.length + lists.length,
    [notes.length, journals.length, lists.length],
  );

  return {
    notes,
    journals,
    lists,
    totalCount,
    list,
    create,
    update,
    remove,
    loading,
  };
}
