/**
 * Broadcast overlay-closed events so listeners can detect when an overlay
 * is dismissed without saving (cancelled).
 *
 * This complements overlaySaved.ts - together they enable the pattern:
 * - On save → advance (overlaySaved event)
 * - On cancel → stay (overlayClosed event)
 */

export type OverlayClosedPayload = {
  /** The mode the overlay was in when closed */
  mode: 'create' | 'edit' | 'view';
  /** The ID of the record being edited (for edit mode), undefined for create */
  editingId?: string;
  /** Whether the close was due to a save (true) or cancel/dismiss (false) */
  didSave: boolean;
};

type Listener = (payload: OverlayClosedPayload) => void;

const listeners = new Set<Listener>();

export function emitOverlayClosed(payload: OverlayClosedPayload) {
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch (e) {
      // no-op - don't let listener errors break the flow
    }
  }
}

export function addOverlayClosedListener(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
