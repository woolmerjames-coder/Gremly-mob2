export type OverlaySavedPayload = {
  type: 'habit' | 'todo' | 'note' | 'journal' | 'person';
  id: string;
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
