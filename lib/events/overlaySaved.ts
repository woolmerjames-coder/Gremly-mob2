// Broadcast overlay-saved events so listeners can refresh themselves after unified overlay submissions
export type OverlaySavedPayload = {
  type: 'habit' | 'todo' | 'note' | 'journal' | 'unsorted' | 'person';
  id: string;
  // Optional saved entity data for optimistic updates (e.g., due_at for todos)
  savedEntity?: {
    due_at?: string | null;
    [key: string]: any;
  };
};

type Listener = (payload: OverlaySavedPayload) => void;

const listeners = new Set<Listener>();

export function emitOverlaySaved(payload: OverlaySavedPayload) {
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch (e) {
      // no-op
    }
  }
}

export function addOverlaySavedListener(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
